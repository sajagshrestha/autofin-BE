import type { Database } from '@/db/connection';
import type { NewUser, User } from '@/db/schema';
import type { UserRepository } from '@/repositories/user.repository';
import { BaseService } from './base.service';

/**
 * UserService - Business logic layer for user operations
 *
 * Has access to:
 * - this.db: Direct Drizzle DB instance for complex queries, transactions, etc.
 * - this.userRepo: Repository for standard CRUD operations
 *
 * Example of using db directly:
 * ```ts
 * // Complex query example
 * const result = await this.db.select().from(users)
 *   .where(and(eq(users.email, email), eq(users.status, 'active')))
 *   .limit(10);
 *
 * // Transaction example
 * await this.db.transaction(async (tx) => {
 *   await tx.insert(users).values(userData);
 *   await tx.insert(userProfiles).values(profileData);
 * });
 * ```
 */
export class UserService extends BaseService {
  constructor(
    db: Database,
    private readonly userRepo: UserRepository
  ) {
    super(db);
  }

  async getAllUsers(): Promise<User[]> {
    return this.userRepo.findAll();
  }

  async getUserById(id: string): Promise<User | null> {
    return this.userRepo.findById(id);
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return this.userRepo.findByEmail(email);
  }

  async createUser(data: NewUser): Promise<User> {
    // Add business logic here (validation, etc.)
    return this.userRepo.create(data);
  }

  async updateUser(id: string, data: Partial<NewUser>): Promise<User | null> {
    // Add business logic here (validation, etc.)
    return this.userRepo.update(id, data);
  }

  async deleteUser(id: string): Promise<boolean> {
    // Add business logic here (validation, etc.)
    return this.userRepo.delete(id);
  }
}
