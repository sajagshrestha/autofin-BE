import type { Database } from '@/db/connection';
import type { CategoryRepository } from '@/repositories/category.repository';
import type { GmailOAuthRepository } from '@/repositories/gmail-oauth.repository';
import type { TransactionRepository } from '@/repositories/transaction.repository';
import { BaseService } from './base.service';
import type { TransactionExtractorService } from './transaction-extractor.service';

/**
 * Gmail API types
 */
export interface GmailNotification {
  emailAddress: string;
  historyId: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  historyId: string;
  internalDate: string;
  payload?: GmailMessagePart;
  sizeEstimate: number;
}

export interface GmailMessagePart {
  partId: string;
  mimeType: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: {
    attachmentId?: string;
    size: number;
    data?: string; // Base64 encoded
  };
  parts?: GmailMessagePart[];
}

export interface GmailHistory {
  historyId: string;
  messages?: Array<{ id: string; threadId: string }>;
  messagesAdded?: Array<{
    message: GmailMessage;
  }>;
  messagesDeleted?: Array<{
    message: { id: string; threadId: string };
  }>;
  labelsAdded?: Array<{
    message: { id: string; threadId: string };
    labelIds: string[];
  }>;
  labelsRemoved?: Array<{
    message: { id: string; threadId: string };
    labelIds: string[];
  }>;
}

export interface GmailLabel {
  id: string;
  name: string;
  messageListVisibility?: 'show' | 'hide';
  labelListVisibility?: 'labelShow' | 'labelShowIfUnread' | 'labelHide';
  type: 'system' | 'user';
  messagesTotal?: number;
  messagesUnread?: number;
  threadsTotal?: number;
  threadsUnread?: number;
  color?: {
    textColor: string;
    backgroundColor: string;
  };
}

export interface GmailLabelsListResponse {
  labels: GmailLabel[];
}

export interface GmailProfile {
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
  historyId: string;
}

export interface GmailWatchResponse {
  historyId: string;
  expiration: string;
}

/**
 * Result of processing a Gmail notification
 */
export interface ProcessNotificationResult {
  success: boolean;
  historyId: string;
  processedCount: number;
  failedCount: number;
  errors: Array<{ messageId: string; error: string }>;
}

/**
 * GmailService - Service for interacting with Gmail API
 *
 * This service provides methods to:
 * - Process Gmail notifications from Pub/Sub
 * - Fetch email messages and details
 * - Get history changes
 * - Manage watch subscriptions
 * - Handle OAuth token management
 */
export class GmailService extends BaseService {
  private readonly gmailApiBaseUrl = 'https://gmail.googleapis.com/gmail/v1';
  private readonly oauthTokenUrl = 'https://oauth2.googleapis.com/token';

  constructor(
    db: Database,
    private readonly gmailOAuthRepo: GmailOAuthRepository,
    private readonly transactionRepo: TransactionRepository,
    private readonly categoryRepo: CategoryRepository,
    private readonly transactionExtractor: TransactionExtractorService
  ) {
    super(db);
  }

  /**
   * Get OAuth2 access token for a user
   * Fetches from database and refreshes if expired
   */
  private async getAccessToken(userId: string): Promise<string> {
    const token = await this.gmailOAuthRepo.findByUserId(userId);

    if (!token) {
      throw new Error(`No Gmail OAuth token found for user ${userId}`);
    }

    // Check if token is expired (with 5 minute buffer)
    const expiresAt = new Date(token.expiresAt);
    const now = new Date();
    const buffer = 5 * 60 * 1000; // 5 minutes in milliseconds

    if (expiresAt.getTime() > now.getTime() + buffer) {
      // Token is still valid
      return token.accessToken;
    }

    // Token is expired or about to expire, refresh it
    return this.refreshAccessToken(userId, token.refreshToken);
  }

  /**
   * Refresh an expired access token
   */
  async refreshAccessToken(userId: string, refreshToken: string): Promise<string> {
    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Gmail OAuth credentials not configured');
    }

    const response = await fetch(this.oauthTokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(
        `Failed to refresh token: ${response.status} ${response.statusText} - ${JSON.stringify(error)}`
      );
    }

    const data = await response.json();

    // Update token in database
    const expiresAt = new Date(Date.now() + data.expires_in * 1000);
    await this.gmailOAuthRepo.updateByUserId(userId, {
      accessToken: data.access_token,
      expiresAt,
      updatedAt: new Date(),
    });

    return data.access_token;
  }

  /**
   * Store OAuth tokens after successful authorization
   */
  async storeTokens(
    userId: string,
    emailAddress: string,
    accessToken: string,
    refreshToken: string,
    expiresIn: number,
    scope: string
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    // Check if token already exists for this user
    const existingToken = await this.gmailOAuthRepo.findByUserId(userId);

    if (existingToken) {
      // Update existing token
      await this.gmailOAuthRepo.update(existingToken.id, {
        emailAddress,
        accessToken,
        refreshToken,
        expiresAt,
        scope,
        updatedAt: new Date(),
      });
    } else {
      // Create new token
      // Generate a UUID for the token ID
      const tokenId = crypto.randomUUID();
      await this.gmailOAuthRepo.create({
        id: tokenId,
        userId,
        emailAddress,
        accessToken,
        refreshToken,
        expiresAt,
        scope,
      });
    }
  }

  /**
   * Make authenticated request to Gmail API
   */
  private async gmailRequest<T>(
    userId: string,
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const accessToken = await this.getAccessToken(userId);
    const url = `${this.gmailApiBaseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(
        `Gmail API error: ${response.status} ${response.statusText} - ${JSON.stringify(error)}`
      );
    }

    return response.json();
  }

  /**
   * Get user's Gmail profile
   */
  async getProfile(userId: string): Promise<GmailProfile> {
    return this.gmailRequest<GmailProfile>(userId, '/users/me/profile');
  }

  /**
   * Process a Gmail notification from Pub/Sub
   * Fetches new messages, logs their details, and marks them as read
   *
   * @param userId - The user ID
   * @param notification - The Gmail notification from Pub/Sub
   * @param storedHistoryId - The last processed history ID stored in the database
   * @returns The result including the new history ID to store
   */
  async processNotification(
    userId: string,
    notification: GmailNotification,
    storedHistoryId: string | null
  ): Promise<ProcessNotificationResult> {
    // Use stored history ID if available, otherwise use notification's history ID
    const historyIdToUse = storedHistoryId || notification.historyId;

    const result: ProcessNotificationResult = {
      success: true,
      historyId: notification.historyId, // Always return the new history ID from notification
      processedCount: 0,
      failedCount: 0,
      errors: [],
    };

    console.log(
      `Processing notification for user ${userId}, ` +
        `storedHistoryId: ${storedHistoryId}, notificationHistoryId: ${notification.historyId}, ` +
        `using: ${historyIdToUse}`
    );

    // Fetch history changes using stored history ID
    let history: GmailHistory[];
    try {
      history = await this.getHistory(userId, historyIdToUse);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Handle specific Gmail API errors
      if (errorMessage.includes('404') || errorMessage.includes('notFound')) {
        // History ID is too old or invalid - this is common and not critical
        console.warn(
          `History ID ${notification.historyId} not found or expired for user ${userId}`
        );
        return {
          ...result,
          success: true, // Not a failure, just no history to process
          errors: [{ messageId: 'history', error: 'History ID expired or not found' }],
        };
      }

      if (errorMessage.includes('401') || errorMessage.includes('invalid_grant')) {
        // Token expired or revoked
        console.error(`OAuth token invalid for user ${userId}:`, errorMessage);
        return {
          ...result,
          success: false,
          errors: [{ messageId: 'auth', error: 'OAuth token expired or revoked' }],
        };
      }

      console.error(`Failed to fetch history for user ${userId}:`, error);
      return {
        ...result,
        success: false,
        errors: [{ messageId: 'history', error: errorMessage }],
      };
    }

    // Track processed message IDs to avoid duplicates
    const processedMessageIds = new Set<string>();

    // Fetch available categories once for all messages in this batch
    const availableCategories = await this.categoryRepo.findAllForUser(userId);
    const categoryInfoForAI = availableCategories.map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
    }));

    // Process each history entry
    for (const historyEntry of history) {
      if (historyEntry.messagesAdded) {
        // New messages received
        for (const messageAdded of historyEntry.messagesAdded) {
          const messageId = messageAdded.message.id;

          // Skip if already processed in this batch
          if (processedMessageIds.has(messageId)) {
            continue;
          }
          processedMessageIds.add(messageId);

          try {
            // STEP 1: Check for duplicates BEFORE calling AI (saves cost)
            const existingTransaction = await this.transactionRepo.findByEmailId(messageId);
            if (existingTransaction) {
              console.log(`Email ${messageId} already processed, skipping AI extraction`);
              result.processedCount++;
              continue;
            }

            // Fetch full message details
            const message = await this.getMessage(userId, messageId, 'full');
            const headers = this.getMessageHeaders(message);
            const body = this.getMessageBody(message);

            // Log the email details
            console.log('========== NEW EMAIL RECEIVED ==========');
            console.log('Message ID:', messageId);
            console.log('Thread ID:', message.threadId);
            console.log('From:', headers.from || 'Unknown');
            console.log('To:', headers.to || 'Unknown');
            console.log('Subject:', headers.subject || '(No Subject)');
            console.log('Date:', headers.date || message.internalDate);
            console.log('Labels:', message.labelIds.join(', '));
            console.log('Snippet:', message.snippet);
            console.log('Body Preview:', body.substring(0, 500) + (body.length > 500 ? '...' : ''));
            console.log('=========================================');

            // STEP 2: Extract transaction data using AI with tool calling
            // AI will select category from the database categories via tool call
            const extractionResult = await this.transactionExtractor.extractFromEmail(
              {
                subject: headers.subject,
                body: body,
                from: headers.from,
              },
              categoryInfoForAI
            );

            // STEP 3: Save transaction if it's a bank email
            if (
              this.transactionExtractor.isValidTransaction(extractionResult) &&
              extractionResult.transaction
            ) {
              const txn = extractionResult.transaction;

              // Handle category: either use selected ID or create new category
              let categoryId = txn.categoryId;

              if (txn.newCategory) {
                // AI suggested creating a new category
                try {
                  const newCategory = await this.categoryRepo.create({
                    id: crypto.randomUUID(),
                    userId, // Associate with this user
                    name: txn.newCategory.name,
                    icon: txn.newCategory.icon,
                    isDefault: false, // User-specific category created by AI
                    isAiCreated: true, // Created by AI
                  });
                  categoryId = newCategory.id;
                  console.log(
                    `Created new category: ${newCategory.icon} ${newCategory.name} (${newCategory.id})`
                  );
                } catch (categoryError) {
                  // If category creation fails (e.g., duplicate name), try to find existing
                  console.warn(
                    `Failed to create category "${txn.newCategory.name}", looking for existing:`,
                    categoryError
                  );
                  const existingCategory = await this.categoryRepo.findByNameForUser(
                    txn.newCategory.name,
                    userId
                  );
                  if (existingCategory) {
                    categoryId = existingCategory.id;
                    console.log(`Using existing category: ${existingCategory.name}`);
                  }
                }
              }

              // Parse transaction date
              let transactionDate: Date | null = null;
              if (txn.date) {
                try {
                  transactionDate = new Date(txn.date);
                  // If time is also available, combine them
                  if (txn.time) {
                    const [hours, minutes, seconds] = txn.time.split(':').map(Number);
                    transactionDate.setHours(hours || 0, minutes || 0, seconds || 0);
                  }
                } catch {
                  console.warn(`Failed to parse transaction date: ${txn.date}`);
                }
              }

              try {
                await this.transactionRepo.create({
                  id: crypto.randomUUID(),
                  userId,
                  categoryId,
                  amount: txn.amount.toString(),
                  type: txn.type,
                  currency: 'NPR',
                  merchant: txn.merchant,
                  accountNumber: txn.accountLastFour,
                  bankName: txn.bankName,
                  transactionDate,
                  remarks: txn.remarks,
                  emailId: messageId,
                  rawEmailContent: body.substring(0, 10000), // Limit storage size
                  aiConfidence: txn.confidence.toString(),
                  aiExtractedData: extractionResult,
                  isAiCreated: true, // Created by AI from email
                });

                const categoryLabel = txn.newCategory
                  ? `${txn.newCategory.icon} ${txn.newCategory.name} (new)`
                  : txn.categoryName || 'Uncategorized';
                console.log(
                  `Transaction saved: ${txn.type} ${txn.amount} from ${txn.merchant || 'Unknown'} [${categoryLabel}]`
                );
              } catch (saveError) {
                // Handle race condition where duplicate was inserted between check and insert
                if (this.isUniqueConstraintError(saveError)) {
                  console.log(`Duplicate email ${messageId} detected (race condition), skipping`);
                  continue;
                }
                throw saveError;
              }
            } else {
              console.log(`Email ${messageId} is not a transaction email, skipping`);
            }

            // Mark the email as read (remove UNREAD label)
            if (message.labelIds.includes('UNREAD')) {
              try {
                await this.markAsRead(userId, messageId);
                console.log(`Marked message ${messageId} as read`);
              } catch (markError) {
                // Log but don't fail the whole process if marking as read fails
                console.error(`Failed to mark message ${messageId} as read:`, markError);
              }
            }

            result.processedCount++;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            // Handle message not found (deleted before we could fetch it)
            if (errorMessage.includes('404') || errorMessage.includes('notFound')) {
              console.warn(`Message ${messageId} not found (may have been deleted)`);
              continue;
            }

            console.error(`Failed to process message ${messageId}:`, error);
            result.failedCount++;
            result.errors.push({ messageId, error: errorMessage });
          }
        }
      }

      if (historyEntry.messagesDeleted) {
        for (const messageDeleted of historyEntry.messagesDeleted) {
          console.log('Message deleted:', messageDeleted.message.id);
        }
      }

      if (historyEntry.labelsAdded) {
        for (const labelAdded of historyEntry.labelsAdded) {
          console.log('Labels added to message:', labelAdded.message.id, labelAdded.labelIds);
        }
      }

      if (historyEntry.labelsRemoved) {
        for (const labelRemoved of historyEntry.labelsRemoved) {
          console.log(
            'Labels removed from message:',
            labelRemoved.message.id,
            labelRemoved.labelIds
          );
        }
      }
    }

    console.log(`Processed ${result.processedCount} message(s), ${result.failedCount} failed`);

    // Mark as failed if all messages failed
    if (result.processedCount === 0 && result.failedCount > 0) {
      result.success = false;
    }

    return result;
  }

  /**
   * Mark a message as read (remove UNREAD label)
   */
  async markAsRead(userId: string, messageId: string): Promise<void> {
    await this.modifyMessage(userId, messageId, { removeLabelIds: ['UNREAD'] });
  }

  /**
   * Mark a message as unread (add UNREAD label)
   */
  async markAsUnread(userId: string, messageId: string): Promise<void> {
    await this.modifyMessage(userId, messageId, { addLabelIds: ['UNREAD'] });
  }

  /**
   * Modify message labels (add or remove labels)
   */
  async modifyMessage(
    userId: string,
    messageId: string,
    modifications: { addLabelIds?: string[]; removeLabelIds?: string[] }
  ): Promise<GmailMessage> {
    return this.gmailRequest<GmailMessage>(userId, `/users/me/messages/${messageId}/modify`, {
      method: 'POST',
      body: JSON.stringify(modifications),
    });
  }

  /**
   * Get history changes since a specific historyId
   */
  async getHistory(
    userId: string,
    startHistoryId: string,
    maxResults: number = 100
  ): Promise<GmailHistory[]> {
    try {
      const params = new URLSearchParams({
        startHistoryId: startHistoryId,
        maxResults: maxResults.toString(),
      });

      const response = await this.gmailRequest<{ history: GmailHistory[] }>(
        userId,
        `/users/me/history?${params.toString()}`
      );

      return response.history || [];
    } catch (error) {
      console.error('Failed to get history:', error);
      throw error;
    }
  }

  /**
   * List messages matching a query
   */
  async listMessages(
    userId: string,
    query?: string,
    maxResults: number = 50,
    pageToken?: string
  ): Promise<{ messages: Array<{ id: string; threadId: string }>; nextPageToken?: string }> {
    const params = new URLSearchParams({
      maxResults: maxResults.toString(),
    });

    if (query) {
      params.append('q', query);
    }

    if (pageToken) {
      params.append('pageToken', pageToken);
    }

    return this.gmailRequest<{
      messages: Array<{ id: string; threadId: string }>;
      nextPageToken?: string;
    }>(userId, `/users/me/messages?${params.toString()}`);
  }

  /**
   * Get a specific message by ID
   */
  async getMessage(
    userId: string,
    messageId: string,
    format: 'full' | 'metadata' | 'minimal' = 'full'
  ): Promise<GmailMessage> {
    const params = new URLSearchParams({
      format,
    });

    return this.gmailRequest<GmailMessage>(
      userId,
      `/users/me/messages/${messageId}?${params.toString()}`
    );
  }

  /**
   * Get message attachment
   */
  async getAttachment(
    userId: string,
    messageId: string,
    attachmentId: string
  ): Promise<{ size: number; data: string }> {
    return this.gmailRequest<{ size: number; data: string }>(
      userId,
      `/users/me/messages/${messageId}/attachments/${attachmentId}`
    );
  }

  /**
   * List all labels for the user
   */
  async listLabels(userId: string): Promise<GmailLabelsListResponse> {
    return this.gmailRequest<GmailLabelsListResponse>(userId, '/users/me/labels');
  }

  /**
   * Get a specific label by ID
   */
  async getLabel(userId: string, labelId: string): Promise<GmailLabel> {
    return this.gmailRequest<GmailLabel>(userId, `/users/me/labels/${labelId}`);
  }

  /**
   * Find a label by name
   * Returns the label if found, null otherwise
   */
  async findLabelByName(userId: string, labelName: string): Promise<GmailLabel | null> {
    const { labels } = await this.listLabels(userId);
    return labels.find((label) => label.name.toLowerCase() === labelName.toLowerCase()) || null;
  }

  /**
   * Start watching for Gmail changes
   * This sets up a push notification subscription via Pub/Sub
   */
  async watch(userId: string, topicName: string, labelIds?: string[]): Promise<GmailWatchResponse> {
    const body = {
      topicName,
      labelIds: labelIds || [],
      labelFilterBehavior: 'include',
    };

    return this.gmailRequest<GmailWatchResponse>(userId, '/users/me/watch', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * Stop watching for Gmail changes
   */
  async stopWatch(userId: string): Promise<void> {
    await this.gmailRequest(userId, '/users/me/stop', {
      method: 'POST',
    });
  }

  /**
   * Decode base64 email body
   */
  decodeMessageBody(data: string): string {
    return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
  }

  /**
   * Extract email headers from message
   */
  getMessageHeaders(message: GmailMessage): Record<string, string> {
    const headers: Record<string, string> = {};

    const extractHeaders = (part: GmailMessagePart) => {
      if (part.headers) {
        for (const header of part.headers) {
          headers[header.name.toLowerCase()] = header.value;
        }
      }
      if (part.parts) {
        for (const subPart of part.parts) {
          extractHeaders(subPart);
        }
      }
    };

    if (message.payload) {
      extractHeaders(message.payload);
    }

    return headers;
  }

  /**
   * Get email body text from message
   */
  getMessageBody(message: GmailMessage): string {
    if (!message.payload) {
      return '';
    }

    const extractBody = (part: GmailMessagePart): string => {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return this.decodeMessageBody(part.body.data);
      }
      if (part.mimeType === 'text/html' && part.body?.data) {
        return this.decodeMessageBody(part.body.data);
      }
      if (part.parts) {
        for (const subPart of part.parts) {
          const body = extractBody(subPart);
          if (body) {
            return body;
          }
        }
      }
      return '';
    };

    return extractBody(message.payload);
  }

  /**
   * Check if an error is a unique constraint violation
   * This is used for idempotent transaction processing
   */
  private isUniqueConstraintError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      // PostgreSQL unique constraint violation codes/messages
      return (
        message.includes('unique constraint') ||
        message.includes('duplicate key') ||
        message.includes('23505') // PostgreSQL unique violation error code
      );
    }
    return false;
  }
}
