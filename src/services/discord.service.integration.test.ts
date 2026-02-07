/**
 * Integration tests for DiscordService using a local fake webhook server.
 * No real Discord credentials needed. Run with: bun test src/services/discord.service.integration.test.ts
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { DiscordServiceImpl } from './discord.service';

type ReceivedRequest = { method: string; body: unknown; contentType: string | null };

function createFakeWebhookServer(): { url: string; requests: ReceivedRequest[]; stop: () => void } {
  const requests: ReceivedRequest[] = [];

  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname !== '/webhook') {
        return new Response('Not Found', { status: 404 });
      }
      const contentType = req.headers.get('content-type');
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        body = null;
      }
      requests.push({ method: req.method, body, contentType });
      return new Response('OK', { status: 200 });
    },
  });

  const url = `http://localhost:${server.port}/webhook`;
  return {
    url,
    requests,
    stop: () => server.stop(),
  };
}

describe('DiscordService integration', () => {
  let fake: ReturnType<typeof createFakeWebhookServer>;

  beforeAll(() => {
    fake = createFakeWebhookServer();
  });

  afterAll(() => {
    fake.stop();
  });

  test('notifyNewTransaction sends POST with correct payload and link', async () => {
    fake.requests.length = 0;
    const service = new DiscordServiceImpl(fake.url);
    const txId = 'test-tx-id-123';

    await service.notifyNewTransaction({
      id: txId,
      amount: '100.50',
      type: 'debit',
      merchant: 'Test Store',
      source: 'api',
      category: 'Food',
      transactionDate: new Date('2026-02-01T12:00:00Z').toISOString(),
    });

    expect(fake.requests).toHaveLength(1);
    const [req] = fake.requests;
    expect(req.method).toBe('POST');
    expect(req.contentType).toContain('application/json');
    expect(req.body).toBeDefined();
    const body = req.body as { content?: string };
    expect(body.content).toBeDefined();
    expect(body.content).toContain('New transaction');
    expect(body.content).toContain('100.50');
    expect(body.content).toContain('debit');
    expect(body.content).toContain('Test Store');
    expect(body.content).toContain('Food');
    expect(body.content).toContain('Manual (API)');
    expect(body.content).toContain('https://autofin-fe.vercel.app/transactions/test-tx-id-123');
    expect(body.content).toContain('View in AutoFin');
  });

  test('notifyNewTransaction with source api_sms includes SMS label', async () => {
    fake.requests.length = 0;
    const service = new DiscordServiceImpl(fake.url);

    await service.notifyNewTransaction({
      id: 'sms-tx-456',
      amount: '50',
      type: 'credit',
      merchant: null,
      source: 'api_sms',
    });

    expect(fake.requests).toHaveLength(1);
    const body = (fake.requests[0].body as { content?: string }).content ?? '';
    expect(body).toContain('SMS (API)');
  });

  test('notifyExtractorFailed sends POST with error and context', async () => {
    fake.requests.length = 0;
    const service = new DiscordServiceImpl(fake.url);
    const err = new Error('AI rate limit');

    await service.notifyExtractorFailed('email', err);

    expect(fake.requests).toHaveLength(1);
    const [req] = fake.requests;
    expect(req.method).toBe('POST');
    expect(req.contentType).toContain('application/json');
    const body = req.body as { content?: string };
    expect(body.content).toContain('Transaction extractor failed');
    expect(body.content).toContain('email');
    expect(body.content).toContain('AI rate limit');
  });

  test('notifyExtractorFailed with sms context', async () => {
    fake.requests.length = 0;
    const service = new DiscordServiceImpl(fake.url);

    await service.notifyExtractorFailed('sms', new Error('Invalid SMS format'));

    expect(fake.requests).toHaveLength(1);
    const body = (fake.requests[0].body as { content?: string }).content ?? '';
    expect(body).toContain('Context:** sms');
    expect(body).toContain('Invalid SMS format');
  });

  test('no-op when webhook URL is empty string', async () => {
    fake.requests.length = 0;
    const service = new DiscordServiceImpl('');

    await service.notifyNewTransaction({
      id: 'no-op-id',
      amount: '1',
      type: 'debit',
      merchant: null,
      source: 'api',
    });
    await service.notifyExtractorFailed('email', new Error('test'));

    expect(fake.requests).toHaveLength(0);
  });
});
