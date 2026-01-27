import { eq } from 'drizzle-orm';
import { type NewUser, type User, users } from '@/db/schema';
import { BaseRepository } from './base.repository';

export class UserRepository extends BaseRepository {
  async findAll(): Promise<User[]> {
    return this.db.select().from(users);
  }

  async findById(id: string): Promise<User | null> {
    const result = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0] || null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0] || null;
  }

  async create(data: NewUser): Promise<User> {
    const result = await this.db.insert(users).values(data).returning();
    return result[0];
  }

  async update(id: string, data: Partial<NewUser>): Promise<User | null> {
    const result = await this.db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return result[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(users).where(eq(users.id, id)).returning();
    return result.length > 0;
  }
}
