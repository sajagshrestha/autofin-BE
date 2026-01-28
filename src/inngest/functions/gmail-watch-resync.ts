import { db } from '@/db/connection';
import { inngest } from '@/inngest/client';
import { createContainer } from '@/lib/container';

type GmailWatchStartedEvent = {
  name: 'gmail/watch.started';
  data: {
    userId: string;
    topicName: string;
    labelIds?: string[];
  };
};

/**
 * Gmail watch expires periodically; this function renews it on a cadence.
 *
 * Triggered by: `gmail/watch.started`
 * Cancelled by:
 * - `gmail/watch.stopped` (same userId)
 * - a newer `gmail/watch.started` (same userId), to avoid duplicate loops per user
 */
export const gmailWatchResync = inngest.createFunction(
  {
    id: 'gmail-watch-resync',
    concurrency: {
      limit: 1,
      key: 'event.data.userId',
    },
    cancelOn: [
      {
        event: 'gmail/watch.stopped',
        if: 'async.data.userId == event.data.userId',
      },
      {
        event: 'gmail/watch.started',
        if: 'async.data.userId == event.data.userId',
      },
    ],
  },
  { event: 'gmail/watch.started' },
  async ({ event, step }) => {
    const { userId, topicName, labelIds } = (event as GmailWatchStartedEvent).data;

    // Default to 12h; can be overridden with env var compatible with `ms` (e.g. "6h", "1d")
    const interval = process.env.GMAIL_WATCH_RESYNC_INTERVAL || '24h';

    // Create container on-demand inside the function runtime.
    const container = createContainer(db);

    // Loop until cancelled
    // Note: cancellation happens between steps, so we sleep between renewals.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await step.run('renew-watch', async () => {
        const response = await container.gmailService.watch(userId, topicName, labelIds);
        await container.gmailOAuthRepo.updateHistoryId(userId, response.historyId);
        return { historyId: response.historyId, expiration: response.expiration };
      });

      await step.sleep('wait-before-renew', interval);
    }
  }
);
