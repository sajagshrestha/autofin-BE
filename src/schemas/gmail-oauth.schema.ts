import { z } from 'zod';

/**
 * Gmail OAuth schemas
 * These can be shared with frontend/mobile apps in a monorepo
 */

export const GmailOAuthAuthorizeResponseSchema = z.object({
  authorizationUrl: z.string().url(),
  state: z.string(),
});

export type GmailOAuthAuthorizeResponse = z.infer<typeof GmailOAuthAuthorizeResponseSchema>;

export const GmailOAuthCallbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

export const GmailOAuthCallbackResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  emailAddress: z.string().email().optional(),
});

export type GmailOAuthCallbackResponse = z.infer<typeof GmailOAuthCallbackResponseSchema>;

export const GmailOAuthStatusSchema = z.object({
  authorized: z.boolean(),
  emailAddress: z.string().email().optional(),
  expiresAt: z.string().datetime().optional(),
  isExpired: z.boolean().optional(),
  isValid: z.boolean().optional(),
  scope: z.string().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  message: z.string().optional(),
});

export type GmailOAuthStatus = z.infer<typeof GmailOAuthStatusSchema>;

export const GmailOAuthRefreshResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export const GmailOAuthRevokeResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

// Test endpoint schemas
export const GmailOAuthTestLookupQuerySchema = z.object({
  email: z.string().email(),
});

export const GmailOAuthTestLookupResponseSchema = z.object({
  found: z.boolean(),
  emailAddress: z.string().email().optional(),
  userId: z.string().optional(),
  queryTimeMs: z.number(),
  message: z.string().optional(),
});
