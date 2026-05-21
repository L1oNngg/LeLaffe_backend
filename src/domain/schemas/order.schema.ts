import { z } from 'zod'

/**
 * Zod Schemas — Checkout Request Validation
 *
 * Rule (nextjs-backend.md): Validate ALL incoming payloads with Zod.
 * Rule (BR-09): price is intentionally NOT accepted from the client —
 *               it is fetched server-side from the DB inside the use-case.
 */

// Each order line item
const CheckoutItemSchema = z.object({
  productId: z
    .string()
    .uuid({ message: 'productId must be a valid UUID' }),
  quantity: z
    .number()
    .int({ message: 'quantity must be an integer' })
    .min(1, { message: 'quantity must be at least 1' })
    .max(99, { message: 'quantity cannot exceed 99 per item' }),
})

// Supported payment gateways
export const PaymentMethodEnum = z.enum(['STRIPE', 'VNPAY', 'MOMO'], {
  message: 'paymentMethod must be one of: STRIPE, VNPAY, MOMO',
})

// Full checkout body
export const CheckoutBodySchema = z.object({
  items: z
    .array(CheckoutItemSchema)
    .min(1, { message: 'Cart cannot be empty' })
    .max(20, { message: 'Cart cannot exceed 20 distinct items' }),
  paymentMethod: PaymentMethodEnum.default('STRIPE'),
})

export type CheckoutBody = z.infer<typeof CheckoutBodySchema>
