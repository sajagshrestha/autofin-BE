import type { Database } from '../db/connection';
import type { UserRepository } from '../repositories/user.repository';
import { UserRepository as UserRepositoryImpl } from '../repositories/user.repository';
import type { UserService } from '../services/user.service';
import { UserService as UserServiceImpl } from '../services/user.service';

/**
 * Container interface - defines what dependencies are available
 * This allows for easy mocking in tests and better type safety
 */
export interface Container {
  readonly db: Database;
  readonly userRepo: UserRepository;
  readonly userService: UserService;
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

  // Services (depend on db and repositories)
  // Services now have direct access to db for transactions and complex queries
  const userService: UserService = new UserServiceImpl(db, userRepo);

  return {
    db,
    userRepo,
    userService,
  };
}

/**
 * Type alias for backward compatibility
 * @deprecated Use createContainer() instead
 */
export type DIContainer = Container;
