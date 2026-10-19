import { PrismaClient } from '@prisma/client';

// Next.js hot-reloads modules in development, which would otherwise open a new
// connection pool on every save until Postgres refuses them.
const g = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  g.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') g.prisma = db;
