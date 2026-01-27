import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

config({ path: '.env' });

const client = postgres(process.env.DATABASE_URL || '', {
  // Connection pool settings
  max: 10, // Maximum connections in pool
  idle_timeout: 20, // Close idle connections after 20 seconds
  connect_timeout: 10, // Timeout for establishing connection (seconds)

  // Required for Supabase transaction pooler (pgbouncer)
  prepare: false, // Disable prepared statements for pgbouncer compatibility

  // Connection options
  connection: {
    application_name: 'autofin-be',
  },
});

export const db = drizzle({ client });
export type Database = typeof db;

// Export client for direct access if needed
export { client };
