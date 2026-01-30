import { z } from 'zod';

/**
 * Transaction schemas
 * These can be shared with frontend/mobile apps in a monorepo
 */

export const TransactionTypeSchema = z.enum(['debit', 'credit']);
export type TransactionType = z.infer<typeof TransactionTypeSchema>;

/**
 * Represents a transaction row as returned from the DB/repository
 * (Date objects, type as string). Use toTransactionResponse() to convert to API shape.
 */
export type TransactionFromRepo = Omit<
  TransactionWithCategory,
  'type' | 'transactionDate' | 'createdAt' | 'updatedAt'
> & {
  type: string;
  transactionDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Converts a repo transaction (Date fields, type as string) to API response shape.
 */
export function toTransactionResponse<T extends TransactionFromRepo>(
  txn: T
): TransactionWithCategory {
  return {
    ...txn,
    type: txn.type as TransactionType,
    transactionDate: txn.transactionDate?.toISOString() ?? null,
    createdAt: txn.createdAt.toISOString(),
    updatedAt: txn.updatedAt.toISOString(),
  };
}

export const TransactionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  categoryId: z.string().nullable(),
  amount: z.string(), // Stored as numeric in DB, returned as string
  type: TransactionTypeSchema,
  currency: z.string().nullable(),
  merchant: z.string().nullable(),
  accountNumber: z.string().nullable(),
  bankName: z.string().nullable(),
  transactionDate: z.string().datetime().nullable(),
  remarks: z.string().nullable(),
  emailId: z.string().nullable(),
  aiConfidence: z.string().nullable(),
  isAiCreated: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Transaction = z.infer<typeof TransactionSchema>;

// Transaction with category info included
export const TransactionWithCategorySchema = TransactionSchema.extend({
  category: z
    .object({
      id: z.string(),
      name: z.string(),
      icon: z.string().nullable(),
    })
    .nullable(),
});

export type TransactionWithCategory = z.infer<typeof TransactionWithCategorySchema>;

export const CreateTransactionSchema = z.object({
  amount: z.coerce.number().positive(),
  type: TransactionTypeSchema,
  categoryId: z.string().optional(),
  merchant: z.string().max(255).optional(),
  remarks: z.string().max(500).optional(),
  transactionDate: z.string().datetime().optional(),
});

export type CreateTransactionInput = z.infer<typeof CreateTransactionSchema>;

export const CreateTransactionFromSmsSchema = z.object({
  smsBody: z.string().min(10),
  sender: z.string().optional(),
});

export type CreateTransactionFromSmsInput = z.infer<typeof CreateTransactionFromSmsSchema>;

export const UpdateTransactionSchema = z.object({
  categoryId: z.string().optional(),
  merchant: z.string().max(255).optional(),
  remarks: z.string().max(500).optional(),
  transactionDate: z.string().datetime().optional(),
});

export type UpdateTransactionInput = z.infer<typeof UpdateTransactionSchema>;

// Filter schemas for list endpoint
export const TransactionFiltersSchema = z.object({
  categoryId: z.string().optional(),
  type: TransactionTypeSchema.optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  minAmount: z.coerce.number().optional(),
  maxAmount: z.coerce.number().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

export type TransactionFilters = z.infer<typeof TransactionFiltersSchema>;

// Response schemas
export const TransactionResponseSchema = z.object({
  transaction: TransactionWithCategorySchema,
});

export const TransactionsResponseSchema = z.object({
  transactions: z.array(TransactionWithCategorySchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

// Summary response
export const TransactionSummarySchema = z.object({
  totalDebit: z.number(),
  totalCredit: z.number(),
  transactionCount: z.number(),
  netAmount: z.number(),
});

export const TransactionSummaryResponseSchema = z.object({
  summary: TransactionSummarySchema,
});
