import { Hono } from 'hono';
import { db } from './db/connection';
import { type Container, createContainer } from './lib/container';
import type { AuthUser } from './middleware/auth';
import { authMiddleware } from './middleware/auth';
import { containerMiddleware } from './middleware/container.middleware';
import { makeAuth } from './middleware/make_auth';
import { createV1Router } from './routers';
import { createMakeWebhookRouter } from './routers/webhooks';

type Env = {
  Variables: {
    user: AuthUser;
    container: Container;
  };
};

const app = new Hono<Env>();

// Initialize dependency injection container
const container = createContainer(db);

// Public route
app.get('/', (c) => {
  return c.json({ message: 'Hello Hono!', version: '1.0.0' });
});

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

// API v1 routes - apply container and auth middleware
app.use('/api/v1/*', containerMiddleware(container));
app.use('/api/v1/*', authMiddleware);

// Mount v1 router
app.route('/api/v1', createV1Router());

// Legacy profile route (keeping for backward compatibility)
app.get('/api/v1/profile', (c) => {
  const user = c.get('user');
  return c.json({ user });
});

// Make webhook routes - apply container and Make auth middleware
app.use('/webhooks/make/*', containerMiddleware(container));
app.use('/webhooks/make/*', makeAuth);

// Mount Make webhook router
app.route('/webhooks/make', createMakeWebhookRouter());

export default app;
