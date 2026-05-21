import { db } from '@/infrastructure/database/db'
import type { OrderStatus } from '@prisma/client'
import type {
  AdminOrderDto,
  AdminOrderListResultDto,
} from '@/domain/types/order'
import {
  OrderNotFoundError,
  InvalidOrderStatusTransitionError,
} from '@/domain/errors/order-errors'

// ================================================================
// USE CASE: Admin Order Management
//
// Business Logic:
//   - List orders with pagination + optional status filter
//   - Update order status with transition validation
//   - Inventory recovery when Admin cancels an order (BR-07)
//
// Architecture (nextjs-backend.md):
//   SRP: This file handles ONLY admin order operations.
//   DIP: Uses db (Prisma client) injected from infrastructure layer.
//
// Status Transition Rules:
//   PENDING     → CANCELLED (admin cancels before payment)
//   PROCESSING  → SHIPPED, CANCELLED
//   SHIPPED     → DELIVERED
//   DELIVERED   → (terminal state — no transitions allowed)
//   CANCELLED   → (terminal state — no transitions allowed)
// ================================================================

// ── Valid status transitions map ──────────────────────────────────
const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],   // Terminal
  CANCELLED: [],   // Terminal
}

// ── Helper: Map Prisma Order to AdminOrderDto ────────────────────

interface OrderWithRelations {
  id: string
  status: OrderStatus
  payment_method: any
  total_amount: any
  created_at: Date
  user: { id: string; email: string }
  items: Array<{
    id: string
    product_id: string
    quantity: number
    price_at_purchase: any
    product: { name: string }
  }>
}

function mapToAdminOrderDto(order: OrderWithRelations): AdminOrderDto {
  return {
    id: order.id,
    status: order.status,
    paymentMethod: order.payment_method,
    totalAmount: order.total_amount.toString(),
    createdAt: order.created_at.toISOString(),
    user: {
      id: order.user.id,
      email: order.user.email,
    },
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.product_id,
      productName: item.product.name,
      quantity: item.quantity,
      priceAtPurchase: item.price_at_purchase.toString(),
    })),
  }
}

// ── Use Case 1: List Orders (Paginated + Filtered) ──────────────

interface ListOrdersParams {
  page: number
  limit: number
  status?: OrderStatus
}

export async function listAdminOrders(
  params: ListOrdersParams,
): Promise<AdminOrderListResultDto> {
  const { page, limit, status } = params
  const skip = (page - 1) * limit

  // Build WHERE clause dynamically based on filter
  const where = status ? { status } : {}

  // Execute count + data queries in parallel for efficiency
  const [total, orders] = await db.$transaction([
    db.order.count({ where }),
    db.order.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: 'desc' }, // Most recent first
      include: {
        user: {
          select: { id: true, email: true },
        },
        items: {
          include: {
            product: {
              select: { name: true },
            },
          },
        },
      },
    }),
  ])

  return {
    data: orders.map(mapToAdminOrderDto),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  }
}

// ── Use Case 2: Update Order Status ──────────────────────────────

interface UpdateOrderStatusParams {
  orderId: string
  newStatus: OrderStatus
}

export async function updateOrderStatus(
  params: UpdateOrderStatusParams,
): Promise<AdminOrderDto> {
  const { orderId, newStatus } = params

  // Step 1: Find order and validate existence
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      user: { select: { id: true, email: true } },
      items: {
        include: {
          product: { select: { name: true } },
        },
      },
    },
  })

  if (!order) {
    throw new OrderNotFoundError(orderId)
  }

  // Step 2: Validate status transition
  const allowedTransitions = VALID_TRANSITIONS[order.status]
  if (!allowedTransitions.includes(newStatus)) {
    throw new InvalidOrderStatusTransitionError(order.status, newStatus)
  }

  // Step 3: Execute update (with inventory recovery if cancelling)
  if (newStatus === 'CANCELLED') {
    // BR-07: Restore stock when admin cancels an order
    // Only restore if the order was in a state where stock was deducted
    // (PENDING and PROCESSING both have stock deducted at checkout time)
    const updatedOrder = await db.$transaction(async (tx) => {
      const result = await tx.order.update({
        where: { id: orderId },
        data: { status: newStatus },
        include: {
          user: { select: { id: true, email: true } },
          items: {
            include: {
              product: { select: { name: true } },
            },
          },
        },
      })

      // Restore stock for each item
      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.product_id },
          data: { stock: { increment: item.quantity } },
        })
      }

      return result
    })

    return mapToAdminOrderDto(updatedOrder)
  }

  // Non-cancel transitions: simple status update
  const updatedOrder = await db.order.update({
    where: { id: orderId },
    data: { status: newStatus },
    include: {
      user: { select: { id: true, email: true } },
      items: {
        include: {
          product: { select: { name: true } },
        },
      },
    },
  })

  return mapToAdminOrderDto(updatedOrder)
}
