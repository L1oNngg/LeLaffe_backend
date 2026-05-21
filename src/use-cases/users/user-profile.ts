import { db } from '@/infrastructure/database/db'
import type {
  UserProfileDto,
  MyOrderDto,
  MyOrderListResultDto,
} from '@/domain/types/user'

// ================================================================
// USE CASE: User Profile & Order History
//
// Architecture (nextjs-backend.md):
//   SRP: This file handles ONLY user-facing profile operations.
//   These are NOT admin operations — no RBAC needed, only Auth.
//
// Security:
//   - userId comes from JWT middleware (x-user-id header), not from
//     the request body. Users can only access their own data.
//   - password_hash is NEVER selected from the database.
// ================================================================

// ── Use Case 1: Get User Profile ─────────────────────────────────

export async function getUserProfile(
  userId: string,
): Promise<UserProfileDto | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      created_at: true,
      // password_hash is intentionally NOT selected
    },
  })

  if (!user) return null

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.created_at.toISOString(),
  }
}

// ── Use Case 2: List User's Own Orders (Paginated) ──────────────

interface MyOrderListParams {
  userId: string
  page: number
  limit: number
}

export async function listMyOrders(
  params: MyOrderListParams,
): Promise<MyOrderListResultDto> {
  const { userId, page, limit } = params
  const skip = (page - 1) * limit

  // Scoped to userId — users can ONLY see their own orders
  const where = { user_id: userId }

  // Execute count + data queries in parallel for efficiency
  const [total, orders] = await db.$transaction([
    db.order.count({ where }),
    db.order.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: 'desc' }, // Most recent first
      include: {
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
    data: orders.map(mapToMyOrderDto),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  }
}

// ── Helper: Map Prisma Order to MyOrderDto ───────────────────────
// Note: No user info in the DTO since the customer is viewing
// their own orders — they already know who they are.

function mapToMyOrderDto(order: {
  id: string
  status: any
  payment_method: any
  total_amount: any
  created_at: Date
  items: Array<{
    id: string
    product_id: string
    quantity: number
    price_at_purchase: any
    product: { name: string }
  }>
}): MyOrderDto {
  return {
    id: order.id,
    status: order.status,
    paymentMethod: order.payment_method,
    totalAmount: order.total_amount.toString(),
    createdAt: order.created_at.toISOString(),
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.product_id,
      productName: item.product.name,
      quantity: item.quantity,
      priceAtPurchase: item.price_at_purchase.toString(),
    })),
  }
}
