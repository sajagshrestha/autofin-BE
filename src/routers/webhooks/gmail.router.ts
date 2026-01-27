import { Hono } from 'hono';
import type { GmailOAuthToken } from '@/db/schema';
import type { Container } from '@/lib/container';

type GmailWebhookEnv = {
  Variables: {
    container: Container;
  };
};

interface PubSubMessage {
  message: {
    data: string; // Base64 encoded message data
    messageId: string;
    publishTime: string;
    attributes?: Record<string, string>;
  };
  subscription: string;
}

interface GmailNotification {
  emailAddress: string;
  historyId: string;
}

export const createGmailWebhookRouter = () => {
  const router = new Hono<GmailWebhookEnv>();

  /**
   * Webhook endpoint for Gmail Pub/Sub notifications
   * POST /webhooks/gmail
   *
   * This endpoint receives push notifications from Google Cloud Pub/Sub
   * when Gmail events occur (new emails, label changes, etc.)
   */
  router.post('/', async (c) => {
    try {
      const body: PubSubMessage = await c.req.json();

      // Verify the message structure
      if (!body.message || !body.message.data) {
        return c.json(
          {
            success: false,
            error: 'Invalid message format',
          },
          400
        );
      }

      // Decode the base64 message data
      const messageData = Buffer.from(body.message.data, 'base64').toString('utf-8');
      const gmailNotification: GmailNotification = JSON.parse(messageData);

      console.log('Gmail webhook received:', {
        messageId: body.message.messageId,
        emailAddress: gmailNotification.emailAddress,
        historyId: gmailNotification.historyId,
        publishTime: body.message.publishTime,
      });

      // return c.json({
      //   success: true,
      //   message: 'Gmail notification received',
      //   messageId: body.message.messageId,
      //   receivedAt: new Date().toISOString(),
      // });

      // Process Gmail notification
      const container = c.get('container');

      // Find user by email address from the notification
      let token: GmailOAuthToken | null;
      try {
        console.log('Looking up token for email:', gmailNotification.emailAddress);
        token = await container.gmailOAuthRepo.findByEmailAddress(gmailNotification.emailAddress);
        console.log('Token lookup complete:', token ? 'found' : 'not found');
      } catch (dbError) {
        console.error('Database error looking up token:', dbError);
        // Return 200 to acknowledge but log the error
        return c.json({
          success: false,
          error: 'Database error',
          messageId: body.message.messageId,
        });
      }

      if (!token) {
        console.warn(`No OAuth token found for email: ${gmailNotification.emailAddress}`);
        // Still return 200 to acknowledge the message to Pub/Sub
        return c.json({
          success: false,
          message: 'No OAuth token found for this email address',
          messageId: body.message.messageId,
        });
      }

      // Process the notification using stored history ID
      const result = await container.gmailService.processNotification(
        token.userId,
        gmailNotification,
        token.historyId // Use stored history ID from database
      );

      // Update the history ID in database with the new one from notification
      if (result.success) {
        await container.gmailOAuthRepo.updateHistoryIdByEmail(
          gmailNotification.emailAddress,
          result.historyId
        );
        console.log(
          `Updated history ID to ${result.historyId} for ${gmailNotification.emailAddress}`
        );
      }

      // Return 200 OK to acknowledge the message to Pub/Sub
      return c.json({
        success: true,
        message: 'Gmail notification received and processed',
        messageId: body.message.messageId,
        receivedAt: new Date().toISOString(),
        processedCount: result.processedCount,
      });
    } catch (error) {
      console.error('Error processing Gmail webhook:', error);

      // Still return 200 to prevent Pub/Sub from retrying
      // You might want to log this to a dead-letter queue instead
      return c.json(
        {
          success: false,
          error: 'Failed to process webhook',
        },
        200
      );
    }
  });

  /**
   * Health check for Gmail webhook
   * GET /webhooks/gmail/health
   */
  router.get('/health', (c) => {
    return c.json({
      status: 'ok',
      service: 'gmail-webhook',
      timestamp: new Date().toISOString(),
    });
  });

  return router;
};
