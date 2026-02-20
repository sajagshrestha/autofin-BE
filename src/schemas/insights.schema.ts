import { z } from 'zod';

/**
 * Insights schemas for API validation
 */

export const GenerateInsightsQuerySchema = z.object({
  startDate: z.string().datetime().optional().openapi({
    description:
      'Start of period (ISO datetime). Defaults to start of current month in user timezone.',
  }),
  endDate: z.string().datetime().optional().openapi({
    description: 'End of period (ISO datetime). Defaults to end of current month in user timezone.',
  }),
  timezone: z.string().optional().openapi({
    description:
      'IANA timezone (e.g., Asia/Kathmandu). Overrides user default for period calculation.',
  }),
});

export type GenerateInsightsQuery = z.infer<typeof GenerateInsightsQuerySchema>;

export const InsightSummarySchema = z.object({
  topSpendingCategories: z
    .array(
      z.object({
        category: z.string(),
        amount: z.number(),
        percentage: z.number().optional(),
      })
    )
    .optional(),
  savingsSuggestions: z.array(z.string()).optional(),
  netFlow: z.string().optional(),
});

export type InsightSummary = z.infer<typeof InsightSummarySchema>;

export const InsightResponseSchema = z.object({
  id: z.string(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  content: z.string(),
  summary: InsightSummarySchema.nullable(),
  createdAt: z.string().datetime(),
});

export const GenerateInsightsResponseSchema = z.object({
  insight: InsightResponseSchema,
});

export const LatestInsightQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(10).openapi({
    description: 'Maximum number of insights to return',
  }),
  offset: z.coerce.number().min(0).default(0).openapi({
    description: 'Number of insights to skip',
  }),
});

export type LatestInsightQuery = z.infer<typeof LatestInsightQuerySchema>;

export const LatestInsightResponseSchema = z.object({
  insights: z.array(InsightResponseSchema),
});
