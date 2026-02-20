import { and, desc, eq } from 'drizzle-orm';
import { type FinancialInsight, financialInsights, type NewFinancialInsight } from '@/db/schema';
import { BaseRepository } from './base.repository';

export class InsightsRepository extends BaseRepository {
  async create(data: NewFinancialInsight): Promise<FinancialInsight> {
    const result = await this.db.insert(financialInsights).values(data).returning();
    return result[0];
  }

  async findByUserAndPeriod(
    userId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<FinancialInsight | null> {
    const result = await this.db
      .select()
      .from(financialInsights)
      .where(
        and(
          eq(financialInsights.userId, userId),
          eq(financialInsights.periodStart, periodStart),
          eq(financialInsights.periodEnd, periodEnd)
        )
      )
      .limit(1);
    return result[0] || null;
  }

  async findLatestForUser(userId: string, limit = 10, offset = 0): Promise<FinancialInsight[]> {
    const result = await this.db
      .select()
      .from(financialInsights)
      .where(eq(financialInsights.userId, userId))
      .orderBy(desc(financialInsights.createdAt))
      .limit(limit)
      .offset(offset);
    return result;
  }
}
