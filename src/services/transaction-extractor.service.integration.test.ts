/**
 * Integration tests for TransactionExtractorService using the REAL AI (no mocks).
 * Requires AI_PROVIDER and corresponding API key (e.g. GOOGLE_GENERATIVE_AI_API_KEY).
 *
 * Categories match scripts/seed-categories.ts (Food and Dining, Transportation, etc.).
 * Run with: bun test src/services/transaction-extractor.service.integration.test.ts
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { type CategoryInfo, TransactionExtractorService } from './transaction-extractor.service';

// Same categories as seed-categories.ts PREDEFINED_CATEGORIES (stable IDs for tests)
const SEED_CATEGORIES: CategoryInfo[] = [
  { id: 'cat-food', name: 'Food and Dining', icon: '🍽️' },
  { id: 'cat-transport', name: 'Transportation', icon: '🚗' },
  { id: 'cat-shopping', name: 'Shopping', icon: '🛍️' },
  { id: 'cat-bills', name: 'Bills and Utilities', icon: '📱' },
  { id: 'cat-entertainment', name: 'Entertainment', icon: '🎬' },
  { id: 'cat-healthcare', name: 'Healthcare', icon: '🏥' },
  { id: 'cat-travel', name: 'Travel', icon: '✈️' },
  { id: 'cat-groceries', name: 'Groceries', icon: '🛒' },
  { id: 'cat-transfers', name: 'Transfers', icon: '💸' },
  { id: 'cat-salary', name: 'Salary/Income', icon: '💰' },
  { id: 'cat-uncategorized', name: 'Uncategorized', icon: '❓' },
];

const categoryIds = SEED_CATEGORIES.map((c) => c.id);
const categoryNames = new Set(SEED_CATEGORIES.map((c) => c.name));

// Real Nabil Bank transaction email (no mocks – used for integration test)
const NABIL_BANK_EMAIL = {
  subject: 'Transaction details for your account',
  from: 'customercare@nabilbank.com',
  body: `Dear SAJAG,
Greetings!
Please find transaction details for your account number 110#####502213 as
below :
Transaction Date Transaction Type Transaction Amount Available Balance
Remarks
2026-02-01 11:00 Debit 5,004.00 96,339.14 XP-NB-3348417-NB-XP-3348417
Cips-(0501-0010501010
Enjoy advanced account and payment features of nBank by following the link
bit.ly/2U2dzlO
For support, call us at +977 1 5970015 or send us an email at
customercare@nabilbank.com...`,
};

// Clearly non-transaction email (AI should return isTransaction: false)
const PROMO_EMAIL = {
  subject: '50% off this weekend only!',
  from: 'offers@store.com',
  body: `Hi there,
Don't miss our biggest sale of the year. Get 50% off on all electronics.
Use code SAVE50 at checkout. Offer valid till Sunday.
Shop now: https://store.com/sale
Unsubscribe | Privacy policy`,
};

// Transaction that should match a default/seed category (e.g. Food and Dining)
const FOOD_TRANSACTION_EMAIL = {
  subject: 'Debit alert - HDFC Bank',
  from: 'alerts@hdfcbank.com',
  body: `Your HDFC Bank account xx1234 has been debited with INR 450.00 on 01-Feb-2026.
Remarks: PAYMENT TO CLOUDKITCHEN SWIGGY BANGALORE
Available balance: INR 12,340.00.
If not you, call 1800-xxx-xxxx.`,
};

// Transaction that may trigger AI to suggest a new category (e.g. Fitness – not in seed)
const GYM_TRANSACTION_EMAIL = {
  subject: 'Payment received - Cult.fit',
  from: 'payments@cult.fit',
  body: `Your payment of INR 999.00 was successful on 01-Feb-2026.
Remarks: CULT FIT MONTHLY MEMBERSHIP GYM BANGALORE
Transaction ID: CULT-2026-xxx. Thank you for choosing Cult.fit.`,
};

// Transaction with vague remarks – AI may choose Uncategorized
const VAGUE_TRANSACTION_EMAIL = {
  subject: 'Transaction alert',
  from: 'noreply@bank.com',
  body: `Debit of Rs 1,250.00 from account **2134 on 01-Feb-2026.
Remarks: NEFT-MISC-REF 987654321
Balance: Rs 45,000.00.`,
};

describe('TransactionExtractorService (integration – real AI)', () => {
  let service: TransactionExtractorService;

  beforeAll(() => {
    service = new TransactionExtractorService();
  });

  test('extracts transaction from Nabil Bank email using real AI', async () => {
    const result = await service.extractFromEmail(NABIL_BANK_EMAIL, SEED_CATEGORIES);

    expect(result).toBeDefined();
    expect(result.isTransaction).toBe(true);
    expect(result.transaction).not.toBeNull();
    if (!result.transaction) return;
    const t = result.transaction;
    expect(t.amount).toBe(5004);
    expect(t.type).toBe('debit');
    expect(t.bankName?.toLowerCase()).toContain('nabil');
    expect(t.date).toBeDefined();
    expect(t.remarks).toBeDefined();
    expect(t.remarks).toContain('XP-NB-3348417');
    expect(t.confidence).toBeGreaterThanOrEqual(0);
    expect(t.confidence).toBeLessThanOrEqual(1);

    if (t.categoryId) expect(categoryIds).toContain(t.categoryId);
    if (t.newCategory) {
      expect(t.newCategory.name.length).toBeGreaterThanOrEqual(2);
      expect(t.newCategory.icon).toBeDefined();
    }
  }, 30_000);

  test('isValidTransaction returns true for extracted Nabil result', async () => {
    const result = await service.extractFromEmail(NABIL_BANK_EMAIL, SEED_CATEGORIES);
    expect(result.isTransaction).toBe(true);
    expect(result.transaction).not.toBeNull();
    expect(service.isValidTransaction(result)).toBe(true);
  }, 30_000);

  test('promotional email is not classified as transaction', async () => {
    const result = await service.extractFromEmail(PROMO_EMAIL, SEED_CATEGORIES);
    expect(result.isTransaction).toBe(false);
    expect(result.transaction).toBeNull();
    expect(service.isValidTransaction(result)).toBe(false);
  }, 30_000);

  test('transaction with clear category (e.g. Food) is categorized by default/seed category', async () => {
    const result = await service.extractFromEmail(FOOD_TRANSACTION_EMAIL, SEED_CATEGORIES);
    expect(result.isTransaction).toBe(true);
    expect(result.transaction).not.toBeNull();
    if (!result.transaction) return;
    const t = result.transaction;
    expect(t.amount).toBe(450);
    expect(t.type).toBe('debit');
    // AI should select an existing seed category (e.g. Food and Dining for Swiggy)
    expect(t.categoryId).toBeDefined();
    expect(categoryIds).toContain(t.categoryId as string);
    expect(t.categoryName).toBeDefined();
    expect(categoryNames.has(t.categoryName as string)).toBe(true);
    expect(t.newCategory).toBeNull();
  }, 30_000);

  test('transaction that fits no seed category can trigger AI to suggest new category', async () => {
    const result = await service.extractFromEmail(GYM_TRANSACTION_EMAIL, SEED_CATEGORIES);
    expect(result.isTransaction).toBe(true);
    expect(result.transaction).not.toBeNull();
    if (!result.transaction) return;
    const t = result.transaction;
    expect(t.amount).toBe(999);
    expect(t.type).toBe('debit');
    // Either new category (e.g. Fitness) or an existing one; if new, name not in seed
    if (t.newCategory) {
      expect(t.newCategory.name.length).toBeGreaterThanOrEqual(2);
      expect(t.newCategory.icon).toBeDefined();
      expect(categoryNames.has(t.newCategory.name)).toBe(false);
    } else {
      expect(t.categoryId).toBeDefined();
      expect(categoryIds).toContain(t.categoryId as string);
    }
  }, 30_000);

  test('transaction with vague remarks can be uncategorized', async () => {
    const result = await service.extractFromEmail(VAGUE_TRANSACTION_EMAIL, SEED_CATEGORIES);
    expect(result.isTransaction).toBe(true);
    expect(result.transaction).not.toBeNull();
    if (!result.transaction) return;
    const t = result.transaction;
    expect(t.amount).toBe(1250);
    expect(t.type).toBe('debit');
    // AI may choose Uncategorized when remarks are vague (NEFT-MISC-REF)
    const isUncategorized =
      t.categoryId === 'cat-uncategorized' ||
      (t.categoryName?.toLowerCase() ?? '').includes('uncategorized');
    const isExistingCategory = t.categoryId && categoryIds.includes(t.categoryId);
    expect(isUncategorized || isExistingCategory).toBe(true);
  }, 30_000);
});
