import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

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
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
