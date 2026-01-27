import { swaggerUI } from '@hono/swagger-ui';
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';

/**
 * OpenAPI configuration
 *
 * This creates an OpenAPIHono instance that can generate
 * OpenAPI specs for sharing with frontend/mobile apps
 */

export const createOpenAPIApp = () => {
  const app = new OpenAPIHono();

  // OpenAPI metadata
  app.doc('/openapi.json', {
    openapi: '3.0.0',
    info: {
      version: '1.0.0',
      title: 'Autofin API',
      description: 'API for Autofin backend with Gmail integration',
    },
    servers: [
      {
        url: process.env.API_BASE_URL || 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        Bearer: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Supabase JWT token',
        },
      },
    },
  });

  // Swagger UI endpoint
  app.get(
    '/docs',
    swaggerUI({
      url: '/openapi.json',
      config: {
        persistAuthorization: true,
        displayRequestDuration: true,
        docExpansion: 'list',
        filter: true,
        showExtensions: true,
        showCommonExtensions: true,
      },
    })
  );

  return app;
};

/**
 * Generate OpenAPI spec as JSON
 * Can be exported and shared with frontend/mobile apps
 */
export const getOpenAPISpec = (app: OpenAPIHono) => {
  return app.getOpenAPIDocument();
};

// Export createRoute for use in routers
export { createRoute };
