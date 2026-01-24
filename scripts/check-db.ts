import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env' });

async function checkDatabase() {
  const client = postgres(process.env.DATABASE_URL || '');

  try {
    // Check connection
    console.log('Checking database connection...');
    await client`SELECT 1`;
    console.log('✓ Connection successful\n');

    // List all tables in public schema
    console.log('Checking for tables in public schema...');
    const tables = await client`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;

    if (tables.length === 0) {
      console.log('⚠ No tables found in the database');
      console.log('The database appears to be empty.');
      console.log('\nYou can either:');
      console.log('1. Create tables in Supabase dashboard, then run: drizzle-kit pull');
      console.log('2. Define schema in src/db/schema/index.ts, then run: drizzle-kit push');
    } else {
      console.log(`✓ Found ${tables.length} table(s):`);
      tables.forEach((table) => {
        console.log(`  - ${table.table_name}`);
      });
    }

    // Check for other schemas
    console.log('\nChecking for other schemas...');
    const schemas = await client`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
      ORDER BY schema_name;
    `;

    if (schemas.length > 0) {
      console.log(`Found ${schemas.length} schema(s):`);
      schemas.forEach((schema) => {
        console.log(`  - ${schema.schema_name}`);
      });
    }
  } catch (error) {
    console.error('✗ Database connection failed:', error);
  } finally {
    await client.end();
  }
}

checkDatabase();
