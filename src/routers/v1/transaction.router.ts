import { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';
import type { Container } from '@/lib/container';
import { createRoute } from '@/lib/openapi';
import { filterDateToUtc, localToUtc } from '@/lib/timezone';
import type { AuthUser } from '@/middleware/auth';
import {
  CreateTransactionFromSmsSchema,
  CreateTransactionSchema,
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

  // Create manual transaction
  const createTransactionRoute = createRoute({
    method: 'post',
    path: '/',
    summary: 'Create manual transaction',
    description: 'Create a new transaction manually',
    tags: ['Transactions'],
    security: [{ Bearer: [] }],
    request: {
      body: {
        content: {
          'application/json': {
            schema: CreateTransactionSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Transaction created successfully',
        content: {
          'application/json': {
            schema: TransactionResponseSchema,
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
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: ErrorSchema,
          },
        },
      },
    },
  });

  router.openapi(createTransactionRoute, async (c) => {
    const container = c.get('container');
    const user = c.get('user');
    const body = c.req.valid('json');

    // Fetch user timezone for date conversion
    const userRecord = await container.userRepo.findById(user.id);
    const userTimezone = userRecord?.timezone ?? 'Asia/Kathmandu';

    const transactionDate = body.transactionDate
      ? filterDateToUtc(body.transactionDate, userTimezone)
      : new Date();

    const transaction = await container.transactionRepo.create({
      id: crypto.randomUUID(),
      userId: user.id,
      amount: body.amount.toString(),
      type: body.type,
      categoryId: body.categoryId,
      merchant: body.merchant,
      remarks: body.remarks,
      transactionDate,
      currency: 'NPR',
      isAiCreated: false,
    });

    // Fetch with category info
    const transactionWithCategory = await container.transactionRepo.findByIdWithCategory(
      transaction.id
    );

    if (!transactionWithCategory) {
      return c.json({ error: 'Failed to retrieve created transaction' }, 500 as const);
    }

    const transactionWithStringDates = {
      ...transactionWithCategory,
      type: transactionWithCategory.type as 'debit' | 'credit',
      transactionDate: transactionWithCategory.transactionDate?.toISOString() ?? null,
      createdAt: transactionWithCategory.createdAt.toISOString(),
      updatedAt: transactionWithCategory.updatedAt.toISOString(),
    };

    void container.discordService.notifyNewTransaction({
      id: transactionWithCategory.id,
      amount: transactionWithCategory.amount,
      type: transactionWithCategory.type as 'debit' | 'credit',
      merchant: transactionWithCategory.merchant,
      source: 'api',
      category: transactionWithCategory.category?.name ?? null,
      transactionDate: transactionWithCategory.transactionDate?.toISOString() ?? null,
    });

    return c.json({ transaction: transactionWithStringDates }, 201 as const);
  });

  // Create transaction from SMS
  const createTransactionFromSmsRoute = createRoute({
    method: 'post',
    path: '/sms',
    summary: 'Create transaction from SMS',
    description: 'Extract and create a transaction from an SMS message using AI',
    tags: ['Transactions'],
    security: [{ Bearer: [] }],
    request: {
      body: {
        content: {
          'application/json': {
            schema: CreateTransactionFromSmsSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Transaction created successfully from SMS',
        content: {
          'application/json': {
            schema: TransactionResponseSchema,
          },
        },
      },
      400: {
        description: 'Not a transaction or extraction failed',
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
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: ErrorSchema,
          },
        },
      },
    },
  });

  router.openapi(createTransactionFromSmsRoute, async (c) => {
    const container = c.get('container');
    const user = c.get('user');
    const { smsBody, sender } = c.req.valid('json');

    // Fetch available categories
    const categories = await container.categoryRepo.findAllForUser(user.id);
    const categoryInfoForAI = categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      icon: cat.icon,
    }));

    // Extract transaction data
    const extractionResult = await container.transactionExtractor.extractFromSms(
      { body: smsBody, sender },
      categoryInfoForAI
    );

    if (
      !container.transactionExtractor.isValidTransaction(extractionResult) ||
      !extractionResult.transaction
    ) {
      return c.json(
        { error: 'Could not extract valid transaction from SMS', message: 'Not a transaction' },
        400 as const
      );
    }

    const txn = extractionResult.transaction;
    let categoryId = txn.categoryId;

    // Handle new category creation
    if (txn.newCategory) {
      try {
        const newCat = await container.categoryRepo.create({
          id: crypto.randomUUID(),
          userId: user.id,
          name: txn.newCategory.name,
          icon: txn.newCategory.icon,
          isDefault: false,
          isAiCreated: true,
        });
        categoryId = newCat.id;
      } catch (err) {
        console.warn('Failed to create AI category:', err);
        const existing = await container.categoryRepo.findByNameForUser(
          txn.newCategory.name,
          user.id
        );
        if (existing) categoryId = existing.id;
      }
    }

    // Fetch user timezone for date conversion
    const userRecord = await container.userRepo.findById(user.id);
    const userTimezone = userRecord?.timezone ?? 'Asia/Kathmandu';

    // Parse date and convert from user's timezone to UTC
    let transactionDate: Date | null = null;
    if (txn.date) {
      try {
        transactionDate = localToUtc(txn.date, txn.time ?? null, userTimezone);
      } catch {
        console.warn(`Failed to parse SMS transaction date: ${txn.date}`);
      }
    }

    // Save transaction
    const transaction = await container.transactionRepo.create({
      id: crypto.randomUUID(),
      userId: user.id,
      categoryId,
      amount: txn.amount.toString(),
      type: txn.type,
      currency: 'NPR',
      merchant: txn.merchant,
      accountNumber: txn.accountLastFour,
      bankName: txn.bankName,
      transactionDate,
      remarks: txn.remarks,
      aiConfidence: txn.confidence.toString(),
      aiExtractedData: extractionResult,
      isAiCreated: true,
    });

    const transactionWithCategory = await container.transactionRepo.findByIdWithCategory(
      transaction.id
    );

    if (!transactionWithCategory) {
      return c.json({ error: 'Failed to retrieve created transaction' }, 500 as const);
    }

    const resultBody = {
      transaction: {
        ...transactionWithCategory,
        type: transactionWithCategory.type as 'debit' | 'credit',
        transactionDate: transactionWithCategory.transactionDate?.toISOString() ?? null,
        createdAt: transactionWithCategory.createdAt.toISOString(),
        updatedAt: transactionWithCategory.updatedAt.toISOString(),
      },
    };

    void container.discordService.notifyNewTransaction({
      id: transactionWithCategory.id,
      amount: transactionWithCategory.amount,
      type: transactionWithCategory.type as 'debit' | 'credit',
      merchant: transactionWithCategory.merchant,
      source: 'api_sms',
      category: transactionWithCategory.category?.name ?? null,
      transactionDate: transactionWithCategory.transactionDate?.toISOString() ?? null,
    });

    return c.json(resultBody, 201 as const);
  });

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

    const { limit, offset, timezone, ...filters } = query;

    // Fetch user timezone (query param overrides user default)
    const userRecord = await container.userRepo.findById(user.id);
    const tz = timezone ?? userRecord?.timezone ?? 'Asia/Kathmandu';

    // Convert date strings to UTC Date objects using the user's timezone
    const repoFilters = {
      ...filters,
      startDate: filters.startDate ? filterDateToUtc(filters.startDate, tz) : undefined,
      endDate: filters.endDate ? filterDateToUtc(filters.endDate, tz) : undefined,
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
        timezone: z.string().optional().openapi({
          description:
            'IANA timezone identifier (e.g., "Asia/Kathmandu"). Overrides user default timezone for date filter conversion.',
        }),
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

    // Fetch user timezone (query param overrides user default)
    const userRecord = await container.userRepo.findById(user.id);
    const tz = query.timezone ?? userRecord?.timezone ?? 'Asia/Kathmandu';

    const startDate = query.startDate ? filterDateToUtc(query.startDate, tz) : undefined;
    const endDate = query.endDate ? filterDateToUtc(query.endDate, tz) : undefined;

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

    // Fetch user timezone for date conversion
    const userRecord = await container.userRepo.findById(user.id);
    const userTimezone = userRecord?.timezone ?? 'Asia/Kathmandu';

    // Convert transactionDate string to UTC Date if provided
    const updateData = {
      ...body,
      transactionDate: body.transactionDate
        ? filterDateToUtc(body.transactionDate, userTimezone)
        : undefined,
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
