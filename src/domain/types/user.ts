import type { Role } from '@prisma/client'
import type { OrderStatus, PaymentMethod } from '@prisma/client'

// ================================================================
// DOMAIN TYPES — User Profile & Order History
// ================================================================

/** User profile returned to the authenticated user (never expose password_hash) */
export interface UserProfileDto {
  id: string
  email: string
  role: Role
  createdAt: string // ISO timestamp
}

/** Single order item with product name — for customer order history */
export interface MyOrderItemDto {
  id: string
  productId: string
  productName: string
  quantity: number
  priceAtPurchase: string // Decimal → string
}

/** Order summary for customer's order history */
export interface MyOrderDto {
  id: string
  status: OrderStatus
  paymentMethod: PaymentMethod
  totalAmount: string // Decimal → string
  createdAt: string // ISO timestamp
  items: MyOrderItemDto[]
}

/** Paginated order history result */
export interface MyOrderListResultDto {
  data: MyOrderDto[]
  total: number
  page: number
  limit: number
  totalPages: number
}
