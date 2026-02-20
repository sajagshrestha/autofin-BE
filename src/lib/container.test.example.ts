/**
 * Example: How to test with the improved DI approach
 *
 * This shows how easy it is to create test containers with mocks
 */

import type { UserRepository } from '@/repositories/user.repository';
import { UserService } from '@/services/user.service';
import type { Container } from './container';

// Example test setup - pass overrides for the Container parts you need in tests
export function createTestContainer(overrides?: Partial<Container>): Container {
  const mockDb = {} as Container['db'];

  const mockUserRepo = {
    db: mockDb,
    findAll: async () => [],
    findById: async () => null,
    findByEmail: async () => null,
    create: async (data: { id: string; email: string; timezone?: string }) =>
      ({ ...data, id: '1', createdAt: new Date(), updatedAt: new Date() }) as Awaited<
        ReturnType<UserRepository['create']>
      >,
    update: async () => null,
    delete: async () => false,
    ...(overrides?.userRepo ?? {}),
  } as unknown as UserRepository;

  const userService = new UserService(mockDb, mockUserRepo);

  return {
    db: mockDb,
    userRepo: mockUserRepo,
    userService,
    ...overrides,
  } as Container;
}

// Usage in tests:
/*
import { describe, it, expect, vi } from 'vitest';
import { createTestContainer } from './container.test.example';

describe('UserService', () => {
  it('should get all users', async () => {
    const mockUsers: User[] = [
      { id: '1', email: 'test@example.com', createdAt: new Date(), updatedAt: new Date() }
    ];
    
    const container = createTestContainer({
      userRepo: {
        findAll: vi.fn().mockResolvedValue(mockUsers),
      } as UserRepository,
    });

    const users = await container.userService.getAllUsers();
    expect(users).toEqual(mockUsers);
  });
});
*/
