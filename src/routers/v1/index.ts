import { Hono } from 'hono';
import type { Container } from '../../lib/container';
import type { AuthUser } from '../../middleware/auth';
import { createUserRouter } from './user.router';

type Env = {
  Variables: {
    user: AuthUser;
    container: Container;
  };
};

export const createV1Router = () => {
  const router = new Hono<Env>();

  // Mount sub-routers
  router.route('/users', createUserRouter());

  // Health check
  router.get('/health', (c) => {
    return c.json({ status: 'ok', version: 'v1' });
  });

  return router;
};
