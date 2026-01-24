import { Hono } from 'hono';
import type { Container } from '../../lib/container';
import type { AuthUser } from '../../middleware/auth';

type Env = {
  Variables: {
    user: AuthUser;
    container: Container;
  };
};

export const createUserRouter = () => {
  const router = new Hono<Env>();

  // Get all users
  router.get('/', async (c) => {
    const container = c.get('container');
    const users = await container.userService.getAllUsers();
    return c.json({ users });
  });

  // Get user by ID
  router.get('/:id', async (c) => {
    const container = c.get('container');
    const id = c.req.param('id');
    const user = await container.userService.getUserById(id);

    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({ user });
  });

  // Create user
  router.post('/', async (c) => {
    const container = c.get('container');
    const body = await c.req.json();

    try {
      const user = await container.userService.createUser({
        email: body.email,
      });
      return c.json({ user }, 201);
    } catch (_error) {
      return c.json({ error: 'Failed to create user' }, 400);
    }
  });

  // Update user
  router.put('/:id', async (c) => {
    const container = c.get('container');
    const id = c.req.param('id');
    const body = await c.req.json();

    const user = await container.userService.updateUser(id, body);

    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({ user });
  });

  // Delete user
  router.delete('/:id', async (c) => {
    const container = c.get('container');
    const id = c.req.param('id');

    const deleted = await container.userService.deleteUser(id);

    if (!deleted) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({ message: 'User deleted successfully' });
  });

  return router;
};
