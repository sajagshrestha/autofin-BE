import type { Database } from '@/db/connection';
import type { CategoryRepository } from '@/repositories/category.repository';
import { CategoryRepository as CategoryRepositoryImpl } from '@/repositories/category.repository';
import type { GmailOAuthRepository } from '@/repositories/gmail-oauth.repository';
import { GmailOAuthRepository as GmailOAuthRepositoryImpl } from '@/repositories/gmail-oauth.repository';
import type { TransactionRepository } from '@/repositories/transaction.repository';
import { TransactionRepository as TransactionRepositoryImpl } from '@/repositories/transaction.repository';
import type { UserRepository } from '@/repositories/user.repository';
import { UserRepository as UserRepositoryImpl } from '@/repositories/user.repository';
import type { GmailService } from '@/services/gmail.service';
import { GmailService as GmailServiceImpl } from '@/services/gmail.service';
import type { TransactionExtractorService } from '@/services/transaction-extractor.service';
import { TransactionExtractorService as TransactionExtractorServiceImpl } from '@/services/transaction-extractor.service';
import type { UserService } from '@/services/user.service';
import { UserService as UserServiceImpl } from '@/services/user.service';

/**
 * Container interface - defines what dependencies are available
 * This allows for easy mocking in tests and better type safety
 */
export interface Container {
  readonly db: Database;
  // Repositories
  readonly userRepo: UserRepository;
  readonly gmailOAuthRepo: GmailOAuthRepository;
  readonly categoryRepo: CategoryRepository;
  readonly transactionRepo: TransactionRepository;
  // Services
  readonly userService: UserService;
  readonly gmailService: GmailService;
  readonly transactionExtractor: TransactionExtractorService;
}

/**
 * Factory function to create a container with all dependencies
 *
 * Benefits over class-based approach:
 * - Simpler and more functional
 * - Easier to test (can create multiple instances)
 * - No lazy initialization complexity
 * - Clear dependency graph
 * - Immutable container (readonly properties)
 */
export function createContainer(db: Database): Container {
  // Repositories (depend on db)
  const userRepo: UserRepository = new UserRepositoryImpl(db);
  const gmailOAuthRepo: GmailOAuthRepository = new GmailOAuthRepositoryImpl(db);
  const categoryRepo: CategoryRepository = new CategoryRepositoryImpl(db);
  const transactionRepo: TransactionRepository = new TransactionRepositoryImpl(db);

  // Services (depend on db and repositories)
  // Services now have direct access to db for transactions and complex queries
  const userService: UserService = new UserServiceImpl(db, userRepo);
  const transactionExtractor: TransactionExtractorService = new TransactionExtractorServiceImpl();
  const gmailService: GmailService = new GmailServiceImpl(
    db,
    gmailOAuthRepo,
    transactionRepo,
    categoryRepo,
    transactionExtractor
  );

  return {
    db,
    // Repositories
    userRepo,
    gmailOAuthRepo,
    categoryRepo,
    transactionRepo,
    // Services
    userService,
    gmailService,
    transactionExtractor,
  };
}

/**
 * Type alias for backward compatibility
 * @deprecated Use createContainer() instead
 */
export type DIContainer = Container;
