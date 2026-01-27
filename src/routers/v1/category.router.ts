import { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';
import type { Container } from '@/lib/container';
import { createRoute } from '@/lib/openapi';
import type { AuthUser } from '@/middleware/auth';
import {
  CategoriesResponseSchema,
  CategoryResponseSchema,
  CreateCategorySchema,
  ErrorSchema,
  UpdateCategorySchema,
} from '@/schemas';

type CategoryRouterEnv = {
  Variables: {
    user: AuthUser;
    container: Container;
  };
};

/**
 * Category router with OpenAPI documentation
 */
export const createCategoryRouter = () => {
  const router = new OpenAPIHono<CategoryRouterEnv>();

  // Get all categories (predefined + user's custom)
  const getCategoriesRoute = createRoute({
    method: 'get',
    path: '/',
    summary: 'Get all categories',
    description: 'Retrieve all categories (predefined + user custom)',
    tags: ['Categories'],
    security: [{ Bearer: [] }],
    responses: {
      200: {
        description: 'List of categories',
        content: {
          'application/json': {
            schema: CategoriesResponseSchema,
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

  router.openapi(getCategoriesRoute, async (c) => {
    const container = c.get('container');
    const user = c.get('user');

    const categories = await container.categoryRepo.findAllForUser(user.id);

    const categoriesWithStringDates = categories.map((category) => ({
      ...category,
      createdAt: category.createdAt.toISOString(),
    }));

    return c.json({ categories: categoriesWithStringDates }, 200 as const);
  });

  // Get category by ID
  const getCategoryRoute = createRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get category by ID',
    description: 'Retrieve a specific category by its ID',
    tags: ['Categories'],
    security: [{ Bearer: [] }],
    request: {
      params: z.object({
        id: z.string().describe('Category ID'),
      }),
    },
    responses: {
      200: {
        description: 'Category details',
        content: {
          'application/json': {
            schema: CategoryResponseSchema,
          },
        },
      },
      404: {
        description: 'Category not found',
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

  router.openapi(getCategoryRoute, async (c) => {
    const container = c.get('container');
    const { id } = c.req.valid('param');

    const category = await container.categoryRepo.findById(id);

    if (!category) {
      return c.json({ error: 'Category not found' }, 404 as const);
    }

    const categoryWithStringDates = {
      ...category,
      createdAt: category.createdAt.toISOString(),
    };

    return c.json({ category: categoryWithStringDates }, 200 as const);
  });

  // Create custom category
  const createCategoryRoute = createRoute({
    method: 'post',
    path: '/',
    summary: 'Create custom category',
    description: 'Create a new custom category for the user',
    tags: ['Categories'],
    security: [{ Bearer: [] }],
    request: {
      body: {
        content: {
          'application/json': {
            schema: CreateCategorySchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Category created successfully',
        content: {
          'application/json': {
            schema: CategoryResponseSchema,
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

  router.openapi(createCategoryRoute, async (c) => {
    const container = c.get('container');
    const user = c.get('user');
    const body = c.req.valid('json');

    try {
      const category = await container.categoryRepo.create({
        id: crypto.randomUUID(),
        userId: user.id,
        name: body.name,
        icon: body.icon || null,
        isDefault: false, // User-created categories are not default
        isAiCreated: false, // Created by user, not AI
      });

      const categoryWithStringDates = {
        ...category,
        createdAt: category.createdAt.toISOString(),
      };

      return c.json({ category: categoryWithStringDates }, 201 as const);
    } catch (_error) {
      return c.json({ error: 'Failed to create category' }, 400 as const);
    }
  });

  // Update custom category
  const updateCategoryRoute = createRoute({
    method: 'patch',
    path: '/{id}',
    summary: 'Update custom category',
    description: 'Update an existing custom category (cannot update predefined categories)',
    tags: ['Categories'],
    security: [{ Bearer: [] }],
    request: {
      params: z.object({
        id: z.string().describe('Category ID'),
      }),
      body: {
        content: {
          'application/json': {
            schema: UpdateCategorySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Category updated successfully',
        content: {
          'application/json': {
            schema: CategoryResponseSchema,
          },
        },
      },
      404: {
        description: 'Category not found or cannot be updated',
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

  router.openapi(updateCategoryRoute, async (c) => {
    const container = c.get('container');
    const user = c.get('user');
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');

    const category = await container.categoryRepo.update(id, user.id, body);

    if (!category) {
      return c.json(
        { error: 'Category not found or cannot be updated (predefined categories are read-only)' },
        404 as const
      );
    }

    const categoryWithStringDates = {
      ...category,
      createdAt: category.createdAt.toISOString(),
    };

    return c.json({ category: categoryWithStringDates }, 200 as const);
  });

  // Delete custom category
  const deleteCategoryRoute = createRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete custom category',
    description: 'Delete a custom category (cannot delete predefined categories)',
    tags: ['Categories'],
    security: [{ Bearer: [] }],
    request: {
      params: z.object({
        id: z.string().describe('Category ID'),
      }),
    },
    responses: {
      200: {
        description: 'Category deleted successfully',
        content: {
          'application/json': {
            schema: z.object({
              message: z.string(),
            }),
          },
        },
      },
      404: {
        description: 'Category not found or cannot be deleted',
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

  router.openapi(deleteCategoryRoute, async (c) => {
    const container = c.get('container');
    const user = c.get('user');
    const { id } = c.req.valid('param');

    const deleted = await container.categoryRepo.delete(id, user.id);

    if (!deleted) {
      return c.json(
        { error: 'Category not found or cannot be deleted (predefined categories are protected)' },
        404 as const
      );
    }

    return c.json({ message: 'Category deleted successfully' }, 200 as const);
  });

  return router;
};
