import { z } from 'zod'

/**
 * Zod Schemas — Product Catalog Query Validation
 *
 * Rule (nextjs-backend.md):
 * - Validate ALL incoming query params / path params with Zod.
 * - Use `z.infer` to derive TypeScript types — Zod is the source of truth.
 */

// ----------------------------------------------------------------
// GET /api/products — Query params schema
// ----------------------------------------------------------------
export const GetProductsQuerySchema = z.object({
  /** Page number, 1-indexed. Defaults to 1. */
  page: z
    .string()
    .optional()
    .default('1')
    .transform(Number)
    .pipe(z.number().int().positive()),

  /** Items per page. Min: 1, Max: 50. Defaults to 12. */
  limit: z
    .string()
    .optional()
    .default('12')
    .transform(Number)
    .pipe(z.number().int().min(1).max(50)),

  /** Filter by category slug */
  category: z.string().min(1).optional(),
})

export type GetProductsQuery = z.infer<typeof GetProductsQuerySchema>

// ----------------------------------------------------------------
// GET /api/products/[slug] — Path param schema
// ----------------------------------------------------------------
export const GetProductBySlugParamsSchema = z.object({
  slug: z
    .string()
    .min(1, 'Slug is required')
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
})

export type GetProductBySlugParams = z.infer<typeof GetProductBySlugParamsSchema>
