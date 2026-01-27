import { z } from 'zod';

/**
 * Category schemas
 * These can be shared with frontend/mobile apps in a monorepo
 */

export const CategorySchema = z.object({
  id: z.string(),
  userId: z.string().nullable(),
  name: z.string(),
  icon: z.string().nullable(),
  isDefault: z.boolean(),
  isAiCreated: z.boolean(),
  createdAt: z.string().datetime(),
});

export type Category = z.infer<typeof CategorySchema>;

export const CreateCategorySchema = z.object({
  name: z.string().min(1).max(50),
  icon: z.string().max(10).optional(), // emoji or icon name
});

export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>;

export const UpdateCategorySchema = z.object({
  name: z.string().min(1).max(50).optional(),
  icon: z.string().max(10).optional(),
});

export type UpdateCategoryInput = z.infer<typeof UpdateCategorySchema>;

// Response schemas
export const CategoryResponseSchema = z.object({
  category: CategorySchema,
});

export const CategoriesResponseSchema = z.object({
  categories: z.array(CategorySchema),
});
