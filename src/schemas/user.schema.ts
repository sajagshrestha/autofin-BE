import { z } from 'zod';

/**
 * User schemas
 * These can be shared with frontend/mobile apps in a monorepo
 */

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type User = z.infer<typeof UserSchema>;

export const CreateUserSchema = z.object({
  email: z.string().email(),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = z.object({
  email: z.string().email().optional(),
});

export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

// Response schemas
export const UserResponseSchema = z.object({
  user: UserSchema,
});

export const UsersResponseSchema = z.object({
  users: z.array(UserSchema),
});
