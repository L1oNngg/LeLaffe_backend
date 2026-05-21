/**
 * Custom Domain Errors — Catalog
 *
 * Rule (nextjs-backend.md):
 * - Create specific error classes per business error.
 * - route.ts catches them and maps to safe HTTP responses.
 * - NEVER return raw DB errors or stack traces to the client.
 */

export class ProductNotFoundError extends Error {
  constructor(slug: string) {
    super(`Product with slug "${slug}" was not found.`)
    this.name = 'ProductNotFoundError'
  }
}

export class DatabaseError extends Error {
  constructor(message = 'An unexpected database error occurred.') {
    super(message)
    this.name = 'DatabaseError'
  }
}
