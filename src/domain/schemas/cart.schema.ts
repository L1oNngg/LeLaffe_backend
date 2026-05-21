import { z } from 'zod'

/**
 * Zod Schemas — Cart API Request Validation
 *
 * Rule (nextjs-backend.md): Validate ALL incoming payloads with Zod.
 */

// POST /api/cart/items — Add item to cart
export const AddCartItemBodySchema = z.object({
  productId: z
    .string()
    .uuid({ message: 'productId must be a valid UUID' }),
  quantity: z
    .number()
    .int({ message: 'quantity must be an integer' })
    .min(1, { message: 'quantity must be at least 1' })
    .max(99, { message: 'quantity cannot exceed 99 per item' }),
})

export type AddCartItemBody = z.infer<typeof AddCartItemBodySchema>

// PUT /api/cart/items/:id — Update item quantity
export const UpdateCartItemBodySchema = z.object({
  quantity: z
    .number()
    .int({ message: 'quantity must be an integer' })
    .min(1, { message: 'quantity must be at least 1' })
    .max(99, { message: 'quantity cannot exceed 99 per item' }),
})

export type UpdateCartItemBody = z.infer<typeof UpdateCartItemBodySchema>
