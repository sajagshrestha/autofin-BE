import { Hono } from 'hono';
import type { Container } from '../../lib/container';

type MakeWebhookEnv = {
  Variables: {
    container: Container;
  };
  Bindings: {
    MAKE_API_KEY?: string;
  };
};

export const createMakeWebhookRouter = () => {
  const router = new Hono<MakeWebhookEnv>();

  /**
   * Webhook endpoint for Make to send data
   * POST /webhooks/make
   */
  router.post('/', async (c) => {
    const body = await c.req.json();

    // Process webhook data from Make
    // You can add business logic here, e.g., save to database, trigger events, etc.
    // Access container via: const container = c.get('container');

    try {
      // Example: Log the webhook payload
      console.log('Make webhook received:', body);

      // Example: You could save webhook data to database
      // const container = c.get('container');
      // const webhookData = await container.webhookService.save(body);

      return c.json({
        success: true,
        message: 'Webhook received successfully',
        receivedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error processing Make webhook:', error);
      return c.json(
        {
          success: false,
          error: 'Failed to process webhook',
        },
        500
      );
    }
  });

  /**
   * Health check for Make webhook
   * GET /webhooks/make/health
   */
  router.get('/health', (c) => {
    return c.json({
      status: 'ok',
      service: 'make-webhook',
      timestamp: new Date().toISOString(),
    });
  });

  return router;
};
