import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { categories, type NewTransaction, type Transaction, transactions } from '@/db/schema';
import { BaseRepository } from './base.repository';

export interface TransactionFilters {
  categoryId?: string;
  type?: 'debit' | 'credit';
  startDate?: Date;
  endDate?: Date;
  minAmount?: number;
  maxAmount?: number;
}

export interface TransactionWithCategory extends Transaction {
  category: { id: string; name: string; icon: string | null } | null;
}

export class TransactionRepository extends BaseRepository {
  /**
   * Find all transactions for a user with optional filters
   */
  async findAllForUser(
    userId: string,
    filters?: TransactionFilters,
    limit = 50,
    offset = 0
  ): Promise<TransactionWithCategory[]> {
    const conditions = [eq(transactions.userId, userId)];

    if (filters?.categoryId) {
      conditions.push(eq(transactions.categoryId, filters.categoryId));
    }

    if (filters?.type) {
      conditions.push(eq(transactions.type, filters.type));
    }

    if (filters?.startDate) {
      conditions.push(gte(transactions.transactionDate, filters.startDate));
    }

    if (filters?.endDate) {
      conditions.push(lte(transactions.transactionDate, filters.endDate));
    }

    if (filters?.minAmount !== undefined) {
      conditions.push(gte(transactions.amount, filters.minAmount.toString()));
    }

    if (filters?.maxAmount !== undefined) {
      conditions.push(lte(transactions.amount, filters.maxAmount.toString()));
    }

    const result = await this.db
      .select({
        id: transactions.id,
        userId: transactions.userId,
        categoryId: transactions.categoryId,
        amount: transactions.amount,
        type: transactions.type,
        currency: transactions.currency,
        merchant: transactions.merchant,
        accountNumber: transactions.accountNumber,
        bankName: transactions.bankName,
        transactionDate: transactions.transactionDate,
        remarks: transactions.remarks,
        emailId: transactions.emailId,
        rawEmailContent: transactions.rawEmailContent,
        aiConfidence: transactions.aiConfidence,
        aiExtractedData: transactions.aiExtractedData,
        createdAt: transactions.createdAt,
        updatedAt: transactions.updatedAt,
        category: {
          id: categories.id,
          name: categories.name,
          icon: categories.icon,
        },
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(...conditions))
      .orderBy(desc(transactions.transactionDate), desc(transactions.createdAt))
      .limit(limit)
      .offset(offset);

    return result as TransactionWithCategory[];
  }

  /**
   * Find a transaction by ID
   */
  async findById(id: string): Promise<Transaction | null> {
    const result = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, id))
      .limit(1);
    return result[0] || null;
  }

  /**
   * Find a transaction by ID with category info
   */
  async findByIdWithCategory(id: string): Promise<TransactionWithCategory | null> {
    const result = await this.db
      .select({
        id: transactions.id,
        userId: transactions.userId,
        categoryId: transactions.categoryId,
        amount: transactions.amount,
        type: transactions.type,
        currency: transactions.currency,
        merchant: transactions.merchant,
        accountNumber: transactions.accountNumber,
        bankName: transactions.bankName,
        transactionDate: transactions.transactionDate,
        remarks: transactions.remarks,
        emailId: transactions.emailId,
        rawEmailContent: transactions.rawEmailContent,
        aiConfidence: transactions.aiConfidence,
        aiExtractedData: transactions.aiExtractedData,
        createdAt: transactions.createdAt,
        updatedAt: transactions.updatedAt,
        category: {
          id: categories.id,
          name: categories.name,
          icon: categories.icon,
        },
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(eq(transactions.id, id))
      .limit(1);

    return (result[0] as TransactionWithCategory) || null;
  }

  /**
   * Find a transaction by email ID (for duplicate detection)
   */
  async findByEmailId(emailId: string): Promise<Transaction | null> {
    const result = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.emailId, emailId))
      .limit(1);
    return result[0] || null;
  }

  /**
   * Create a new transaction
   */
  async create(data: NewTransaction): Promise<Transaction> {
    const result = await this.db.insert(transactions).values(data).returning();
    return result[0];
  }

  /**
   * Update a transaction
   */
  async update(
    id: string,
    userId: string,
    data: Partial<Pick<NewTransaction, 'categoryId' | 'merchant' | 'remarks' | 'transactionDate'>>
  ): Promise<Transaction | null> {
    const result = await this.db
      .update(transactions)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
      .returning();
    return result[0] || null;
  }

  /**
   * Delete a transaction
   */
  async delete(id: string, userId: string): Promise<boolean> {
    const result = await this.db
      .delete(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
      .returning();
    return result.length > 0;
  }

  /**
   * Count transactions for a user with optional filters
   */
  async countForUser(userId: string, filters?: TransactionFilters): Promise<number> {
    const conditions = [eq(transactions.userId, userId)];

    if (filters?.categoryId) {
      conditions.push(eq(transactions.categoryId, filters.categoryId));
    }

    if (filters?.type) {
      conditions.push(eq(transactions.type, filters.type));
    }

    if (filters?.startDate) {
      conditions.push(gte(transactions.transactionDate, filters.startDate));
    }

    if (filters?.endDate) {
      conditions.push(lte(transactions.transactionDate, filters.endDate));
    }

    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(transactions)
      .where(and(...conditions));

    return Number(result[0]?.count || 0);
  }

  /**
   * Get summary statistics for a user
   */
  async getSummaryForUser(
    userId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    totalDebit: number;
    totalCredit: number;
    transactionCount: number;
  }> {
    const conditions = [eq(transactions.userId, userId)];

    if (startDate) {
      conditions.push(gte(transactions.transactionDate, startDate));
    }

    if (endDate) {
      conditions.push(lte(transactions.transactionDate, endDate));
    }

    const result = await this.db
      .select({
        totalDebit: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'debit' THEN ${transactions.amount} ELSE 0 END), 0)`,
        totalCredit: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'credit' THEN ${transactions.amount} ELSE 0 END), 0)`,
        transactionCount: sql<number>`count(*)`,
      })
      .from(transactions)
      .where(and(...conditions));

    return {
      totalDebit: Number.parseFloat(result[0]?.totalDebit || '0'),
      totalCredit: Number.parseFloat(result[0]?.totalCredit || '0'),
      transactionCount: Number(result[0]?.transactionCount || 0),
    };
  }
}
