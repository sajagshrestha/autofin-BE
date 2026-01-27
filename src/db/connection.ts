import { config } from 'dotenv';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

config({ path: '.env' });

const client = postgres(process.env.DATABASE_URL || '', {
  // Connection pool settings
  max: 10, // Maximum connections in pool
  idle_timeout: 60 * 20, // Close idle connections after 60 seconds (less than typical DB server timeout)
  max_lifetime: 60 * 20, // Recycle connections after 24 hours to prevent staleness
  connect_timeout: 10, // Timeout for establishing connection (seconds)

  // Required for Supabase transaction pooler (pgbouncer)
  prepare: false, // Disable prepared statements for pgbouncer compatibility

  // Connection options
  connection: {
    application_name: 'autofin-be',
  },

  // Handle connection errors and retry
  onnotice: () => {}, // Suppress notices
  transform: {
    undefined: null, // Transform undefined to null for postgres compatibility
  },

  // Automatically reconnect on connection errors
  // The library handles this automatically, but we ensure it's enabled
});

export const db = drizzle({ client });
export type Database = typeof db;

// Export client for direct access if needed
export { client };

/**
 * Health check function to verify database connection is alive
 * Can be used in health check endpoints or before critical operations
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`);
    return true;
  } catch (error) {
    console.error('Database connection check failed:', error);
    return false;
  }
}
