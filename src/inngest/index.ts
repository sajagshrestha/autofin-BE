import { gmailWatchResync } from '@/inngest/functions/gmail-watch-resync';

export { inngest } from '@/inngest/client';

export const functions = [gmailWatchResync];
