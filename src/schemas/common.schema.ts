import { z } from 'zod';

/**
 * Common schemas used across the API
 * These can be shared with frontend/mobile apps in a monorepo
 */

// Error response schema
export const ErrorSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  details: z.unknown().optional(),
});

export type ErrorResponse = z.infer<typeof ErrorSchema>;

// Success response wrapper
export const SuccessSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

export type SuccessResponse = z.infer<typeof SuccessSchema>;

// Pagination schemas
export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1).optional(),
  limit: z.coerce.number().int().positive().max(100).default(50).optional(),
});

export const PaginationMetaSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: z.array(dataSchema),
    meta: PaginationMetaSchema,
  });
