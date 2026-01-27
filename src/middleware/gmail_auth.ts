import type { MiddlewareHandler } from 'hono';

/**
 * Middleware to verify Google Cloud Pub/Sub push subscription messages
 *
 * Google Cloud Pub/Sub can optionally send a verification token in headers.
 * For production, you should verify the message signature using the
 * X-Goog-Signature header and your Pub/Sub subscription secret.
 */
export const gmailAuth: MiddlewareHandler = async (c, next) => {
  // Check for Pub/Sub verification token (optional, for initial subscription verification)
  const verificationToken = c.req.header('x-verification-token');
  const expectedToken = process.env.GMAIL_PUBSUB_VERIFICATION_TOKEN;

  if (verificationToken && expectedToken && verificationToken !== expectedToken) {
    return c.json({ error: 'Invalid verification token' }, 401);
  }

  // For production, you should verify the message signature
  // This is a simplified version - you may want to implement full signature verification
  const signature = c.req.header('x-goog-signature');
  const pubsubSecret = process.env.GMAIL_PUBSUB_SECRET;

  if (pubsubSecret && signature) {
    // In production, verify the signature here
    // For now, we'll just check if the secret is configured
    // Full signature verification would involve:
    // 1. Getting the raw request body
    // 2. Computing HMAC-SHA1 with the secret
    // 3. Comparing with the signature header
  }

  await next();
};
