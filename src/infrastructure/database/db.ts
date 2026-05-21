import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

/**
 * Prisma Client Singleton — Prisma v7 with Driver Adapter
 *
 * Prisma v7 requires an explicit driver adapter (@prisma/adapter-pg).
 * Connection URL is managed by prisma.config.ts, not the client constructor.
 *
 * Singleton pattern using globalThis prevents multiple PrismaClient instances
 * during Next.js development hot-reloads (each hot-reload would otherwise
 * create a new Pool + Client, exhausting the connection limit quickly).
 *
 * Production: Consider Prisma Accelerate or PgBouncer for serverless pooling.
 *
 * @see nextjs-backend.md → Database & Prisma ORM Best Practices
 */

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined
}

function createPrismaClient(): PrismaClient {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  })

  // Store pool reference on globalThis for cleanup during hot-reload
  globalThis.__pgPool = pool

  const adapter = new PrismaPg(pool)

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  })
}

export const db = globalThis.__prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = db
}
