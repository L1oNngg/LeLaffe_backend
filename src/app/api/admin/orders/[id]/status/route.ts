import { NextRequest, NextResponse } from 'next/server'
import {
  AdminUpdateOrderStatusSchema,
  OrderIdParamSchema,
} from '@/domain/schemas/admin-order.schema'
import { updateOrderStatus } from '@/use-cases/admin/manage-orders'
import {
  OrderNotFoundError,
  InvalidOrderStatusTransitionError,
} from '@/domain/errors/order-errors'
import { db } from '@/infrastructure/database/db'
import type {
  ApiSuccessResponse,
  ApiErrorResponse,
} from '@/domain/types/product'
import type { AdminOrderDto } from '@/domain/types/order'

// Per nextjs-backend.md: force-dynamic for state-mutating endpoints
export const dynamic = 'force-dynamic'

// ── RBAC: Check Admin Role ──────────────────────────────────────
async function checkAdmin(req: NextRequest): Promise<boolean> {
  const userId = req.headers.get('x-user-id')
  if (!userId) return false

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true },
  })

  return user?.role === 'ADMIN'
}

/**
 * PUT /api/admin/orders/[id]/status
 *
 * Update an order's status. Requires ADMIN role (RBAC).
 *
 * Path params:  id (UUID)
 * Body:         { status: 'SHIPPED' | 'DELIVERED' | 'CANCELLED' }
 *
 * Status transition rules (enforced in use-case):
 *   PENDING     → CANCELLED
 *   PROCESSING  → SHIPPED, CANCELLED
 *   SHIPPED     → DELIVERED
 *   DELIVERED   → (terminal — no transition)
 *   CANCELLED   → (terminal — no transition)
 *
 * Error mapping:
 *   OrderNotFoundError                  → 404
 *   InvalidOrderStatusTransitionError   → 400
 *   Zod validation error                → 400
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<ApiSuccessResponse<AdminOrderDto> | ApiErrorResponse>> {
  try {
    // ── 1. RBAC check ──────────────────────────────────────────────
    const isAdmin = await checkAdmin(req)
    if (!isAdmin) {
      return NextResponse.json<ApiErrorResponse>(
        { status: 'error', message: 'Forbidden: Admins only.' },
        { status: 403 },
      )
    }

    // ── 2. Validate path param ─────────────────────────────────────
    const resolvedParams = await params
    const paramParsed = OrderIdParamSchema.safeParse(resolvedParams)
    if (!paramParsed.success) {
      return NextResponse.json<ApiErrorResponse>(
        { status: 'error', message: paramParsed.error.issues[0].message },
        { status: 400 },
      )
    }

    // ── 3. Parse & validate request body ───────────────────────────
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json<ApiErrorResponse>(
        { status: 'error', message: 'Invalid JSON body.' },
        { status: 400 },
      )
    }

    const bodyParsed = AdminUpdateOrderStatusSchema.safeParse(body)
    if (!bodyParsed.success) {
      return NextResponse.json<ApiErrorResponse>(
        { status: 'error', message: bodyParsed.error.issues[0].message },
        { status: 400 },
      )
    }

    // ── 4. Delegate to use-case ────────────────────────────────────
    const result = await updateOrderStatus({
      orderId: paramParsed.data.id,
      newStatus: bodyParsed.data.status as import('@prisma/client').OrderStatus,
    })

    return NextResponse.json<ApiSuccessResponse<AdminOrderDto>>(
      { status: 'success', data: result },
      { status: 200 },
    )
  } catch (error) {
    // 404 — Order not found
    if (error instanceof OrderNotFoundError) {
      return NextResponse.json<ApiErrorResponse>(
        { status: 'error', message: error.message },
        { status: 404 },
      )
    }

    // 400 — Invalid status transition
    if (error instanceof InvalidOrderStatusTransitionError) {
      return NextResponse.json<ApiErrorResponse>(
        { status: 'error', message: error.message },
        { status: 400 },
      )
    }

    // 500 — Unexpected error
    console.error('[PUT /api/admin/orders/:id/status] Error:', error)
    return NextResponse.json<ApiErrorResponse>(
      { status: 'error', message: 'An internal server error occurred.' },
      { status: 500 },
    )
  }
}
