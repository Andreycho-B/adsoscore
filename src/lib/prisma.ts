import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const url = import.meta.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. Check your .env file.');
  }
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (import.meta.env.MODE !== 'production') globalForPrisma.prisma = prisma;
