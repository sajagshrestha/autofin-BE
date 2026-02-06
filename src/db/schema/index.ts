import { relations } from 'drizzle-orm';
import { boolean, jsonb, numeric, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * User profile table in public schema
 *
 * This table stores application-specific user data.
 * The `id` field should match `auth.users.id` from Supabase Auth.
 *
 * Note: Supabase Auth manages `auth.users` (authentication data).
 * This table stores your application's user profile data.
 *
 * When a user signs up via Supabase Auth, you should create a corresponding
 * record here with the same `id` as `auth.users.id`.
 *
 * You can automate this with a database trigger:
 * ```sql
 * CREATE OR REPLACE FUNCTION public.handle_new_user()
 * RETURNS TRIGGER AS $$
 * BEGIN
 *   INSERT INTO public.users (id, email)
 *   VALUES (NEW.id, NEW.email);
 *   RETURN NEW;
 * END;
 * $$ LANGUAGE plpgsql SECURITY DEFINER;
 *
 * CREATE TRIGGER on_auth_user_created
 *   AFTER INSERT ON auth.users
 *   FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
 * ```
 */
export const users = pgTable('users', {
  // This should match auth.users.id from Supabase Auth
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  timezone: text('timezone').notNull().default('Asia/Kathmandu'), // IANA timezone identifier
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

/**
 * Gmail OAuth tokens table
 *
 * Stores OAuth2 tokens for Gmail API access per user.
 * Tokens are encrypted at rest (application-level encryption recommended).
 */
export const gmailOAuthTokens = pgTable('gmail_oauth_tokens', {
  id: text('id').primaryKey(), // UUID or similar
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  emailAddress: text('email_address').notNull(), // Gmail email address
  accessToken: text('access_token').notNull(), // Encrypted access token
  refreshToken: text('refresh_token').notNull(), // Encrypted refresh token
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), // Token expiration time
  scope: text('scope').notNull(), // OAuth scopes granted
  historyId: text('history_id'), // Last processed Gmail history ID for watch notifications
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type GmailOAuthToken = typeof gmailOAuthTokens.$inferSelect;
export type NewGmailOAuthToken = typeof gmailOAuthTokens.$inferInsert;

/**
 * Categories table
 *
 * Stores transaction categories (both predefined and user-defined).
 * Predefined categories have userId = null and isDefault = true.
 * Custom categories have userId set and isDefault = false.
 */
export const categories = pgTable('categories', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }), // null for predefined categories
  name: text('name').notNull(),
  icon: text('icon'), // emoji or icon name
  isDefault: boolean('is_default').default(false).notNull(), // predefined vs custom
  isAiCreated: boolean('is_ai_created').default(false).notNull(), // true if created by AI, false if created by user
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;

/**
 * Transactions table
 *
 * Stores financial transactions extracted from bank emails.
 * Each transaction is linked to a user and optionally to a category.
 * The emailId is unique to prevent duplicate processing from Pub/Sub.
 */
export const transactions = pgTable('transactions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  categoryId: text('category_id').references(() => categories.id, { onDelete: 'set null' }),

  // Core transaction data
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  type: text('type').notNull(), // 'debit' | 'credit'
  currency: text('currency').default('NPR'),

  // Extracted metadata
  merchant: text('merchant'),
  accountNumber: text('account_number'), // last 4 digits
  bankName: text('bank_name'),
  transactionDate: timestamp('transaction_date', { withTimezone: true }),
  remarks: text('remarks'),

  // Source tracking - emailId is UNIQUE to prevent duplicate processing
  emailId: text('email_id').unique(), // Gmail message ID (unique constraint)
  rawEmailContent: text('raw_email_content'), // for debugging/re-extraction

  // AI metadata
  aiConfidence: numeric('ai_confidence', { precision: 3, scale: 2 }), // 0.00-1.00
  aiExtractedData: jsonb('ai_extracted_data'), // full AI response for debugging
  isAiCreated: boolean('is_ai_created').default(false).notNull(), // true if created by AI from email, false if created manually by user

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  gmailTokens: many(gmailOAuthTokens),
  categories: many(categories),
  transactions: many(transactions),
}));

export const gmailOAuthTokensRelations = relations(gmailOAuthTokens, ({ one }) => ({
  user: one(users, {
    fields: [gmailOAuthTokens.userId],
    references: [users.id],
  }),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  user: one(users, {
    fields: [categories.userId],
    references: [users.id],
  }),
  transactions: many(transactions),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, {
    fields: [transactions.userId],
    references: [users.id],
  }),
  category: one(categories, {
    fields: [transactions.categoryId],
    references: [categories.id],
  }),
}));
