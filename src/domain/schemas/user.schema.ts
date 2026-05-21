import { z } from 'zod'

/**
 * Zod Schemas — User Profile & Order History
 *
 * Rule (nextjs-backend.md): Validate ALL incoming payloads with Zod.
 *
 * GET /api/orders/me → query params validation (pagination)
 */

// ── Query Params: GET /api/orders/me ─────────────────────────────

export const MyOrderListQuerySchema = z.object({
  page: z.coerce
    .number()
    .int({ message: 'page must be an integer' })
    .min(1, { message: 'page must be at least 1' })
    .default(1),
  limit: z.coerce
    .number()
    .int({ message: 'limit must be an integer' })
    .min(1, { message: 'limit must be at least 1' })
    .max(50, { message: 'limit cannot exceed 50' })
    .default(10),
})

export type MyOrderListQuery = z.infer<typeof MyOrderListQuerySchema>
