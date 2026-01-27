import { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';
import type { Container } from '@/lib/container';
import { createRoute } from '@/lib/openapi';
import type { AuthUser } from '@/middleware/auth';
import {
  ErrorSchema,
  TransactionFiltersSchema,
  TransactionResponseSchema,
  TransactionSummaryResponseSchema,
  TransactionsResponseSchema,
  UpdateTransactionSchema,
} from '@/schemas';

type TransactionRouterEnv = {
  Variables: {
    user: AuthUser;
    container: Container;
  };
};

/**
 * Transaction router with OpenAPI documentation
 */
export const createTransactionRouter = () => {
  const router = new OpenAPIHono<TransactionRouterEnv>();

  // Get all transactions with filters
  const getTransactionsRoute = createRoute({
    method: 'get',
    path: '/',
    summary: 'Get all transactions',
    description: 'Retrieve all transactions for the authenticated user with optional filters',
    tags: ['Transactions'],
    security: [{ Bearer: [] }],
    request: {
      query: TransactionFiltersSchema,
    },
    responses: {
      200: {
        description: 'List of transactions',
        content: {
          'application/json': {
            schema: TransactionsResponseSchema,
          },
        },
      },
      401: {
        description: 'Unauthorized',
        content: {
          'application/json': {
            schema: ErrorSchema,
          },
        },
      },
    },
  });

  router.openapi(getTransactionsRoute, async (c) => {
    const container = c.get('container');
    const user = c.get('user');
    const query = c.req.valid('query');

    const { limit, offset, ...filters } = query;

    // Convert date strings to Date objects for repository
    const repoFilters = {
      ...filters,
      startDate: filters.startDate ? new Date(filters.startDate) : undefined,
      endDate: filters.endDate ? new Date(filters.endDate) : undefined,
    };

    const [transactions, total] = await Promise.all([
      container.transactionRepo.findAllForUser(user.id, repoFilters, limit, offset),
      container.transactionRepo.countForUser(user.id, repoFilters),
    ]);

    const transactionsWithStringDates = transactions.map((txn) => ({
      ...txn,
      type: txn.type as 'debit' | 'credit',
      transactionDate: txn.transactionDate?.toISOString() || null,
      createdAt: txn.createdAt.toISOString(),
      updatedAt: txn.updatedAt.toISOString(),
    }));

    return c.json(
      {
        transactions: transactionsWithStringDates,
        total,
        limit,
        offset,
      },
      200 as const
    );
  });

  // Get transaction summary
  const getTransactionSummaryRoute = createRoute({
    method: 'get',
    path: '/summary',
    summary: 'Get transaction summary',
    description: 'Get summary statistics (total debit, credit, count) for the user',
    tags: ['Transactions'],
    security: [{ Bearer: [] }],
    request: {
      query: z.object({
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
      }),
    },
    responses: {
      200: {
        description: 'Transaction summary',
        content: {
          'application/json': {
            schema: TransactionSummaryResponseSchema,
          },
        },
      },
      401: {
        description: 'Unauthorized',
        content: {
          'application/json': {
            schema: ErrorSchema,
          },
        },
      },
    },
  });

  router.openapi(getTransactionSummaryRoute, async (c) => {
    const container = c.get('container');
    const user = c.get('user');
    const query = c.req.valid('query');

    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;

    const summary = await container.transactionRepo.getSummaryForUser(user.id, startDate, endDate);

    return c.json(
      {
        summary: {
          ...summary,
          netAmount: summary.totalCredit - summary.totalDebit,
        },
      },
      200 as const
    );
  });

  // Get transaction by ID
  const getTransactionRoute = createRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get transaction by ID',
    description: 'Retrieve a specific transaction by its ID',
    tags: ['Transactions'],
    security: [{ Bearer: [] }],
    request: {
      params: z.object({
        id: z.string().describe('Transaction ID'),
      }),
    },
    responses: {
      200: {
        description: 'Transaction details',
        content: {
          'application/json': {
            schema: TransactionResponseSchema,
          },
        },
      },
      404: {
        description: 'Transaction not found',
        content: {
          'application/json': {
            schema: ErrorSchema,
          },
        },
      },
      401: {
        description: 'Unauthorized',
        content: {
          'application/json': {
            schema: ErrorSchema,
          },
        },
      },
    },
  });

  router.openapi(getTransactionRoute, async (c) => {
    const container = c.get('container');
    const user = c.get('user');
    const { id } = c.req.valid('param');

    const transaction = await container.transactionRepo.findByIdWithCategory(id);

    if (!transaction || transaction.userId !== user.id) {
      return c.json({ error: 'Transaction not found' }, 404 as const);
    }

    const transactionWithStringDates = {
      ...transaction,
      type: transaction.type as 'debit' | 'credit',
      transactionDate: transaction.transactionDate?.toISOString() || null,
      createdAt: transaction.createdAt.toISOString(),
      updatedAt: transaction.updatedAt.toISOString(),
    };

    return c.json({ transaction: transactionWithStringDates }, 200 as const);
  });

  // Update transaction
  const updateTransactionRoute = createRoute({
    method: 'patch',
    path: '/{id}',
    summary: 'Update transaction',
    description: 'Update transaction details (category, merchant, remarks)',
    tags: ['Transactions'],
    security: [{ Bearer: [] }],
    request: {
      params: z.object({
        id: z.string().describe('Transaction ID'),
      }),
      body: {
        content: {
          'application/json': {
            schema: UpdateTransactionSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Transaction updated successfully',
        content: {
          'application/json': {
            schema: TransactionResponseSchema,
          },
        },
      },
      404: {
        description: 'Transaction not found',
        content: {
          'application/json': {
            schema: ErrorSchema,
          },
        },
      },
      401: {
        description: 'Unauthorized',
        content: {
          'application/json': {
            schema: ErrorSchema,
          },
        },
      },
    },
  });

  router.openapi(updateTransactionRoute, async (c) => {
    const container = c.get('container');
    const user = c.get('user');
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');

    // Convert transactionDate string to Date if provided
    const updateData = {
      ...body,
      transactionDate: body.transactionDate ? new Date(body.transactionDate) : undefined,
    };

    const transaction = await container.transactionRepo.update(id, user.id, updateData);

    if (!transaction) {
      return c.json({ error: 'Transaction not found' }, 404 as const);
    }

    // Fetch with category info
    const transactionWithCategory = await container.transactionRepo.findByIdWithCategory(id);
    if (!transactionWithCategory) {
      return c.json({ error: 'Transaction not found' }, 404 as const);
    }

    const transactionWithStringDates = {
      ...transactionWithCategory,
      type: transactionWithCategory.type as 'debit' | 'credit',
      transactionDate: transactionWithCategory.transactionDate?.toISOString() ?? null,
      createdAt: transactionWithCategory.createdAt.toISOString(),
      updatedAt: transactionWithCategory.updatedAt.toISOString(),
    };

    return c.json({ transaction: transactionWithStringDates }, 200 as const);
  });

  // Delete transaction
  const deleteTransactionRoute = createRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete transaction',
    description: 'Delete a transaction by ID',
    tags: ['Transactions'],
    security: [{ Bearer: [] }],
    request: {
      params: z.object({
        id: z.string().describe('Transaction ID'),
      }),
    },
    responses: {
      200: {
        description: 'Transaction deleted successfully',
        content: {
          'application/json': {
            schema: z.object({
              message: z.string(),
            }),
          },
        },
      },
      404: {
        description: 'Transaction not found',
        content: {
          'application/json': {
            schema: ErrorSchema,
          },
        },
      },
      401: {
        description: 'Unauthorized',
        content: {
          'application/json': {
            schema: ErrorSchema,
          },
        },
      },
    },
  });

  router.openapi(deleteTransactionRoute, async (c) => {
    const container = c.get('container');
    const user = c.get('user');
    const { id } = c.req.valid('param');

    const deleted = await container.transactionRepo.delete(id, user.id);

    if (!deleted) {
      return c.json({ error: 'Transaction not found' }, 404 as const);
    }

    return c.json({ message: 'Transaction deleted successfully' }, 200 as const);
  });

  return router;
};
