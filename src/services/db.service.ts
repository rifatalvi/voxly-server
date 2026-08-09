import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
});

export async function connectDb(): Promise<void> {
  try {
    await prisma.$connect();
    console.log('PostgreSQL Database connected successfully via Prisma');
  } catch (error) {
    console.error('Failed to connect to PostgreSQL database:', error);
    process.exit(1);
  }
}
