/**
 * Safe seed script — only seeds if the database has no users.
 * Used for initial deployment on Render.com.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    console.log('Database already seeded — skipping.');
    return;
  }
  console.log('Empty database detected — running seed...');
  // Dynamically import the full seed
  await import('./seed');
}

main()
  .catch((e) => {
    console.error('Safe seed check failed:', e);
    // Don't exit(1) — allow the server to start anyway
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
