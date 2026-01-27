import { OpenAPIHono } from '@hono/zod-openapi';
import type { Container } from '@/lib/container';
import { createRoute } from '@/lib/openapi';
import {
  ErrorSchema,
  GmailOAuthAuthorizeResponseSchema,
  GmailOAuthCallbackQuerySchema,
  GmailOAuthCallbackResponseSchema,
  GmailOAuthRefreshResponseSchema,
  GmailOAuthRevokeResponseSchema,
  GmailOAuthStatusSchema,
  GmailOAuthTestLookupQuerySchema,
  GmailOAuthTestLookupResponseSchema,
} from '@/schemas';

type GmailOAuthEnv = {
  Variables: {
    user: {
      id: string;
      email?: string;
    };
    container: Container;
  };
};

/**
 * Gmail OAuth router with OpenAPI documentation
 */
export const createGmailOAuthRouter = () => {
  const router = new OpenAPIHono<GmailOAuthEnv>();

  /**
   * Get Gmail OAuth authorization URL
   * GET /api/v1/gmail/oauth/authorize
   */
  const authorizeRoute = createRoute({
    method: 'get',
    path: '/authorize',
    summary: 'Get Gmail OAuth authorization URL',
    description: 'Returns the URL to redirect the user to for Gmail OAuth authorization',
    tags: ['Gmail OAuth'],
    security: [{ Bearer: [] }],
    responses: {
      200: {
        description: 'Authorization URL generated successfully',
        content: {
          'application/json': {
            schema: GmailOAuthAuthorizeResponseSchema,
          },
        },
      },
      500: {
        description: 'Gmail OAuth not configured',
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

  router.openapi(authorizeRoute, async (c) => {
    try {
      const user = c.get('user');
      const redirectUri = process.env.GMAIL_OAUTH_REDIRECT_URI;
      const clientId = process.env.GMAIL_CLIENT_ID;

      if (!redirectUri || !clientId) {
        return c.json(
          {
            error: 'Gmail OAuth not configured',
            message: 'GMAIL_OAUTH_REDIRECT_URI and GMAIL_CLIENT_ID must be set',
          },
          500 as const
        );
      }

      // Gmail OAuth scopes
      const scopes = [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.modify',
      ].join(' ');

      // Generate state parameter for CSRF protection
      const state = Buffer.from(
        JSON.stringify({ userId: user.id, timestamp: Date.now() })
      ).toString('base64url');

      // Build authorization URL
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', scopes);
      authUrl.searchParams.set('access_type', 'offline'); // Required to get refresh token
      authUrl.searchParams.set('prompt', 'consent'); // Force consent to get refresh token
      authUrl.searchParams.set('state', state);

      return c.json(
        {
          authorizationUrl: authUrl.toString(),
          state,
        },
        200 as const
      );
    } catch (error) {
      console.error('Error generating authorization URL:', error);
      return c.json(
        {
          error: 'Failed to generate authorization URL',
        },
        500 as const
      );
    }
  });

  /**
   * Handle Gmail OAuth callback
   * GET /api/v1/gmail/oauth/callback?code=...&state=...
   */
  const callbackRoute = createRoute({
    method: 'get',
    path: '/callback',
    summary: 'Handle Gmail OAuth callback',
    description: 'Exchanges the authorization code for tokens and stores them',
    tags: ['Gmail OAuth'],
    request: {
      query: GmailOAuthCallbackQuerySchema,
    },
    responses: {
      200: {
        description: 'OAuth callback processed successfully',
        content: {
          'application/json': {
            schema: GmailOAuthCallbackResponseSchema,
          },
        },
      },
      400: {
        description: 'Bad request - missing or invalid parameters',
        content: {
          'application/json': {
            schema: ErrorSchema,
          },
        },
      },
      500: {
        description: 'Server error',
        content: {
          'application/json': {
            schema: ErrorSchema,
          },
        },
      },
    },
  });

  router.openapi(callbackRoute, async (c) => {
    try {
      const { code, state, error } = c.req.valid('query');

      if (error) {
        return c.json(
          {
            error: 'OAuth authorization failed',
            details: error,
          },
          400 as const
        );
      }

      if (!code || !state) {
        return c.json(
          {
            error: 'Missing required parameters',
            message: 'code and state query parameters are required',
          },
          400 as const
        );
      }

      // Verify state (in production, you might want to store this in a session/cache)
      let stateData: { userId: string; timestamp: number };
      try {
        stateData = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8')) as {
          userId: string;
          timestamp: number;
        };
      } catch {
        return c.json(
          {
            error: 'Invalid state parameter',
          },
          400 as const
        );
      }

      const userId = stateData.userId;
      const redirectUri = process.env.GMAIL_OAUTH_REDIRECT_URI;
      const clientId = process.env.GMAIL_CLIENT_ID;
      const clientSecret = process.env.GMAIL_CLIENT_SECRET;

      if (!redirectUri || !clientId || !clientSecret) {
        return c.json(
          {
            error: 'Gmail OAuth not configured',
          },
          500 as const
        );
      }

      // Exchange authorization code for tokens
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json().catch(() => ({
          error: tokenResponse.statusText,
        }));
        console.error('Token exchange failed:', errorData);
        return c.json(
          {
            error: 'Failed to exchange authorization code',
            details: errorData,
          },
          400 as const
        );
      }

      const tokenData = await tokenResponse.json();

      // Get user's email from Gmail API
      const profileResponse = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/profile',
        {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
          },
        }
      );

      if (!profileResponse.ok) {
        console.error('Failed to fetch Gmail profile');
        return c.json(
          {
            error: 'Failed to fetch Gmail profile',
          },
          500 as const
        );
      }

      const profile = await profileResponse.json();

      // Store tokens in database
      const container = c.get('container');
      await container.gmailService.storeTokens(
        userId,
        profile.emailAddress,
        tokenData.access_token,
        tokenData.refresh_token,
        tokenData.expires_in,
        tokenData.scope || ''
      );

      return c.json(
        {
          success: true,
          message: 'Gmail OAuth authorization successful',
          emailAddress: profile.emailAddress,
        },
        200 as const
      );
    } catch (error) {
      console.error('Error processing OAuth callback:', error);
      return c.json(
        {
          error: 'Failed to process OAuth callback',
        },
        500 as const
      );
    }
  });

  /**
   * Refresh Gmail OAuth token
   * POST /api/v1/gmail/oauth/refresh
   */
  const refreshRoute = createRoute({
    method: 'post',
    path: '/refresh',
    summary: 'Refresh Gmail OAuth token',
    description: 'Manually refresh the access token for the authenticated user',
    tags: ['Gmail OAuth'],
    security: [{ Bearer: [] }],
    responses: {
      200: {
        description: 'Token refreshed successfully',
        content: {
          'application/json': {
            schema: GmailOAuthRefreshResponseSchema,
          },
        },
      },
      404: {
        description: 'No OAuth token found',
        content: {
          'application/json': {
            schema: ErrorSchema,
          },
        },
      },
      500: {
        description: 'Failed to refresh token',
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

  router.openapi(refreshRoute, async (c) => {
    try {
      const user = c.get('user');
      const container = c.get('container');

      // Get current token
      const token = await container.gmailOAuthRepo.findByUserId(user.id);

      if (!token) {
        return c.json(
          {
            error: 'No Gmail OAuth token found',
            message: 'Please authorize Gmail access first',
          },
          404 as const
        );
      }

      // Refresh the token
      await container.gmailService.refreshAccessToken(user.id, token.refreshToken);

      return c.json(
        {
          success: true,
          message: 'Token refreshed successfully',
        },
        200 as const
      );
    } catch (error) {
      console.error('Error refreshing token:', error);
      return c.json(
        {
          error: 'Failed to refresh token',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500 as const
      );
    }
  });

  /**
   * Revoke Gmail OAuth tokens
   * DELETE /api/v1/gmail/oauth/revoke
   */
  const revokeRoute = createRoute({
    method: 'delete',
    path: '/revoke',
    summary: 'Revoke Gmail OAuth tokens',
    description: 'Revokes and deletes the Gmail OAuth tokens for the authenticated user',
    tags: ['Gmail OAuth'],
    security: [{ Bearer: [] }],
    responses: {
      200: {
        description: 'Tokens revoked successfully',
        content: {
          'application/json': {
            schema: GmailOAuthRevokeResponseSchema,
          },
        },
      },
      404: {
        description: 'No OAuth token found',
        content: {
          'application/json': {
            schema: ErrorSchema,
          },
        },
      },
      500: {
        description: 'Failed to revoke tokens',
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

  router.openapi(revokeRoute, async (c) => {
    try {
      const user = c.get('user');
      const container = c.get('container');

      // Get current token
      const token = await container.gmailOAuthRepo.findByUserId(user.id);

      if (!token) {
        return c.json(
          {
            error: 'No Gmail OAuth token found',
          },
          404 as const
        );
      }

      // Revoke token with Google
      try {
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            token: token.refreshToken,
          }),
        });
      } catch (error) {
        console.error('Error revoking token with Google:', error);
        // Continue to delete from database even if Google revocation fails
      }

      // Delete token from database
      await container.gmailOAuthRepo.deleteByUserId(user.id);

      return c.json(
        {
          success: true,
          message: 'Gmail OAuth tokens revoked and deleted',
        },
        200 as const
      );
    } catch (error) {
      console.error('Error revoking tokens:', error);
      return c.json(
        {
          error: 'Failed to revoke tokens',
        },
        500 as const
      );
    }
  });

  /**
   * Get current Gmail OAuth status
   * GET /api/v1/gmail/oauth/status
   */
  const statusRoute = createRoute({
    method: 'get',
    path: '/status',
    summary: 'Get Gmail OAuth status',
    description: 'Returns the current OAuth token status for the authenticated user',
    tags: ['Gmail OAuth'],
    security: [{ Bearer: [] }],
    responses: {
      200: {
        description: 'OAuth status retrieved successfully',
        content: {
          'application/json': {
            schema: GmailOAuthStatusSchema,
          },
        },
      },
      500: {
        description: 'Failed to get OAuth status',
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

  router.openapi(statusRoute, async (c) => {
    try {
      const user = c.get('user');
      const container = c.get('container');

      const token = await container.gmailOAuthRepo.findByUserId(user.id);

      if (!token) {
        return c.json(
          {
            authorized: false,
            message: 'No Gmail OAuth token found',
          },
          200 as const
        );
      }

      // Check if token is valid
      const isValid = await container.gmailOAuthRepo.isTokenValid(token.id);
      const expiresAt = new Date(token.expiresAt);
      const now = new Date();

      // Convert Date objects to ISO strings
      return c.json(
        {
          authorized: true,
          emailAddress: token.emailAddress,
          expiresAt:
            token.expiresAt instanceof Date ? token.expiresAt.toISOString() : token.expiresAt,
          isExpired: expiresAt < now,
          isValid,
          scope: token.scope,
          createdAt:
            token.createdAt instanceof Date ? token.createdAt.toISOString() : token.createdAt,
          updatedAt:
            token.updatedAt instanceof Date ? token.updatedAt.toISOString() : token.updatedAt,
        },
        200 as const
      );
    } catch (error) {
      console.error('Error getting OAuth status:', error);
      return c.json(
        {
          error: 'Failed to get OAuth status',
        },
        500 as const
      );
    }
  });

  /**
   * Test endpoint to lookup OAuth token by email
   * GET /api/v1/gmail/oauth/test/lookup?email=...
   */
  const testLookupRoute = createRoute({
    method: 'get',
    path: '/test/lookup',
    summary: 'Test lookup OAuth token by email',
    description: 'Test endpoint to lookup an OAuth token by email address (for debugging)',
    tags: ['Gmail OAuth'],
    request: {
      query: GmailOAuthTestLookupQuerySchema,
    },
    responses: {
      200: {
        description: 'Lookup completed',
        content: {
          'application/json': {
            schema: GmailOAuthTestLookupResponseSchema,
          },
        },
      },
      500: {
        description: 'Lookup failed',
        content: {
          'application/json': {
            schema: ErrorSchema,
          },
        },
      },
    },
  });

  router.openapi(testLookupRoute, async (c) => {
    const startTime = Date.now();
    try {
      const { email } = c.req.valid('query');
      const container = c.get('container');

      console.log(`[TEST] Starting findByEmailAddress lookup for: ${email}`);

      const token = await container.gmailOAuthRepo.findByEmailAddress(email);

      const queryTimeMs = Date.now() - startTime;
      console.log(`[TEST] Lookup completed in ${queryTimeMs}ms, found: ${!!token}`);

      if (!token) {
        return c.json(
          {
            found: false,
            queryTimeMs,
            message: `No token found for email: ${email}`,
          },
          200 as const
        );
      }

      return c.json(
        {
          found: true,
          emailAddress: token.emailAddress,
          userId: token.userId,
          queryTimeMs,
          message: 'Token found successfully',
        },
        200 as const
      );
    } catch (error) {
      const queryTimeMs = Date.now() - startTime;
      console.error(`[TEST] Lookup failed after ${queryTimeMs}ms:`, error);
      return c.json(
        {
          error: 'Lookup failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500 as const
      );
    }
  });

  return router;
};
