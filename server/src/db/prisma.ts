import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { env, isProduction } from '../config/env.js';

/**
 * Prisma 7 removed `datasourceUrl` and the rust query engine in favor of
 * driver adapters — the connection URL no longer goes to PrismaClient
 * directly, it goes to the adapter, which wraps a `pg` Pool.
 *
 * A single PrismaClient instance (backed by a single pg Pool) is reused
 * across the app, rather than constructing one per request — the adapter
 * manages its own internal connection pool, and creating a new one per
 * request would create a new pool (and a burst of new DB connections)
 * every time.
 *
 * Logging: full query logs in development (useful when working on the
 * pagination query specifically — you want to see the generated SQL),
 * warnings/errors only in production (query-level logs are noisy and
 * not useful in prod logs at this scale).
 */
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({
  adapter,
  log: isProduction ? ['warn', 'error'] : ['query', 'warn', 'error'],
});

export async function checkDatabaseConnection(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}