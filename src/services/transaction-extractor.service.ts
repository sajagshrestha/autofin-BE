import { generateText, Output } from 'ai';
import { z } from 'zod';
import { getAIModel } from '@/lib/ai';

/**
 * Category info from the database
 */
export interface CategoryInfo {
  id: string;
  name: string;
  icon: string | null;
}

/**
 * Resolve a category reference (ID or name) from the model to a valid category ID.
 * The model sometimes returns category name instead of ID; we accept either and resolve here.
 */
function resolveCategoryId(
  value: string,
  categoryMap: Map<string, CategoryInfo>,
  uncategorized: CategoryInfo | undefined
): string | null {
  if (!value || typeof value !== 'string') return uncategorized?.id ?? null;
  const trimmed = value.trim();
  if (categoryMap.has(trimmed)) return trimmed;
  const byName = Array.from(categoryMap.values()).find(
    (c) => c.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (byName) return byName.id;
  return uncategorized?.id ?? null;
}

/**
 * Schema for extracted transaction data with category selection or creation.
 * categoryId is accepted as string (not strict enum) so we can tolerate the model
 * returning category name or malformed ID and resolve it in code.
 */
function createExtractionSchema(_categoryIds: string[]) {
  // Category selection: either pick existing or create new
  // Accept both "categoryId" and "id" so model output matches (some models return "id")
  const categorySchema = z.discriminatedUnion('action', [
    z
      .object({
        action: z.literal('select_existing'),
        categoryId: z
          .string()
          .optional()
          .describe(
            'The exact category ID from the available categories list (use the id value, e.g. 3dd91f8e-a7a1-44bc-8051-accc3b29ca76)'
          ),
        id: z.string().optional(),
        reason: z
          .string()
          .optional()
          .describe('Brief explanation of why this category was chosen (optional)'),
      })
      .transform((o) => ({
        action: 'select_existing' as const,
        categoryId: o.categoryId ?? o.id ?? '',
        reason: o.reason,
      })),
    z.object({
      action: z.literal('create_new'),
      newCategoryName: z
        .string()
        .min(2)
        .max(50)
        .describe('Name for the new category (2-50 characters, be specific but concise)'),
      newCategoryIcon: z.string().describe('A single emoji that represents this category'),
      reason: z
        .string()
        .optional()
        .describe(
          'Brief explanation of why a new category is needed instead of using existing ones (optional)'
        ),
    }),
    z
      .object({
        action: z.literal('uncategorized'),
        categoryId: z
          .string()
          .optional()
          .describe(
            'The ID of the Uncategorized category from the list (use when category cannot be determined)'
          ),
        id: z.string().optional(),
      })
      .transform((o) => ({
        action: 'uncategorized' as const,
        categoryId: o.categoryId ?? o.id ?? '',
      })),
  ]);

  return z.object({
    isTransaction: z.boolean().describe('Whether this email is a bank transaction notification'),
    transaction: z
      .object({
        amount: z.number().describe('Transaction amount as a positive number'),
        type: z.enum(['debit', 'credit']).describe('Whether money was debited or credited'),
        merchant: z
          .string()
          .nullable()
          .describe('Merchant/payee name if identifiable, null otherwise'),
        accountLastFour: z
          .string()
          .nullable()
          .describe('Last 4 digits of the account/card number if present'),
        bankName: z
          .string()
          .nullable()
          .describe(
            'Full official bank name with proper spacing (e.g., "HDFC Bank", "ICICI Bank", "State Bank of India"). Extract the complete name as it appears in the email, ensuring proper spacing between words. Do not use abbreviations or short forms.'
          ),
        date: z
          .string()
          .nullable()
          .describe('Transaction date in ISO format (YYYY-MM-DD) if present'),
        time: z.string().nullable().describe('Transaction time if present (HH:MM:SS)'),
        remarks: z
          .string()
          .nullable()
          .describe(
            'Transaction remarks/description extracted from the email. This field often contains detailed merchant information, location, transaction reference numbers, and other details. Extract the complete remarks text as it appears in the email.'
          ),
        category: categorySchema.describe(
          'Category selection: either select an existing category by ID, or create a new category if none fit well'
        ),
        confidence: z.number().min(0).max(1).describe('Confidence score for the extraction (0-1)'),
      })
      .nullable()
      .describe('Extracted transaction data, null if not a transaction email'),
  });
}

export type TransactionData = {
  amount: number;
  type: 'debit' | 'credit';
  merchant: string | null;
  accountLastFour: string | null;
  bankName: string | null;
  date: string | null;
  time: string | null;
  remarks: string | null;
  confidence: number;
};

/**
 * Category action from AI: either select existing or create new
 */
export type CategoryAction =
  | { action: 'select_existing'; categoryId: string; reason?: string }
  | { action: 'create_new'; newCategoryName: string; newCategoryIcon: string; reason?: string }
  | { action: 'uncategorized'; categoryId: string };

/**
 * Final extraction result including the selected/new category
 */
export interface TransactionExtractionResult {
  isTransaction: boolean;
  transaction:
    | (TransactionData & {
        categoryId: string | null;
        categoryName: string | null;
        // If AI wants to create a new category
        newCategory: { name: string; icon: string } | null;
      })
    | null;
}

export interface EmailInput {
  subject: string | undefined;
  body: string;
  from: string | undefined;
}

export interface SmsInput {
  body: string;
  sender: string | undefined;
}

/**
 * Build system prompt with available categories
 */
function buildSystemPrompt(categories: CategoryInfo[]): string {
  const categoryList = categories
    .map((c) => `- "${c.name}" (id: ${c.id})${c.icon ? ` ${c.icon}` : ''}`)
    .join('\n');

  return `You are a financial message parser specialized in extracting transaction information from bank notification emails and SMS messages.

Your task is to:
1. Determine if the message (email or SMS) is a bank transaction notification (debit/credit alert)
2. If it is, extract all relevant transaction details
3. Categorize the transaction using the category field

CATEGORY SELECTION RULES:
- CRITICAL: Use the REMARKS field as the PRIMARY source for determining the category
- The remarks field contains detailed transaction information including merchant details, location, transaction type, and other context
- DO NOT rely primarily on the merchant name - use the remarks field instead
- The remarks field may contain additional merchant information that is more descriptive than the merchant name
- FIRST, extract the remarks field completely from the email
- THEN, analyze the remarks to determine the most appropriate category from the AVAILABLE CATEGORIES list
- If an existing category fits well based on the remarks, use action: "select_existing" with the category ID
- ONLY if NO existing category fits the transaction based on remarks AND you can identify a clear, specific category:
  - Use action: "create_new" to suggest a new category
  - New category names should be specific but reusable (e.g., "Subscriptions", "Pet Care", "Education")
  - Avoid creating one-off categories for specific merchants (don't create "Amazon" category, use "Shopping")
- If you cannot determine a category from the remarks, use action: "uncategorized" with the Uncategorized category ID from the list

IMPORTANT GUIDELINES:
- Only mark isTransaction=true for actual bank transaction alerts (not promotional messages, statements, or other notifications)
- For SMS, look for specific patterns like "withdrawn by", "debited by", "credited with", "deposited", etc.
- Extract the exact amount as a positive number (regardless of debit/credit)
- Determine if it's a 'debit' (money spent/withdrawn) or 'credit' (money received/deposited)
- For remarks: Extract the COMPLETE remarks/description text from the email
  - Look for fields labeled "Remarks", "Description", "Transaction Details", "Narration", or similar
  - Include all text in the remarks field - it may contain merchant information, location, reference numbers, etc.
  - Do not truncate or summarize - extract the full remarks text as it appears
  - The remarks field is the PRIMARY source for category determination
- For bankName: Extract the FULL official bank name with proper spacing as it appears in the email
  - Examples: "HDFC Bank" (not "HDFC" or "HDFCBank"), "ICICI Bank" (not "ICICI"), "State Bank of India" (not "SBI")
  - Look for phrases like "Bank Name:", "from", or bank name in email headers/subject
  - Ensure proper spacing between words (e.g., "HDFC Bank" not "HDFCBank")
  - Use the complete official name, not abbreviations
- Set confidence between 0 and 1 based on how certain you are about the extraction
- Be conservative - if you're not sure it's a transaction email, mark isTransaction=false

AVAILABLE CATEGORIES:
${categoryList}

CATEGORY HINTS FOR EXISTING CATEGORIES:
- Food and Dining: restaurants, cafes, food delivery apps
- Transportation: uber, ola, fuel, metro, parking, taxi
- Shopping: retail stores, online shopping, amazon, flipkart
- Bills and Utilities: electricity, water, gas, internet, phone bills
- Entertainment: movies, games, streaming services, spotify, netflix, buying musical euqipments
- Healthcare: pharmacy, hospital, doctor, medical expenses
- Travel: hotels, flights, booking.com, travel agencies
- Groceries: supermarkets, grocery stores, raw food items (chicken, bread, eggs)
- Transfers: person-to-person transfers, NEFT, IMPS, UPI transfers
- Salary/Income: salary credits, refunds, cashback, invoices from Zoho Invoice, Upstem technologies, etc.

EXAMPLES OF WHEN TO CREATE NEW CATEGORIES:
- Gym membership → Create "Fitness" if not in list
- Tuition payment → Create "Education" if not in list
- Pet store purchase → Create "Pet Care" if not in list
- Charity donation → Create "Donations" if not in list`;
}

/**
 * TransactionExtractorService
 *
 * Uses AI to extract transaction data from bank email notifications
 * and select or create categories.
 */
export class TransactionExtractorService {
  /**
   * Extract transaction data from an email using AI
   * The AI can select from existing categories or suggest creating a new one
   *
   * @param email - The email content to analyze
   * @param availableCategories - List of categories from the database
   * @returns Extracted transaction data with selected or new category
   */
  async extractFromEmail(
    email: EmailInput,
    availableCategories: CategoryInfo[]
  ): Promise<TransactionExtractionResult> {
    const model = getAIModel();
    const emailContent = this.formatEmailForPrompt(email);
    const systemPrompt = buildSystemPrompt(availableCategories);

    // Create a map for quick category lookup
    const categoryMap = new Map(availableCategories.map((c) => [c.id, c]));

    // Find uncategorized as fallback
    const uncategorized = availableCategories.find((c) => c.name.toLowerCase() === 'uncategorized');

    // Get category IDs for the schema enum
    const categoryIds = availableCategories.map((c) => c.id);

    // If no categories available, return not a transaction
    if (categoryIds.length === 0) {
      console.warn('No categories available for extraction');
      return {
        isTransaction: false,
        transaction: null,
      };
    }

    try {
      const schema = createExtractionSchema(categoryIds);

      const result = await generateText({
        model,
        output: Output.object({ schema }),
        system: systemPrompt,
        prompt: emailContent,
      });

      const extracted = result.output;

      if (!extracted.isTransaction || !extracted.transaction) {
        return {
          isTransaction: false,
          transaction: null,
        };
      }

      const txn = extracted.transaction;
      const categoryAction = txn.category;

      let categoryId: string | null = null;
      let categoryName: string | null = null;
      let newCategory: { name: string; icon: string } | null = null;

      if (categoryAction.action === 'select_existing') {
        // Use existing category (resolve ID/name from model to valid categoryId)
        const resolvedId = resolveCategoryId(categoryAction.categoryId, categoryMap, uncategorized);
        const selectedCategory = resolvedId ? categoryMap.get(resolvedId) : null;
        categoryId = selectedCategory?.id || uncategorized?.id || null;
        categoryName = selectedCategory?.name || uncategorized?.name || null;

        console.log(
          `AI selected existing category: ${categoryName} (${categoryId})${categoryAction.reason ? ` - Reason: ${categoryAction.reason}` : ''}`
        );
      } else if (categoryAction.action === 'uncategorized') {
        // AI explicitly chose uncategorized (resolve ID/name to valid categoryId)
        const resolvedId = resolveCategoryId(categoryAction.categoryId, categoryMap, uncategorized);
        const selectedCategory = resolvedId ? categoryMap.get(resolvedId) : null;
        categoryId = selectedCategory?.id || uncategorized?.id || null;
        categoryName = selectedCategory?.name || uncategorized?.name || 'Uncategorized';

        console.log(`AI selected uncategorized category: ${categoryName} (${categoryId})`);
      } else if (categoryAction.action === 'create_new') {
        // AI wants to create a new category
        newCategory = {
          name: categoryAction.newCategoryName,
          icon: categoryAction.newCategoryIcon,
        };
        categoryName = categoryAction.newCategoryName;

        console.log(
          `AI suggests new category: ${categoryAction.newCategoryIcon} ${categoryAction.newCategoryName}${categoryAction.reason ? ` - Reason: ${categoryAction.reason}` : ''}`
        );
      }

      return {
        isTransaction: true,
        transaction: {
          amount: txn.amount,
          type: txn.type,
          merchant: txn.merchant,
          accountLastFour: txn.accountLastFour,
          bankName: txn.bankName,
          date: txn.date,
          time: txn.time,
          remarks: txn.remarks,
          confidence: txn.confidence,
          categoryId,
          categoryName,
          newCategory,
        },
      };
    } catch (error) {
      console.error('AI extraction failed:', error);

      // Return a safe default on error
      return {
        isTransaction: false,
        transaction: null,
      };
    }
  }

  /**
   * Extract transaction data from an SMS using AI
   *
   * @param sms - The SMS content to analyze
   * @param availableCategories - List of categories from the database
   * @returns Extracted transaction data with selected or new category
   */
  async extractFromSms(
    sms: SmsInput,
    availableCategories: CategoryInfo[]
  ): Promise<TransactionExtractionResult> {
    const model = getAIModel();
    const smsContent = this.formatSmsForPrompt(sms);
    const systemPrompt = buildSystemPrompt(availableCategories);

    // Create a map for quick category lookup
    const categoryMap = new Map(availableCategories.map((c) => [c.id, c]));

    // Find uncategorized as fallback
    const uncategorized = availableCategories.find((c) => c.name.toLowerCase() === 'uncategorized');

    // Get category IDs for the schema enum
    const categoryIds = availableCategories.map((c) => c.id);

    if (categoryIds.length === 0) {
      console.warn('No categories available for extraction');
      return {
        isTransaction: false,
        transaction: null,
      };
    }

    try {
      const schema = createExtractionSchema(categoryIds);

      const result = await generateText({
        model,
        output: Output.object({ schema }),
        system: systemPrompt,
        prompt: smsContent,
      });

      const extracted = result.output;

      if (!extracted.isTransaction || !extracted.transaction) {
        return {
          isTransaction: false,
          transaction: null,
        };
      }

      const txn = extracted.transaction;
      const categoryAction = txn.category;

      let categoryId: string | null = null;
      let categoryName: string | null = null;
      let newCategory: { name: string; icon: string } | null = null;

      if (categoryAction.action === 'select_existing') {
        const resolvedId = resolveCategoryId(categoryAction.categoryId, categoryMap, uncategorized);
        const selectedCategory = resolvedId ? categoryMap.get(resolvedId) : null;
        categoryId = selectedCategory?.id || uncategorized?.id || null;
        categoryName = selectedCategory?.name || uncategorized?.name || null;
      } else if (categoryAction.action === 'uncategorized') {
        const resolvedId = resolveCategoryId(categoryAction.categoryId, categoryMap, uncategorized);
        const selectedCategory = resolvedId ? categoryMap.get(resolvedId) : null;
        categoryId = selectedCategory?.id || uncategorized?.id || null;
        categoryName = selectedCategory?.name || uncategorized?.name || 'Uncategorized';
      } else if (categoryAction.action === 'create_new') {
        newCategory = {
          name: categoryAction.newCategoryName,
          icon: categoryAction.newCategoryIcon,
        };
        categoryName = categoryAction.newCategoryName;
      }

      return {
        isTransaction: true,
        transaction: {
          amount: txn.amount,
          type: txn.type,
          merchant: txn.merchant,
          accountLastFour: txn.accountLastFour,
          bankName: txn.bankName,
          date: txn.date,
          time: txn.time,
          remarks: txn.remarks,
          confidence: txn.confidence,
          categoryId,
          categoryName,
          newCategory,
        },
      };
    } catch (error) {
      console.error('AI SMS extraction failed:', error);
      return {
        isTransaction: false,
        transaction: null,
      };
    }
  }

  /**
   * Format SMS content for the AI prompt
   */
  private formatSmsForPrompt(sms: SmsInput): string {
    const parts: string[] = [];

    if (sms.sender) {
      parts.push(`From/Sender: ${sms.sender}`);
    }

    parts.push('');
    parts.push('SMS Message:');
    parts.push(sms.body);

    return parts.join('\n');
  }

  /**
   * Format email content for the AI prompt
   */
  private formatEmailForPrompt(email: EmailInput): string {
    const parts: string[] = [];

    if (email.from) {
      parts.push(`From: ${email.from}`);
    }

    if (email.subject) {
      parts.push(`Subject: ${email.subject}`);
    }

    parts.push('');
    parts.push('Email Body:');
    parts.push(email.body);

    return parts.join('\n');
  }

  /**
   * Check if extraction result has valid transaction data
   */
  isValidTransaction(result: TransactionExtractionResult): boolean {
    return (
      result.isTransaction &&
      result.transaction !== null &&
      result.transaction.amount > 0 &&
      (result.transaction.type === 'debit' || result.transaction.type === 'credit')
    );
  }
}

// Export a basic schema for reference (not used directly, schema is generated dynamically)
export const transactionDataSchema = z.object({
  amount: z.number(),
  type: z.enum(['debit', 'credit']),
  merchant: z.string().nullable(),
  accountLastFour: z.string().nullable(),
  bankName: z.string().nullable(),
  date: z.string().nullable(),
  time: z.string().nullable(),
  remarks: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});
