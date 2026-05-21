import { z } from 'zod'

/**
 * Zod Schemas — Admin Order Management
 *
 * Rule (nextjs-backend.md): Validate ALL incoming payloads with Zod.
 *
 * GET /api/admin/orders        → query params validation (pagination + filter)
 * PUT /api/admin/orders/:id/status → body validation (status transition)
 */

// ── Query Params: GET /api/admin/orders ──────────────────────────

export const AdminOrderListQuerySchema = z.object({
  page: z.coerce
    .number()
    .int({ message: 'page must be an integer' })
    .min(1, { message: 'page must be at least 1' })
    .default(1),
  limit: z.coerce
    .number()
    .int({ message: 'limit must be an integer' })
    .min(1, { message: 'limit must be at least 1' })
    .max(100, { message: 'limit cannot exceed 100' })
    .default(10),
  status: z
    .enum(['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'], {
      message: 'status must be one of: PENDING, PROCESSING, SHIPPED, DELIVERED, CANCELLED',
    })
    .optional(),
})

export type AdminOrderListQuery = z.infer<typeof AdminOrderListQuerySchema>

// ── Body: PUT /api/admin/orders/:id/status ───────────────────────

/** Only allow transitions to these statuses via Admin action */
export const AdminUpdateOrderStatusSchema = z.object({
  status: z.enum(['SHIPPED', 'DELIVERED', 'CANCELLED'], {
    message: 'status must be one of: SHIPPED, DELIVERED, CANCELLED',
  }),
})

export type AdminUpdateOrderStatus = z.infer<typeof AdminUpdateOrderStatusSchema>

// ── Path Param: Order ID ─────────────────────────────────────────

export const OrderIdParamSchema = z.object({
  id: z.string().uuid({ message: 'Order ID must be a valid UUID' }),
})
