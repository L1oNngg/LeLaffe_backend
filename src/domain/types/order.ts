import type { OrderStatus, PaymentMethod } from '@prisma/client'

// ================================================================
// DOMAIN TYPES — Order / Checkout
// ================================================================

/** Single item in a checkout request — from the client */
export interface CheckoutItemInput {
  productId: string
  quantity: number
}

/** Validated payload passed from route.ts → use-case */
export interface CheckoutPayload {
  userId: string
  items: CheckoutItemInput[]
  paymentMethod: PaymentMethod
  ipAddress?: string         // Required by VNPay for audit trail
}

/** Response returned after successful checkout */
export interface CheckoutResultDto {
  orderId: string
  status: OrderStatus
  total: string           // Decimal → string (BR-09: server-side price)
  itemCount: number
  createdAt: string       // ISO timestamp
  checkoutUrl?: string    // Stripe, VNPay, or MoMo payment URL
  paymentMethod: PaymentMethod
}

// ================================================================
// DOMAIN TYPES — Admin Order Management
// ================================================================

/** Single order item with product details — for admin order view */
export interface AdminOrderItemDto {
  id: string
  productId: string
  productName: string
  quantity: number
  priceAtPurchase: string   // Decimal → string
}

/** Full order details — for admin order list/detail */
export interface AdminOrderDto {
  id: string
  status: OrderStatus
  paymentMethod: PaymentMethod
  totalAmount: string       // Decimal → string
  createdAt: string         // ISO timestamp
  user: {
    id: string
    email: string
  }
  items: AdminOrderItemDto[]
}

/** Paginated admin order list result */
export interface AdminOrderListResultDto {
  data: AdminOrderDto[]
  total: number
  page: number
  limit: number
  totalPages: number
}

