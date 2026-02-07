import '../instrument.mjs';
import * as Sentry from '@sentry/node';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { serve } from 'inngest/hono';
import { db } from '@/db/connection';
import { functions, inngest } from '@/inngest';
import { type Container, createContainer } from '@/lib/container';
import { createOpenAPIApp } from '@/lib/openapi';
import type { AuthUser } from '@/middleware/auth';
import { authMiddleware } from '@/middleware/auth';
import { containerMiddleware } from '@/middleware/container.middleware';
import { gmailAuth } from '@/middleware/gmail_auth';
import { loggerMiddleware } from '@/middleware/logger.middleware';
import { createV1Router } from '@/routers';
import { createGmailWebhookRouter } from '@/routers/webhooks';

type Env = {
  Variables: {
    user: AuthUser;
    container: Container;
  };
};

const app = new Hono<Env>();

app.onError((err, c) => {
  // Report _all_ unhandled errors.
  Sentry.captureException(err);
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  // Or just report errors which are not instances of HTTPException
  // Sentry.captureException(err);
  return c.json({ error: 'Internal server error' }, 500);
});

// Create OpenAPI app for docs and mount it
const openApiApp = createOpenAPIApp();

// CORS middleware - allow requests from localhost:3000
// CORS middleware configuration
const allowedOrigins = ['https://autofin-be.onrender.com', 'https://autofin-fe.vercel.app'];

if (process.env.NODE_ENV !== 'production') {
  allowedOrigins.push('http://localhost:5173');
}

const corsMiddleware = cors({
  origin: allowedOrigins,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
});

app.use('*', async (c, next) => {
  if (c.req.path === '/health') return next();
  return corsMiddleware(c, next);
});
openApiApp.use('*', corsMiddleware);

// Apply logger middleware globally to log all requests
app.use('*', loggerMiddleware);

// Initialize dependency injection container
const container = createContainer(db);

// Public route
app.get('/', (c) => {
  return c.json({ message: 'Hello Hono!', version: '1.0.0' });
});

// Health check with database connection test
app.get('/health', async (c) => {
  return c.json({ status: 'ok' });
});

app.get('/debug-sentry', () => {
  throw new Error('My first Sentry error!');
});

// API v1 routes - apply container and auth middleware
app.use('/api/v1/*', containerMiddleware(container));
app.use('/api/v1/*', authMiddleware);

// Create v1 router (uses OpenAPIHono)
const v1Router = createV1Router();

// Mount v1 router on regular app
app.route('/api/v1', v1Router);

// Mount v1 router on OpenAPI app for documentation
// Also apply middleware to OpenAPI app for v1 routes
openApiApp.use('/api/v1/*', containerMiddleware(container));
openApiApp.use('/api/v1/*', authMiddleware);
openApiApp.route('/api/v1', v1Router);

// Mount OpenAPI app (for /docs and /openapi.json)
app.route('/', openApiApp);

// Legacy profile route (keeping for backward compatibility)
app.get('/api/v1/profile', (c) => {
  const user = c.get('user');
  return c.json({ user });
});

// Gmail Pub/Sub webhook routes - apply container and Gmail auth middleware
app.use('/webhooks/gmail/*', containerMiddleware(container));
app.use('/webhooks/gmail/*', gmailAuth);

// Mount Gmail webhook router
app.route('/webhooks/gmail', createGmailWebhookRouter());

// Inngest endpoint (required: GET/POST/PUT)
app.on(['GET', 'PUT', 'POST'], '/api/inngest', serve({ client: inngest, functions }));

export default app;
