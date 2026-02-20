import { generateText, Output } from 'ai';
import { fromZonedTime } from 'date-fns-tz';
import { z } from 'zod';
import { getInsightsModel } from '@/lib/ai';
import type { InsightsRepository } from '@/repositories/insights.repository';
import type {
  TransactionRepository,
  TransactionWithCategory,
} from '@/repositories/transaction.repository';

const INSIGHTS_TRANSACTION_LIMIT = 500;

const insightsOutputSchema = z.object({
  content: z
    .string()
    .describe(
      'Financial advice in clean markdown format with proper spacing and formatting. Include: spending patterns, category breakdown, savings tips, and 3-5 actionable recommendations. Be concise and practical.'
    ),
  summary: z
    .object({
      topSpendingCategories: z
        .array(
          z.object({
            category: z.string(),
            amount: z.number(),
            percentage: z.number().optional(),
          })
        )
        .optional()
        .describe('Top spending categories with amounts'),
      savingsSuggestions: z
        .array(z.string())
        .optional()
        .describe('2-4 specific savings suggestions'),
      netFlow: z
        .string()
        .optional()
        .describe('Brief summary of net cash flow (e.g., "Spent 15% more than income")'),
    })
    .optional()
    .describe('Structured summary for display'),
});

export type InsightsOutput = z.infer<typeof insightsOutputSchema>;

export interface InsightsService {
  generateInsights(
    userId: string,
    options: {
      periodStart?: Date;
      periodEnd?: Date;
      timezone?: string;
    }
  ): Promise<{
    id: string;
    content: string;
    summary: unknown;
    periodStart: Date;
    periodEnd: Date;
    createdAt: Date;
  }>;
}

export class InsightsServiceImpl implements InsightsService {
  constructor(
    private readonly transactionRepo: TransactionRepository,
    private readonly insightsRepo: InsightsRepository
  ) {}

  async generateInsights(
    userId: string,
    options: {
      periodStart?: Date;
      periodEnd?: Date;
      timezone?: string;
    } = {}
  ): Promise<{
    id: string;
    content: string;
    summary: unknown;
    periodStart: Date;
    periodEnd: Date;
    createdAt: Date;
  }> {
    const timezone = options.timezone ?? 'Asia/Kathmandu';
    const now = new Date();

    let periodStart: Date;
    let periodEnd: Date;

    if (options.periodStart && options.periodEnd) {
      periodStart = options.periodStart;
      periodEnd = options.periodEnd;
    } else {
      // Default: current month in user's timezone
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
      });
      const [year, month] = formatter
        .format(now)
        .split('-')
        .map((s) => Number.parseInt(s, 10));
      const lastDay = new Date(year, month, 0).getDate();
      periodStart = fromZonedTime(
        `${year}-${String(month).padStart(2, '0')}-01T00:00:00`,
        timezone
      );
      periodEnd = fromZonedTime(
        `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59.999`,
        timezone
      );
    }

    const [transactions, summary] = await Promise.all([
      this.transactionRepo.findAllForUser(
        userId,
        { startDate: periodStart, endDate: periodEnd },
        INSIGHTS_TRANSACTION_LIMIT,
        0
      ),
      this.transactionRepo.getSummaryForUser(userId, periodStart, periodEnd),
    ]);

    if (summary.transactionCount === 0) {
      throw new Error('No transactions in the selected period');
    }

    const prompt = this.buildPrompt(transactions, summary, timezone);
    const model = getInsightsModel();

    console.info('Generating insights...');
    const result = await generateText({
      model,
      output: Output.object({ schema: insightsOutputSchema }),
      system: `You are a helpful financial advisor. Analyze the user's transaction data and provide actionable, personalized financial advice. Be concise, practical, and avoid generic advice. Focus on patterns, opportunities to save, and specific recommendations. Use markdown for formatting.`,
      prompt,
    });

    console.info('Insights generated successfully');

    const output = result.output;
    const insight = await this.insightsRepo.create({
      id: crypto.randomUUID(),
      userId,
      periodStart,
      periodEnd,
      content: output.content,
      summary: output.summary ?? null,
    });

    return {
      id: insight.id,
      content: insight.content,
      summary: insight.summary,
      periodStart: insight.periodStart,
      periodEnd: insight.periodEnd,
      createdAt: insight.createdAt,
    };
  }

  private buildPrompt(
    transactions: TransactionWithCategory[],
    summary: { totalDebit: number; totalCredit: number; transactionCount: number },
    timezone: string
  ): string {
    const netAmount = summary.totalCredit - summary.totalDebit;
    const txnsFormatted = transactions
      .slice(0, 100) // Limit to 100 for prompt size
      .map((t) => {
        const amt = Number.parseFloat(t.amount);
        const sign = t.type === 'debit' ? '-' : '+';
        const cat = t.category?.name ?? 'Uncategorized';
        const date = t.transactionDate
          ? new Date(t.transactionDate).toLocaleDateString('en-IN', { timeZone: timezone })
          : 'N/A';
        return `- ${date} | ${sign}${amt} ${t.currency ?? 'NPR'} | ${t.merchant ?? 'N/A'} | ${cat}`;
      })
      .join('\n');

    const categoryTotals = this.aggregateByCategory(transactions);

    return `## Transaction Summary
- Total debits (spending): ${summary.totalDebit} NPR
- Total credits (income): ${summary.totalCredit} NPR
- Net: ${netAmount} NPR
- Transaction count: ${summary.transactionCount}

## Spending by Category
${Object.entries(categoryTotals)
  .sort(([, a], [, b]) => b - a)
  .map(([cat, amt]) => `- ${cat}: ${amt} NPR`)
  .join('\n')}

## Recent Transactions (sample)
${txnsFormatted}

Sahakari is a bank loan

Based on this data, provide personalized financial advice. Refer to actual numbers when providing advice. Also provide the recommended amount to save and the recommended amount to spend.`;
  }

  private aggregateByCategory(transactions: TransactionWithCategory[]): Record<string, number> {
    const totals: Record<string, number> = {};
    for (const t of transactions) {
      if (t.type !== 'debit') continue;
      const cat = t.category?.name ?? 'Uncategorized';
      const amt = Number.parseFloat(t.amount);
      totals[cat] = (totals[cat] ?? 0) + amt;
    }
    return totals;
  }
}
