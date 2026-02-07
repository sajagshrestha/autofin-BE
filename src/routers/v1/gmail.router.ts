import { OpenAPIHono } from '@hono/zod-openapi';
import { AUTOFIN_LABEL_IDS } from '@/constants';
import { inngest } from '@/inngest/client';
import type { Container } from '@/lib/container';
import { createRoute } from '@/lib/openapi';
import {
  ErrorSchema,
  GmailAttachmentParamsSchema,
  GmailAttachmentResponseSchema,
  GmailGetMessageQuerySchema,
  GmailHistoryQuerySchema,
  GmailHistoryResponseSchema,
  GmailLabelsListResponseSchema,
  GmailListMessagesQuerySchema,
  GmailListMessagesResponseSchema,
  GmailMessageParamsSchema,
  GmailMessageSchema,
  GmailProfileSchema,
  GmailWatchRequestSchema,
  GmailWatchResponseSchema,
  GmailWatchStatusResponseSchema,
  SuccessSchema,
} from '@/schemas';

type GmailEnv = {
  Variables: {
    user: {
      id: string;
      email?: string;
    };
    container: Container;
  };
};

/**
 * Gmail API router with OpenAPI documentation
 * Provides endpoints for interacting with Gmail API
 */
export const createGmailRouter = () => {
  const router = new OpenAPIHono<GmailEnv>();

  /**
   * Get Gmail profile
   * GET /api/v1/gmail/profile
   */
  const profileRoute = createRoute({
    method: 'get',
    path: '/profile',
    summary: 'Get Gmail profile',
    description: 'Returns the Gmail profile for the authenticated user',
    tags: ['Gmail'],
    security: [{ Bearer: [] }],
    responses: {
      200: {
        description: 'Gmail profile retrieved successfully',
        content: {
          'application/json': {
            schema: GmailProfileSchema,
          },
        },
      },
      404: {
        description: 'No Gmail OAuth token found',
        content: {
          'application/json': {
            schema: ErrorSchema,
          },
        },
      },
      500: {
        description: 'Failed to fetch Gmail profile',
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

  router.openapi(profileRoute, async (c) => {
    try {
      const user = c.get('user');
      const container = c.get('container');

      const profile = await container.gmailService.getProfile(user.id);

      return c.json(profile, 200 as const);
    } catch (error) {
      console.error('Error fetching Gmail profile:', error);

      if (error instanceof Error && error.message.includes('No Gmail OAuth token')) {
        return c.json(
          {
            error: 'No Gmail OAuth token found',
            message: 'Please authorize Gmail access first',
          },
          404 as const
        );
      }

      return c.json(
        {
          error: 'Failed to fetch Gmail profile',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500 as const
      );
    }
  });

  /**
   * List Gmail labels
   * GET /api/v1/gmail/labels
   */
  const listLabelsRoute = createRoute({
    method: 'get',
    path: '/labels',
    summary: 'List Gmail labels',
    description:
      "Returns all labels in the user's Gmail account. Use this to find label IDs for filtering messages or setting up watch notifications.",
    tags: ['Gmail'],
    security: [{ Bearer: [] }],
    responses: {
      200: {
        description: 'Labels listed successfully',
        content: {
          'application/json': {
            schema: GmailLabelsListResponseSchema,
          },
        },
      },
      404: {
        description: 'No Gmail OAuth token found',
        content: {
          'application/json': {
            schema: ErrorSchema,
          },
        },
      },
      500: {
        description: 'Failed to fetch labels',
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

  router.openapi(listLabelsRoute, async (c) => {
    try {
      const user = c.get('user');
      const container = c.get('container');

      const response = await container.gmailService.listLabels(user.id);

      return c.json(response, 200 as const);
    } catch (error) {
      console.error('Error fetching Gmail labels:', error);

      if (error instanceof Error && error.message.includes('No Gmail OAuth token')) {
        return c.json(
          {
            error: 'No Gmail OAuth token found',
            message: 'Please authorize Gmail access first',
          },
          404 as const
        );
      }

      return c.json(
        {
          error: 'Failed to fetch Gmail labels',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500 as const
      );
    }
  });

  /**
   * List Gmail messages
   * GET /api/v1/gmail/messages
   */
  const listMessagesRoute = createRoute({
    method: 'get',
    path: '/messages',
    summary: 'List Gmail messages',
    description: "Lists messages in the user's mailbox with optional search query",
    tags: ['Gmail'],
    security: [{ Bearer: [] }],
    request: {
      query: GmailListMessagesQuerySchema,
    },
    responses: {
      200: {
        description: 'Messages listed successfully',
        content: {
          'application/json': {
            schema: GmailListMessagesResponseSchema,
          },
        },
      },
      404: {
        description: 'No Gmail OAuth token found',
        content: {
          'application/json': {
            schema: ErrorSchema,
          },
        },
      },
      500: {
        description: 'Failed to list messages',
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

  router.openapi(listMessagesRoute, async (c) => {
    try {
      const user = c.get('user');
      const container = c.get('container');
      const { q, maxResults, pageToken } = c.req.valid('query');

      const result = await container.gmailService.listMessages(
        user.id,
        q,
        maxResults ?? 50,
        pageToken
      );

      return c.json(
        {
          messages: result.messages || [],
          nextPageToken: result.nextPageToken,
        },
        200 as const
      );
    } catch (error) {
      console.error('Error listing messages:', error);

      if (error instanceof Error && error.message.includes('No Gmail OAuth token')) {
        return c.json(
          {
            error: 'No Gmail OAuth token found',
            message: 'Please authorize Gmail access first',
          },
          404 as const
        );
      }

      return c.json(
        {
          error: 'Failed to list messages',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500 as const
      );
    }
  });

  /**
   * Get a specific Gmail message
   * GET /api/v1/gmail/messages/:messageId
   */
  const getMessageRoute = createRoute({
    method: 'get',
    path: '/messages/{messageId}',
    summary: 'Get Gmail message',
    description: 'Returns a specific Gmail message by ID',
    tags: ['Gmail'],
    security: [{ Bearer: [] }],
    request: {
      params: GmailMessageParamsSchema,
      query: GmailGetMessageQuerySchema,
    },
    responses: {
      200: {
        description: 'Message retrieved successfully',
        content: {
          'application/json': {
            schema: GmailMessageSchema,
          },
        },
      },
      404: {
        description: 'Message or OAuth token not found',
        content: {
          'application/json': {
            schema: ErrorSchema,
          },
        },
      },
      500: {
        description: 'Failed to fetch message',
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

  router.openapi(getMessageRoute, async (c) => {
    try {
      const user = c.get('user');
      const container = c.get('container');
      const { messageId } = c.req.valid('param');
      const { format } = c.req.valid('query');

      const message = await container.gmailService.getMessage(user.id, messageId, format ?? 'full');

      return c.json(message, 200 as const);
    } catch (error) {
      console.error('Error fetching message:', error);

      if (error instanceof Error && error.message.includes('No Gmail OAuth token')) {
        return c.json(
          {
            error: 'No Gmail OAuth token found',
            message: 'Please authorize Gmail access first',
          },
          404 as const
        );
      }

      if (error instanceof Error && error.message.includes('404')) {
        return c.json(
          {
            error: 'Message not found',
          },
          404 as const
        );
      }

      return c.json(
        {
          error: 'Failed to fetch message',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500 as const
      );
    }
  });

  /**
   * Get message attachment
   * GET /api/v1/gmail/messages/:messageId/attachments/:attachmentId
   */
  const getAttachmentRoute = createRoute({
    method: 'get',
    path: '/messages/{messageId}/attachments/{attachmentId}',
    summary: 'Get message attachment',
    description: 'Returns the attachment data for a specific message',
    tags: ['Gmail'],
    security: [{ Bearer: [] }],
    request: {
      params: GmailAttachmentParamsSchema,
    },
    responses: {
      200: {
        description: 'Attachment retrieved successfully',
        content: {
          'application/json': {
            schema: GmailAttachmentResponseSchema,
          },
        },
      },
      404: {
        description: 'Attachment or OAuth token not found',
        content: {
          'application/json': {
            schema: ErrorSchema,
          },
        },
      },
      500: {
        description: 'Failed to fetch attachment',
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

  router.openapi(getAttachmentRoute, async (c) => {
    try {
      const user = c.get('user');
      const container = c.get('container');
      const { messageId, attachmentId } = c.req.valid('param');

      const attachment = await container.gmailService.getAttachment(
        user.id,
        messageId,
        attachmentId
      );

      return c.json(attachment, 200 as const);
    } catch (error) {
      console.error('Error fetching attachment:', error);

      if (error instanceof Error && error.message.includes('No Gmail OAuth token')) {
        return c.json(
          {
            error: 'No Gmail OAuth token found',
            message: 'Please authorize Gmail access first',
          },
          404 as const
        );
      }

      if (error instanceof Error && error.message.includes('404')) {
        return c.json(
          {
            error: 'Attachment not found',
          },
          404 as const
        );
      }

      return c.json(
        {
          error: 'Failed to fetch attachment',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500 as const
      );
    }
  });

  /**
   * Get mailbox history
   * GET /api/v1/gmail/history
   */
  const getHistoryRoute = createRoute({
    method: 'get',
    path: '/history',
    summary: 'Get mailbox history',
    description: 'Returns the history of changes to the mailbox since a given historyId',
    tags: ['Gmail'],
    security: [{ Bearer: [] }],
    request: {
      query: GmailHistoryQuerySchema,
    },
    responses: {
      200: {
        description: 'History retrieved successfully',
        content: {
          'application/json': {
            schema: GmailHistoryResponseSchema,
          },
        },
      },
      404: {
        description: 'No Gmail OAuth token found',
        content: {
          'application/json': {
            schema: ErrorSchema,
          },
        },
      },
      500: {
        description: 'Failed to fetch history',
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

  router.openapi(getHistoryRoute, async (c) => {
    try {
      const user = c.get('user');
      const container = c.get('container');
      const { startHistoryId, maxResults } = c.req.valid('query');

      const history = await container.gmailService.getHistory(
        user.id,
        startHistoryId,
        maxResults ?? 100
      );

      return c.json({ history }, 200 as const);
    } catch (error) {
      console.error('Error fetching history:', error);

      if (error instanceof Error && error.message.includes('No Gmail OAuth token')) {
        return c.json(
          {
            error: 'No Gmail OAuth token found',
            message: 'Please authorize Gmail access first',
          },
          404 as const
        );
      }

      return c.json(
        {
          error: 'Failed to fetch history',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500 as const
      );
    }
  });

  /**
   * Start watching Gmail for changes
   * POST /api/v1/gmail/watch
   */
  const watchRoute = createRoute({
    method: 'post',
    path: '/watch',
    summary: 'Start watching Gmail',
    description: 'Sets up a Gmail push notification subscription via Pub/Sub',
    tags: ['Gmail'],
    security: [{ Bearer: [] }],
    request: {
      body: {
        content: {
          'application/json': {
            schema: GmailWatchRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Watch started successfully',
        content: {
          'application/json': {
            schema: GmailWatchResponseSchema,
          },
        },
      },
      404: {
        description: 'No Gmail OAuth token found',
        content: {
          'application/json': {
            schema: ErrorSchema,
          },
        },
      },
      500: {
        description: 'Failed to start watch',
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

  router.openapi(watchRoute, async (c) => {
    try {
      const user = c.get('user');
      const container = c.get('container');

      const topicName = 'projects/project-4d4e1b26-7614-4156-a58/topics/autofin';
      const labelIds: string[] = AUTOFIN_LABEL_IDS;

      const response = await container.gmailService.watch(user.id, topicName, labelIds);

      // Store the initial history ID from watch response
      // This is the starting point for processing future notifications
      await container.gmailOAuthRepo.updateHistoryId(user.id, response.historyId);
      console.log(`Stored initial history ID ${response.historyId} for user ${user.id}`);

      // Start/refresh the periodic resync loop in Inngest (best-effort; don't fail the route).
      try {
        // If this endpoint is called multiple times, explicitly cancel any prior runs first.
        await inngest.send({
          name: 'gmail/watch.stopped',
          data: { userId: user.id },
        });
        await inngest.send({
          name: 'gmail/watch.started',
          data: {
            userId: user.id,
            topicName,
            labelIds,
          },
        });
      } catch (err) {
        console.warn('Failed to enqueue Inngest Gmail watch resync:', err);
      }

      return c.json(response, 200 as const);
    } catch (error) {
      console.error('Error starting watch:', error);

      if (error instanceof Error && error.message.includes('No Gmail OAuth token')) {
        return c.json(
          {
            error: 'No Gmail OAuth token found',
            message: 'Please authorize Gmail access first',
          },
          404 as const
        );
      }

      return c.json(
        {
          error: 'Failed to start watch',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500 as const
      );
    }
  });

  /**
   * Get current Gmail watch status
   * GET /api/v1/gmail/watch/status
   *
   * Since Gmail API doesn't have a "list watches" endpoint, this calls the watch API
   * which is idempotent and returns info about the current/new watch.
   */
  const watchStatusRoute = createRoute({
    method: 'get',
    path: '/watch/status',
    summary: 'Get Gmail watch status',
    description:
      'Checks if a Gmail watch exists by calling the watch API (idempotent). Returns current watch info including expiration.',
    tags: ['Gmail'],
    security: [{ Bearer: [] }],
    responses: {
      200: {
        description: 'Watch status retrieved successfully',
        content: {
          'application/json': {
            schema: GmailWatchStatusResponseSchema,
          },
        },
      },
      404: {
        description: 'No Gmail OAuth token found',
        content: {
          'application/json': {
            schema: ErrorSchema,
          },
        },
      },
      500: {
        description: 'Failed to get watch status',
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

  router.openapi(watchStatusRoute, async (c) => {
    try {
      const user = c.get('user');
      const container = c.get('container');

      const topicName = 'projects/project-4d4e1b26-7614-4156-a58/topics/autofin';
      const labelIds: string[] = AUTOFIN_LABEL_IDS;

      // Calling watch() is idempotent - it returns current watch info if one exists
      const response = await container.gmailService.watch(user.id, topicName, labelIds);

      // Store/update the history ID from watch response
      await container.gmailOAuthRepo.updateHistoryId(user.id, response.historyId);

      // Parse expiration (it's epoch milliseconds as a string)
      const expirationMs = parseInt(response.expiration, 10);
      const expiresAt = new Date(expirationMs);
      const now = new Date();
      const hoursUntilExpiry = (expirationMs - now.getTime()) / (1000 * 60 * 60);

      return c.json(
        {
          hasWatch: true,
          historyId: response.historyId,
          expiration: response.expiration,
          expiresAt: expiresAt.toISOString(),
          expiresInHours: Math.round(hoursUntilExpiry * 10) / 10,
          isExpired: expiresAt < now,
          topicName,
          message: `Watch active, expires in ${Math.round(hoursUntilExpiry)} hours`,
        },
        200 as const
      );
    } catch (error) {
      console.error('Error getting watch status:', error);

      if (error instanceof Error && error.message.includes('No Gmail OAuth token')) {
        return c.json(
          {
            error: 'No Gmail OAuth token found',
            message: 'Please authorize Gmail access first',
          },
          404 as const
        );
      }

      return c.json(
        {
          error: 'Failed to get watch status',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500 as const
      );
    }
  });

  /**
   * Stop watching Gmail for changes
   * DELETE /api/v1/gmail/watch
   */
  const stopWatchRoute = createRoute({
    method: 'delete',
    path: '/watch',
    summary: 'Stop watching Gmail',
    description: 'Stops the Gmail push notification subscription',
    tags: ['Gmail'],
    security: [{ Bearer: [] }],
    responses: {
      200: {
        description: 'Watch stopped successfully',
        content: {
          'application/json': {
            schema: SuccessSchema,
          },
        },
      },
      404: {
        description: 'No Gmail OAuth token found',
        content: {
          'application/json': {
            schema: ErrorSchema,
          },
        },
      },
      500: {
        description: 'Failed to stop watch',
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

  router.openapi(stopWatchRoute, async (c) => {
    try {
      const user = c.get('user');
      const container = c.get('container');

      await container.gmailService.stopWatch(user.id);

      // Cancel any running resync loop for this user (best-effort).
      try {
        await inngest.send({
          name: 'gmail/watch.stopped',
          data: { userId: user.id },
        });
      } catch (err) {
        console.warn('Failed to enqueue Inngest Gmail watch cancel event:', err);
      }

      return c.json(
        {
          success: true,
          message: 'Gmail watch stopped successfully',
        },
        200 as const
      );
    } catch (error) {
      console.error('Error stopping watch:', error);

      if (error instanceof Error && error.message.includes('No Gmail OAuth token')) {
        return c.json(
          {
            error: 'No Gmail OAuth token found',
            message: 'Please authorize Gmail access first',
          },
          404 as const
        );
      }

      return c.json(
        {
          error: 'Failed to stop watch',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500 as const
      );
    }
  });

  return router;
};
