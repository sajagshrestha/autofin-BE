import type { Database } from '@/db/connection';

export abstract class BaseService {
  constructor(protected readonly db: Database) {}

  // Add common service methods here if needed
  // Services can use this.db for direct Drizzle queries, transactions, etc.
}
