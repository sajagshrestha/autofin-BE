import { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';
import type { NewUser } from '@/db/schema';
import type { Container } from '@/lib/container';
import { createRoute } from '@/lib/openapi';
import type { AuthUser } from '@/middleware/auth';
import {
  CreateUserSchema,
  ErrorSchema,
  UpdateUserSchema,
  UserResponseSchema,
  UsersResponseSchema,
} from '@/schemas';

type UserRouterEnv = {
  Variables: {
    user: AuthUser;
    container: Container;
  };
};

/**
 * User router with OpenAPI documentation
 *
 * This router uses OpenAPI decorators to automatically generate
 * API documentation that can be shared with frontend/mobile apps
 */
export const createUserRouter = () => {
  const router = new OpenAPIHono<UserRouterEnv>();

  // Get all users
  const getUsersRoute = createRoute({
    method: 'get',
    path: '/',
    summary: 'Get all users',
    description: 'Retrieve a list of all users',
    tags: ['Users'],
    security: [{ Bearer: [] }],
    responses: {
      200: {
        description: 'List of users',
        content: {
          'application/json': {
            schema: UsersResponseSchema,
          },
        },
      },
      401: {
        description: 'Unauthorized',
        content: {
          'application/json': {
            schema: ErrorSchema,
          },
        },
      },
    },
  });

  router.openapi(getUsersRoute, async (c) => {
    const container = c.get('container');
    const users = await container.userService.getAllUsers();
    // Convert Date objects to ISO strings
    const usersWithStringDates = users.map((user) => ({
      ...user,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    }));
    return c.json({ users: usersWithStringDates }, 200 as const);
  });

  // Get user by ID
  const getUserRoute = createRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get user by ID',
    description: 'Retrieve a specific user by their ID',
    tags: ['Users'],
    security: [{ Bearer: [] }],
    request: {
      params: z.object({
        id: z.string().describe('User ID'),
      }),
    },
    responses: {
      200: {
        description: 'User details',
        content: {
          'application/json': {
            schema: UserResponseSchema,
          },
        },
      },
      404: {
        description: 'User not found',
        content: {
          'application/json': {
            schema: ErrorSchema,
          },
        },
      },
      401: {
        description: 'Unauthorized',
        content: {
          'application/json': {
            schema: ErrorSchema,
          },
        },
      },
    },
  });

  router.openapi(getUserRoute, async (c) => {
    const container = c.get('container');
    const { id } = c.req.valid('param');
    const user = await container.userService.getUserById(id);

    if (!user) {
      return c.json({ error: 'User not found' }, 404 as const);
    }

    // Convert Date objects to ISO strings
    const userWithStringDates = {
      ...user,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
    return c.json({ user: userWithStringDates }, 200 as const);
  });

  // Create user
  const createUserRoute = createRoute({
    method: 'post',
    path: '/',
    summary: 'Create a new user',
    description: 'Create a new user with email',
    tags: ['Users'],
    security: [{ Bearer: [] }],
    request: {
      body: {
        content: {
          'application/json': {
            schema: CreateUserSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'User created successfully',
        content: {
          'application/json': {
            schema: UserResponseSchema,
          },
        },
      },
      400: {
        description: 'Bad request',
        content: {
          'application/json': {
            schema: ErrorSchema,
          },
        },
      },
      401: {
        description: 'Unauthorized',
        content: {
          'application/json': {
            schema: ErrorSchema,
          },
        },
      },
    },
  });

  router.openapi(createUserRoute, async (c) => {
    const container = c.get('container');
    const body = c.req.valid('json');

    try {
      // Note: id should come from Supabase Auth in production
      // For now, we'll let the service handle it
      const user = await container.userService.createUser({
        email: body.email,
      } as NewUser);
      // Convert Date objects to ISO strings
      const userWithStringDates = {
        ...user,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      };
      return c.json({ user: userWithStringDates }, 201 as const);
    } catch (_error) {
      return c.json({ error: 'Failed to create user' }, 400 as const);
    }
  });

  // Update user
  const updateUserRoute = createRoute({
    method: 'put',
    path: '/{id}',
    summary: 'Update user',
    description: 'Update an existing user',
    tags: ['Users'],
    security: [{ Bearer: [] }],
    request: {
      params: z.object({
        id: z.string().describe('User ID'),
      }),
      body: {
        content: {
          'application/json': {
            schema: UpdateUserSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'User updated successfully',
        content: {
          'application/json': {
            schema: UserResponseSchema,
          },
        },
      },
      404: {
        description: 'User not found',
        content: {
          'application/json': {
            schema: ErrorSchema,
          },
        },
      },
      401: {
        description: 'Unauthorized',
        content: {
          'application/json': {
            schema: ErrorSchema,
          },
        },
      },
    },
  });

  router.openapi(updateUserRoute, async (c) => {
    const container = c.get('container');
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');

    const user = await container.userService.updateUser(id, body);

    if (!user) {
      return c.json({ error: 'User not found' }, 404 as const);
    }

    // Convert Date objects to ISO strings
    const userWithStringDates = {
      ...user,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
    return c.json({ user: userWithStringDates }, 200 as const);
  });

  // Delete user
  const deleteUserRoute = createRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete user',
    description: 'Delete a user by ID',
    tags: ['Users'],
    security: [{ Bearer: [] }],
    request: {
      params: z.object({
        id: z.string().describe('User ID'),
      }),
    },
    responses: {
      200: {
        description: 'User deleted successfully',
        content: {
          'application/json': {
            schema: z.object({
              message: z.string(),
            }),
          },
        },
      },
      404: {
        description: 'User not found',
        content: {
          'application/json': {
            schema: ErrorSchema,
          },
        },
      },
      401: {
        description: 'Unauthorized',
        content: {
          'application/json': {
            schema: ErrorSchema,
          },
        },
      },
    },
  });

  router.openapi(deleteUserRoute, async (c) => {
    const container = c.get('container');
    const { id } = c.req.valid('param');

    const deleted = await container.userService.deleteUser(id);

    if (!deleted) {
      return c.json({ error: 'User not found' }, 404 as const);
    }

    return c.json({ message: 'User deleted successfully' }, 200 as const);
  });

  return router;
};
