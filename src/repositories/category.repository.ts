import { and, eq, isNull, or } from 'drizzle-orm';
import { type Category, categories, type NewCategory } from '@/db/schema';
import { BaseRepository } from './base.repository';

export class CategoryRepository extends BaseRepository {
  /**
   * Find all categories accessible to a user (predefined + user's custom)
   */
  async findAllForUser(userId: string): Promise<Category[]> {
    return this.db
      .select()
      .from(categories)
      .where(
        or(
          isNull(categories.userId), // predefined categories (userId = null)
          eq(categories.userId, userId) // user's custom categories
        )
      )
      .orderBy(categories.name);
  }

  /**
   * Find all predefined (default) categories
   */
  async findAllDefault(): Promise<Category[]> {
    return this.db
      .select()
      .from(categories)
      .where(eq(categories.isDefault, true))
      .orderBy(categories.name);
  }

  /**
   * Find custom categories for a specific user
   */
  async findCustomForUser(userId: string): Promise<Category[]> {
    return this.db
      .select()
      .from(categories)
      .where(and(eq(categories.userId, userId), eq(categories.isDefault, false)))
      .orderBy(categories.name);
  }

  /**
   * Find a category by ID
   */
  async findById(id: string): Promise<Category | null> {
    const result = await this.db.select().from(categories).where(eq(categories.id, id)).limit(1);
    return result[0] || null;
  }

  /**
   * Find a category by name for a user (checking both predefined and custom)
   */
  async findByNameForUser(name: string, userId: string): Promise<Category | null> {
    const result = await this.db
      .select()
      .from(categories)
      .where(
        and(eq(categories.name, name), or(isNull(categories.userId), eq(categories.userId, userId)))
      )
      .limit(1);
    return result[0] || null;
  }

  /**
   * Find the "Uncategorized" category
   */
  async findUncategorized(): Promise<Category | null> {
    const result = await this.db
      .select()
      .from(categories)
      .where(and(eq(categories.name, 'Uncategorized'), eq(categories.isDefault, true)))
      .limit(1);
    return result[0] || null;
  }

  /**
   * Create a new category
   */
  async create(data: NewCategory): Promise<Category> {
    const result = await this.db.insert(categories).values(data).returning();
    return result[0];
  }

  /**
   * Update a category (only for custom categories)
   */
  async update(
    id: string,
    userId: string,
    data: Partial<Pick<NewCategory, 'name' | 'icon'>>
  ): Promise<Category | null> {
    const result = await this.db
      .update(categories)
      .set(data)
      .where(
        and(
          eq(categories.id, id),
          eq(categories.userId, userId), // Only allow updating own categories
          eq(categories.isDefault, false) // Only allow updating custom categories
        )
      )
      .returning();
    return result[0] || null;
  }

  /**
   * Delete a custom category (cannot delete predefined)
   */
  async delete(id: string, userId: string): Promise<boolean> {
    const result = await this.db
      .delete(categories)
      .where(
        and(
          eq(categories.id, id),
          eq(categories.userId, userId), // Only allow deleting own categories
          eq(categories.isDefault, false) // Cannot delete predefined categories
        )
      )
      .returning();
    return result.length > 0;
  }

  /**
   * Check if predefined categories exist (for seeding)
   */
  async hasDefaultCategories(): Promise<boolean> {
    const result = await this.db
      .select()
      .from(categories)
      .where(eq(categories.isDefault, true))
      .limit(1);
    return result.length > 0;
  }

  /**
   * Bulk insert categories (for seeding)
   */
  async bulkCreate(data: NewCategory[]): Promise<Category[]> {
    if (data.length === 0) return [];
    return this.db.insert(categories).values(data).returning();
  }
}
