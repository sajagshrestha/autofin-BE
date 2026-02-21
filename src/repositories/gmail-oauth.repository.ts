import { and, eq } from 'drizzle-orm';
import { type GmailOAuthToken, gmailOAuthTokens, type NewGmailOAuthToken } from '@/db/schema';
import { BaseRepository } from './base.repository';

export class GmailOAuthRepository extends BaseRepository {
  /**
   * Find token by user ID
   */
  async findByUserId(userId: string): Promise<GmailOAuthToken | null> {
    const result = await this.db
      .select()
      .from(gmailOAuthTokens)
      .where(eq(gmailOAuthTokens.userId, userId))
      .limit(1);
    return result[0] || null;
  }

  /**
   * Find token by email address
   */
  async findByEmailAddress(emailAddress: string): Promise<GmailOAuthToken | null> {
    console.log('findByEmailAddress: Starting query for', emailAddress);
    const startTime = Date.now();

    try {
      // Add a timeout to prevent hanging
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Database query timeout (10s)')), 10000);
      });

      const queryPromise = this.db
        .select()
        .from(gmailOAuthTokens)
        .where(eq(gmailOAuthTokens.emailAddress, emailAddress))
        .limit(1);

      const result = await Promise.race([queryPromise, timeoutPromise]);

      console.log(
        `findByEmailAddress: Query completed in ${Date.now() - startTime}ms, found: ${result.length > 0}`
      );
      return result[0] || null;
    } catch (error) {
      console.error(`findByEmailAddress: Query failed after ${Date.now() - startTime}ms:`, error);
      throw error;
    }
  }

  /**
   * Find token by user ID and email address
   */
  async findByUserIdAndEmail(
    userId: string,
    emailAddress: string
  ): Promise<GmailOAuthToken | null> {
    const result = await this.db
      .select()
      .from(gmailOAuthTokens)
      .where(
        and(eq(gmailOAuthTokens.userId, userId), eq(gmailOAuthTokens.emailAddress, emailAddress))
      )
      .limit(1);
    return result[0] || null;
  }

  /**
   * Create a new OAuth token
   */
  async create(data: NewGmailOAuthToken): Promise<GmailOAuthToken> {
    const result = await this.db.insert(gmailOAuthTokens).values(data).returning();
    return result[0];
  }

  /**
   * Update OAuth token
   */
  async update(
    id: string,
    data: Partial<Omit<NewGmailOAuthToken, 'id' | 'userId' | 'createdAt'>>
  ): Promise<GmailOAuthToken | null> {
    const result = await this.db
      .update(gmailOAuthTokens)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(gmailOAuthTokens.id, id))
      .returning();
    return result[0] || null;
  }

  /**
   * Update token by user ID
   */
  async updateByUserId(
    userId: string,
    data: Partial<Omit<NewGmailOAuthToken, 'id' | 'userId' | 'createdAt'>>
  ): Promise<GmailOAuthToken | null> {
    const result = await this.db
      .update(gmailOAuthTokens)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(gmailOAuthTokens.userId, userId))
      .returning();
    return result[0] || null;
  }

  /**
   * Delete token by ID
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .delete(gmailOAuthTokens)
      .where(eq(gmailOAuthTokens.id, id))
      .returning();
    return result.length > 0;
  }

  /**
   * Delete token by user ID
   */
  async deleteByUserId(userId: string): Promise<boolean> {
    const result = await this.db
      .delete(gmailOAuthTokens)
      .where(eq(gmailOAuthTokens.userId, userId))
      .returning();
    return result.length > 0;
  }

  /**
   * Check if token exists and is not expired
   */
  async isTokenValid(id: string): Promise<boolean> {
    const token = await this.db
      .select()
      .from(gmailOAuthTokens)
      .where(eq(gmailOAuthTokens.id, id))
      .limit(1);

    if (!token[0]) {
      return false;
    }

    // Check if token is expired (with 5 minute buffer)
    const expiresAt = new Date(token[0].expiresAt);
    const now = new Date();
    const buffer = 5 * 60 * 1000; // 5 minutes in milliseconds

    return expiresAt.getTime() > now.getTime() + buffer;
  }

  /**
   * Update history ID by user ID
   * Used to track the last processed Gmail history ID for watch notifications
   */
  async updateHistoryId(userId: string, historyId: string): Promise<void> {
    await this.db
      .update(gmailOAuthTokens)
      .set({ historyId, updatedAt: new Date() })
      .where(eq(gmailOAuthTokens.userId, userId));
  }

  /**
   * Update history ID by email address
   * Used when processing webhook notifications (we only have the email)
   */
  async updateHistoryIdByEmail(emailAddress: string, historyId: string): Promise<void> {
    await this.db
      .update(gmailOAuthTokens)
      .set({ historyId, updatedAt: new Date() })
      .where(eq(gmailOAuthTokens.emailAddress, emailAddress));
  }

  /**
   * Get watch label IDs for a user
   */
  async getWatchLabelIds(userId: string): Promise<string[]> {
    const token = await this.findByUserId(userId);
    return (token?.watchLabelIds ?? []) as string[];
  }

  /**
   * Set watch label IDs for a user
   */
  async setWatchLabelIds(userId: string, labelIds: string[]): Promise<void> {
    await this.updateByUserId(userId, { watchLabelIds: labelIds });
  }

  /**
   * Get Autofin filter IDs for a user
   */
  async getAutofinFilterIds(userId: string): Promise<string[]> {
    const token = await this.findByUserId(userId);
    return (token?.autofinFilterIds ?? []) as string[];
  }

  /**
   * Get filter sender emails for a user
   */
  async getFilterSenderEmails(userId: string): Promise<string[]> {
    const token = await this.findByUserId(userId);
    return (token?.filterSenderEmails ?? []) as string[];
  }

  /**
   * Set filter config (filter IDs and sender emails) for a user
   */
  async setFilterConfig(
    userId: string,
    config: { filterIds: string[]; senderEmails: string[] }
  ): Promise<void> {
    await this.updateByUserId(userId, {
      autofinFilterIds: config.filterIds,
      filterSenderEmails: config.senderEmails,
    });
  }
}
