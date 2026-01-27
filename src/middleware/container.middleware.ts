import type { Context, Next } from 'hono';
import type { Container } from '@/lib/container';

type Env = {
  Variables: {
    container: Container;
  };
};

export const containerMiddleware = (container: Container) => {
  return async (c: Context<Env>, next: Next) => {
    c.set('container', container);
    await next();
  };
};
