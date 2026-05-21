import { NextRequest, NextResponse } from 'next/server'
import { AdminOrderListQuerySchema } from '@/domain/schemas/admin-order.schema'
import { listAdminOrders } from '@/use-cases/admin/manage-orders'
import { db } from '@/infrastructure/database/db'
import type {
  ApiSuccessResponse,
  ApiErrorResponse,
} from '@/domain/types/product'
import type { AdminOrderListResultDto } from '@/domain/types/order'

// Per nextjs-backend.md: force-dynamic for APIs that must fetch fresh data
export const dynamic = 'force-dynamic'

// ── RBAC: Check Admin Role ──────────────────────────────────────
// Defense-in-depth: Middleware already validates JWT and sets x-user-id,
// but we verify the DB role here to prevent header spoofing.
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
 * GET /api/admin/orders
 *
 * List all orders with pagination and optional status filter.
 * Requires ADMIN role (RBAC).
 *
 * Query params:
 *   - page   (number, default: 1)
 *   - limit  (number, default: 10, max: 100)
 *   - status (string, optional: PENDING | PROCESSING | SHIPPED | DELIVERED | CANCELLED)
 *
 * Response: { status: 'success', data: { data: Order[], total, page, limit, totalPages } }
 *
 * Rule (nextjs-backend.md → Route Thinness):
 * This file ONLY: validates query, checks RBAC, calls use-case, returns JSON.
 */
export async function GET(
  req: NextRequest,
): Promise<NextResponse<ApiSuccessResponse<AdminOrderListResultDto> | ApiErrorResponse>> {
  try {
    // ── 1. RBAC check ──────────────────────────────────────────────
    const isAdmin = await checkAdmin(req)
    if (!isAdmin) {
      return NextResponse.json<ApiErrorResponse>(
        { status: 'error', message: 'Forbidden: Admins only.' },
        { status: 403 },
      )
    }

    // ── 2. Parse & validate query params ───────────────────────────
    const { searchParams } = req.nextUrl
    const rawQuery = {
      page: searchParams.get('page') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
      status: searchParams.get('status') ?? undefined,
    }

    const parsed = AdminOrderListQuerySchema.safeParse(rawQuery)
    if (!parsed.success) {
      return NextResponse.json<ApiErrorResponse>(
        { status: 'error', message: parsed.error.issues[0].message },
        { status: 400 },
      )
    }

    // ── 3. Delegate to use-case ────────────────────────────────────
    const result = await listAdminOrders({
      page: parsed.data.page,
      limit: parsed.data.limit,
      status: parsed.data.status as import('@prisma/client').OrderStatus | undefined,
    })

    return NextResponse.json<ApiSuccessResponse<AdminOrderListResultDto>>(
      { status: 'success', data: result },
      { status: 200 },
    )
  } catch (error) {
    console.error('[GET /api/admin/orders] Error:', error)
    return NextResponse.json<ApiErrorResponse>(
      { status: 'error', message: 'An internal server error occurred.' },
      { status: 500 },
    )
  }
}
