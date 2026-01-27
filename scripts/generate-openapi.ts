import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from 'dotenv';
import { createOpenAPIApp } from '../src/lib/openapi';

config({ path: '.env' });

/**
 * Generate OpenAPI spec JSON file
 *
 * This script generates the OpenAPI specification that can be
 * shared with frontend/mobile apps in a monorepo
 *
 * Usage: bun run scripts/generate-openapi.ts
 */

async function generateOpenAPI() {
  console.log('Generating OpenAPI specification...');

  const openApiApp = createOpenAPIApp();

  // Mount all routers to populate the OpenAPI spec
  // Note: This requires routers to use OpenAPIHono
  // For now, we'll create a basic structure

  // Get the OpenAPI document
  const spec = openApiApp.getOpenAPIDocument();

  // Write to file
  const outputPath = join(process.cwd(), 'openapi.json');
  writeFileSync(outputPath, JSON.stringify(spec, null, 2));

  console.log(`✅ OpenAPI spec generated at: ${outputPath}`);
  console.log(`📄 You can share this file with your frontend/mobile apps`);
}

generateOpenAPI().catch(console.error);
