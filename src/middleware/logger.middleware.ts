import type { MiddlewareHandler } from 'hono';

export const loggerMiddleware: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'Unknown';

  // Log request start
  console.log(`[${new Date().toISOString()}] ${method} ${path} - IP: ${ip}`);

  await next();

  // Log response
  const status = c.res.status;
  const duration = Date.now() - start;
  const statusEmoji = status >= 500 ? '🔴' : status >= 400 ? '🟡' : status >= 300 ? '🔵' : '🟢';

  console.log(
    `${statusEmoji} [${new Date().toISOString()}] ${method} ${path} - ${status} - ${duration}ms`
  );
};
