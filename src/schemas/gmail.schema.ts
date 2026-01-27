import { z } from 'zod';

/**
 * Gmail API schemas
 * These can be shared with frontend/mobile apps in a monorepo
 */

export const GmailNotificationSchema = z.object({
  emailAddress: z.string().email(),
  historyId: z.string(),
});

export type GmailNotification = z.infer<typeof GmailNotificationSchema>;

// Gmail message part body schema
const GmailMessagePartBodySchema = z
  .object({
    attachmentId: z.string().optional(),
    size: z.number(),
    data: z.string().optional(), // Base64 encoded
  })
  .optional();

// Gmail message part header schema
const GmailMessagePartHeaderSchema = z.object({
  name: z.string(),
  value: z.string(),
});

// Non-recursive message part schema for OpenAPI compatibility
// Note: Gmail messages can have nested parts, but we flatten for API docs
export const GmailMessagePartSchema = z.object({
  partId: z.string(),
  mimeType: z.string(),
  filename: z.string().optional(),
  headers: z.array(GmailMessagePartHeaderSchema).optional(),
  body: GmailMessagePartBodySchema,
  // Nested parts - using z.any() for OpenAPI compatibility with recursive structures
  parts: z
    .array(
      z.object({
        partId: z.string(),
        mimeType: z.string(),
        filename: z.string().optional(),
        headers: z.array(GmailMessagePartHeaderSchema).optional(),
        body: GmailMessagePartBodySchema,
        parts: z.array(z.any()).optional(),
      })
    )
    .optional(),
});

export const GmailMessageSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  labelIds: z.array(z.string()),
  snippet: z.string(),
  historyId: z.string(),
  internalDate: z.string(),
  payload: GmailMessagePartSchema.optional(),
  sizeEstimate: z.number(),
});

export type GmailMessage = z.infer<typeof GmailMessageSchema>;

export const GmailHistorySchema = z.object({
  historyId: z.string(),
  messages: z
    .array(
      z.object({
        id: z.string(),
        threadId: z.string(),
      })
    )
    .optional(),
  messagesAdded: z
    .array(
      z.object({
        message: GmailMessageSchema,
      })
    )
    .optional(),
  messagesDeleted: z
    .array(
      z.object({
        message: z.object({
          id: z.string(),
          threadId: z.string(),
        }),
      })
    )
    .optional(),
  labelsAdded: z
    .array(
      z.object({
        message: z.object({
          id: z.string(),
          threadId: z.string(),
        }),
        labelIds: z.array(z.string()),
      })
    )
    .optional(),
  labelsRemoved: z
    .array(
      z.object({
        message: z.object({
          id: z.string(),
          threadId: z.string(),
        }),
        labelIds: z.array(z.string()),
      })
    )
    .optional(),
});

export type GmailHistory = z.infer<typeof GmailHistorySchema>;

export const GmailProfileSchema = z.object({
  emailAddress: z.string().email(),
  messagesTotal: z.number(),
  threadsTotal: z.number(),
  historyId: z.string(),
});

export type GmailProfile = z.infer<typeof GmailProfileSchema>;

export const GmailWatchResponseSchema = z.object({
  historyId: z.string(),
  expiration: z.string(),
});

export type GmailWatchResponse = z.infer<typeof GmailWatchResponseSchema>;

/**
 * Watch status response - returns current watch info by calling watch API
 */
export const GmailWatchStatusResponseSchema = z.object({
  hasWatch: z.boolean(),
  historyId: z.string().optional(),
  expiration: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  expiresInHours: z.number().optional(),
  isExpired: z.boolean().optional(),
  topicName: z.string().optional(),
  message: z.string().optional(),
});

export type GmailWatchStatusResponse = z.infer<typeof GmailWatchStatusResponseSchema>;

// ============================================
// Route Request/Response Schemas
// ============================================

/**
 * List messages query parameters
 */
export const GmailListMessagesQuerySchema = z.object({
  q: z.string().optional().openapi({
    description: 'Gmail search query (e.g., "from:example@gmail.com", "is:unread")',
    example: 'is:unread',
  }),
  maxResults: z.coerce.number().int().min(1).max(500).default(50).optional().openapi({
    description: 'Maximum number of messages to return',
    example: 50,
  }),
  pageToken: z.string().optional().openapi({
    description: 'Page token for pagination',
  }),
});

export type GmailListMessagesQuery = z.infer<typeof GmailListMessagesQuerySchema>;

/**
 * List messages response
 */
export const GmailListMessagesResponseSchema = z.object({
  messages: z.array(
    z.object({
      id: z.string(),
      threadId: z.string(),
    })
  ),
  nextPageToken: z.string().optional(),
});

export type GmailListMessagesResponse = z.infer<typeof GmailListMessagesResponseSchema>;

/**
 * Get message path parameters
 */
export const GmailMessageParamsSchema = z.object({
  messageId: z.string().openapi({
    description: 'Gmail message ID',
    example: '18d1234567890abc',
  }),
});

export type GmailMessageParams = z.infer<typeof GmailMessageParamsSchema>;

/**
 * Get message query parameters
 */
export const GmailGetMessageQuerySchema = z.object({
  format: z.enum(['full', 'metadata', 'minimal']).default('full').optional().openapi({
    description: 'The format to return the message in',
    example: 'full',
  }),
});

export type GmailGetMessageQuery = z.infer<typeof GmailGetMessageQuerySchema>;

/**
 * Get attachment path parameters
 */
export const GmailAttachmentParamsSchema = z.object({
  messageId: z.string().openapi({
    description: 'Gmail message ID',
    example: '18d1234567890abc',
  }),
  attachmentId: z.string().openapi({
    description: 'Attachment ID',
    example: 'ANGjdJ8...',
  }),
});

export type GmailAttachmentParams = z.infer<typeof GmailAttachmentParamsSchema>;

/**
 * Attachment response
 */
export const GmailAttachmentResponseSchema = z.object({
  size: z.number(),
  data: z.string().openapi({
    description: 'Base64-encoded attachment data',
  }),
});

export type GmailAttachmentResponse = z.infer<typeof GmailAttachmentResponseSchema>;

/**
 * Watch request body
 */
export const GmailWatchRequestSchema = z.object({
  topicName: z.string().optional().openapi({
    description: 'Google Cloud Pub/Sub topic name',
    example: 'projects/my-project/topics/gmail-notifications',
  }),
  labelIds: z
    .array(z.string())
    .optional()
    .openapi({
      description: 'Label IDs to watch (e.g., ["INBOX", "UNREAD"])',
      example: ['INBOX'],
    }),
});

export type GmailWatchRequest = z.infer<typeof GmailWatchRequestSchema>;

/**
 * History query parameters
 */
export const GmailHistoryQuerySchema = z.object({
  startHistoryId: z.string().openapi({
    description: 'History ID to start from',
  }),
  maxResults: z.coerce.number().int().min(1).max(500).default(100).optional().openapi({
    description: 'Maximum number of history records to return',
    example: 100,
  }),
});

export type GmailHistoryQuery = z.infer<typeof GmailHistoryQuerySchema>;

/**
 * History response
 */
export const GmailHistoryResponseSchema = z.object({
  history: z.array(GmailHistorySchema),
});

export type GmailHistoryResponse = z.infer<typeof GmailHistoryResponseSchema>;

/**
 * Gmail Label schema
 */
export const GmailLabelColorSchema = z.object({
  textColor: z.string().openapi({
    description: 'Text color as hex code',
    example: '#000000',
  }),
  backgroundColor: z.string().openapi({
    description: 'Background color as hex code',
    example: '#ffffff',
  }),
});

export const GmailLabelSchema = z.object({
  id: z.string().openapi({
    description: 'The immutable ID of the label',
    example: 'Label_1234567890123456789',
  }),
  name: z.string().openapi({
    description: 'The display name of the label',
    example: 'My Custom Label',
  }),
  messageListVisibility: z.enum(['show', 'hide']).optional().openapi({
    description: 'Visibility of messages with this label in the message list',
  }),
  labelListVisibility: z.enum(['labelShow', 'labelShowIfUnread', 'labelHide']).optional().openapi({
    description: 'Visibility of the label in the label list',
  }),
  type: z.enum(['system', 'user']).openapi({
    description: 'Label type - system labels are built-in, user labels are custom',
    example: 'user',
  }),
  messagesTotal: z.number().optional().openapi({
    description: 'Total number of messages with this label',
  }),
  messagesUnread: z.number().optional().openapi({
    description: 'Number of unread messages with this label',
  }),
  threadsTotal: z.number().optional().openapi({
    description: 'Total number of threads with this label',
  }),
  threadsUnread: z.number().optional().openapi({
    description: 'Number of unread threads with this label',
  }),
  color: GmailLabelColorSchema.optional().openapi({
    description: 'Label color settings (only for user labels)',
  }),
});

export type GmailLabel = z.infer<typeof GmailLabelSchema>;

/**
 * Labels list response
 */
export const GmailLabelsListResponseSchema = z.object({
  labels: z.array(GmailLabelSchema).openapi({
    description: 'List of labels',
  }),
});

export type GmailLabelsListResponse = z.infer<typeof GmailLabelsListResponseSchema>;
