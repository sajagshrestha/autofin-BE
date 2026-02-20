import { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';
import type { Container } from '@/lib/container';
import { createRoute } from '@/lib/openapi';
import type { AuthUser } from '@/middleware/auth';
import { createCategoryRouter } from './category.router';
import { createGmailRouter } from './gmail.router';
import { createGmailOAuthRouter } from './gmail-oauth.router';
import { createInsightsRouter } from './insights.router';
import { createTransactionRouter } from './transaction.router';
import { createUserRouter } from './user.router';

type Env = {
  Variables: {
    user: AuthUser;
    container: Container;
  };
};

export const createV1Router = () => {
  const router = new OpenAPIHono<Env>();

  // Mount sub-routers
  router.route('/users', createUserRouter());
  router.route('/gmail/oauth', createGmailOAuthRouter());
  router.route('/gmail', createGmailRouter());
  router.route('/categories', createCategoryRouter());
  router.route('/transactions', createTransactionRouter());
  router.route('/insights', createInsightsRouter());

  // Health check
  const healthCheckRoute = createRoute({
    method: 'get',
    path: '/health',
    summary: 'Health check',
    description: 'Check if the API v1 is healthy',
    tags: ['Health'],
    responses: {
      200: {
        description: 'API is healthy',
        content: {
          'application/json': {
            schema: z.object({
              status: z.string(),
              version: z.string(),
            }),
          },
        },
      },
    },
  });

  router.openapi(healthCheckRoute, (c) => {
    return c.json({ status: 'ok', version: 'v1' });
  });

  return router;
};
