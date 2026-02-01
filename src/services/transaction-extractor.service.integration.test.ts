/**
 * Integration tests for TransactionExtractorService using the REAL AI (no mocks).
 * Requires AI_PROVIDER and corresponding API key (e.g. GOOGLE_GENERATIVE_AI_API_KEY).
 *
 * Run with: bun test src/services/transaction-extractor.service.integration.test.ts
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { type CategoryInfo, TransactionExtractorService } from './transaction-extractor.service';

// Same categories as seed (with stable IDs) so extraction has real choices
const integrationCategories: CategoryInfo[] = [
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

describe('TransactionExtractorService (integration – real AI)', () => {
  let service: TransactionExtractorService;

  beforeAll(() => {
    service = new TransactionExtractorService();
  });

  test('extracts transaction from Nabil Bank email using real AI', async () => {
    const result = await service.extractFromEmail(NABIL_BANK_EMAIL, integrationCategories);

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

    if (t.categoryId) {
      const categoryIds = integrationCategories.map((c) => c.id);
      expect(categoryIds).toContain(t.categoryId);
    }
    if (t.newCategory) {
      expect(t.newCategory.name.length).toBeGreaterThanOrEqual(2);
      expect(t.newCategory.icon).toBeDefined();
    }
  }, 30_000);

  test('isValidTransaction returns true for extracted Nabil result', async () => {
    const result = await service.extractFromEmail(NABIL_BANK_EMAIL, integrationCategories);
    expect(result.isTransaction).toBe(true);
    expect(result.transaction).not.toBeNull();
    expect(service.isValidTransaction(result)).toBe(true);
  }, 30_000);
});
