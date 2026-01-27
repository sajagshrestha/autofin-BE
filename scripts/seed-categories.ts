import { config } from 'dotenv';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { categories } from '../src/db/schema';

config({ path: '.env' });

/**
 * Predefined categories for transaction classification
 * These are system-wide defaults available to all users
 */
const PREDEFINED_CATEGORIES = [
  { name: 'Food and Dining', icon: '🍽️' },
  { name: 'Transportation', icon: '🚗' },
  { name: 'Shopping', icon: '🛍️' },
  { name: 'Bills and Utilities', icon: '📱' },
  { name: 'Entertainment', icon: '🎬' },
  { name: 'Healthcare', icon: '🏥' },
  { name: 'Travel', icon: '✈️' },
  { name: 'Groceries', icon: '🛒' },
  { name: 'Transfers', icon: '💸' },
  { name: 'Salary/Income', icon: '💰' },
  { name: 'Uncategorized', icon: '❓' }, // Default fallback category
];

async function seedCategories() {
  const client = postgres(process.env.DATABASE_URL || '');
  const db = drizzle(client);

  try {
    console.log('Checking for existing predefined categories...');

    // Check if categories already exist
    const existingCategories = await db
      .select()
      .from(categories)
      .where(eq(categories.isDefault, true));

    if (existingCategories.length > 0) {
      console.log(`Found ${existingCategories.length} existing predefined categories:`);
      existingCategories.forEach((cat) => {
        console.log(`  - ${cat.icon} ${cat.name}`);
      });

      // Check for missing categories and add them
      const existingNames = new Set(existingCategories.map((c) => c.name));
      const missingCategories = PREDEFINED_CATEGORIES.filter((cat) => !existingNames.has(cat.name));

      if (missingCategories.length > 0) {
        console.log(`\nAdding ${missingCategories.length} missing categories...`);
        const newCategories = missingCategories.map((cat) => ({
          id: crypto.randomUUID(),
          userId: null, // null for predefined categories
          name: cat.name,
          icon: cat.icon,
          isDefault: true,
          isAiCreated: false, // Predefined categories are not AI-created
        }));

        await db.insert(categories).values(newCategories);
        console.log('✓ Missing categories added successfully');

        newCategories.forEach((cat) => {
          console.log(`  + ${cat.icon} ${cat.name}`);
        });
      } else {
        console.log('\n✓ All predefined categories already exist');
      }
    } else {
      console.log('No predefined categories found. Creating all categories...\n');

      const categoriesToInsert = PREDEFINED_CATEGORIES.map((cat) => ({
        id: crypto.randomUUID(),
        userId: null, // null for predefined categories
        name: cat.name,
        icon: cat.icon,
        isDefault: true,
        isAiCreated: false, // Predefined categories are not AI-created
      }));

      await db.insert(categories).values(categoriesToInsert);

      console.log(`✓ Created ${categoriesToInsert.length} predefined categories:`);
      categoriesToInsert.forEach((cat) => {
        console.log(`  + ${cat.icon} ${cat.name}`);
      });
    }

    console.log('\n✓ Category seeding completed successfully');
  } catch (error) {
    console.error('✗ Failed to seed categories:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seedCategories();
