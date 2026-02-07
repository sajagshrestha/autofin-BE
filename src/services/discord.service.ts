/**
 * DiscordService - posts to a Discord webhook for new transactions and extractor failures.
 * No-op when webhook URL is unset or empty. Catches fetch errors so a bad webhook does not break the app.
 */

export type NewTransactionSource = 'api' | 'api_sms' | 'gmail';

const FRONTEND_BASE = 'https://autofin-fe.vercel.app';

export interface NewTransactionPayload {
  id: string;
  amount: string;
  type: 'debit' | 'credit';
  merchant: string | null;
  source: NewTransactionSource;
  category?: string | null;
  transactionDate?: string | null;
}

export interface DiscordService {
  notifyNewTransaction(payload: NewTransactionPayload): Promise<void>;
  notifyExtractorFailed(context: 'email' | 'sms', error: unknown): Promise<void>;
}

function getWebhookUrl(override?: string): string {
  const url = override ?? process.env.DISCORD_WEBHOOK_URL ?? '';
  return typeof url === 'string' ? url.trim() : '';
}

export class DiscordServiceImpl implements DiscordService {
  private readonly webhookUrl: string;

  constructor(webhookUrl?: string) {
    this.webhookUrl = getWebhookUrl(webhookUrl);
  }

  async notifyNewTransaction(payload: NewTransactionPayload): Promise<void> {
    console.info(`hello from discord service: ${JSON.stringify(payload)}`);
    if (!this.webhookUrl) return;

    const typeEmoji = payload.type === 'credit' ? '💰' : '💸';
    const sourceEmoji = payload.source === 'api' ? '✏️' : payload.source === 'api_sms' ? '📱' : '📧';
    const sourceLabel =
      payload.source === 'api'
        ? 'Manual (API)'
        : payload.source === 'api_sms'
          ? 'SMS (API)'
          : 'Gmail';
    const category = payload.category ?? '—';
    const merchant = payload.merchant ?? '—';
    const date = payload.transactionDate ?? new Date().toISOString();
    const link = `${FRONTEND_BASE}/transactions/${payload.id}`;

    const content = [
      `## ${typeEmoji} New transaction`,
      ``,
      `**${typeEmoji} Amount:** ${payload.amount} (${payload.type})`,
      `**🏪 Merchant:** ${merchant}`,
      `**📁 Category:** ${category}`,
      `**${sourceEmoji} Source:** ${sourceLabel}`,
      `**📅 Date:** ${date}`,
      ``,
      `🔗 [View in AutoFin](${link})`,
    ].join('\n');

    await this.post({ content });
  }

  async notifyExtractorFailed(context: 'email' | 'sms', error: unknown): Promise<void> {
    if (!this.webhookUrl) return;

    const contextEmoji = context === 'email' ? '📧' : '📱';
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error && error.stack ? `\n\`\`\`\n${error.stack}\n\`\`\`` : '';

    const content = [
      `## ⚠️ Transaction extractor failed`,
      ``,
      `**${contextEmoji} Context:** ${context}`,
      `**❌ Error:** ${message}${stack}`,
    ].join('\n');

    await this.post({ content });
  }

  private async post(body: { content?: string; embeds?: unknown[] }): Promise<void> {
    try {
      const res = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        console.error(`Discord webhook failed: ${res.status} ${res.statusText}`);
      }
    } catch (err) {
      console.error('Discord webhook request failed:', err);
    }
  }
}
