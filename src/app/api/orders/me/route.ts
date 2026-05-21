import { NextRequest, NextResponse } from 'next/server'
import { MyOrderListQuerySchema } from '@/domain/schemas/user.schema'
import { listMyOrders } from '@/use-cases/users/user-profile'
import type {
  ApiSuccessResponse,
  ApiErrorResponse,
} from '@/domain/types/product'
import type { MyOrderListResultDto } from '@/domain/types/user'

// Per nextjs-backend.md: force-dynamic for user-specific data
export const dynamic = 'force-dynamic'

/**
 * GET /api/orders/me
 *
 * Returns the authenticated user's order history with pagination.
 * Auth: Requires valid JWT (middleware.ts injects x-user-id).
 *
 * Query params:
 *   - page  (number, default: 1)
 *   - limit (number, default: 10, max: 50)
 *
 * Security:
 *   - Orders are scoped to the authenticated userId from JWT
 *   - Users can ONLY see their own orders (no other user's data)
 *
 * Rule (nextjs-backend.md → Route Thinness):
 * This file ONLY: validates query, extracts userId, calls use-case, returns JSON.
 */
export async function GET(
  req: NextRequest,
): Promise<NextResponse<ApiSuccessResponse<MyOrderListResultDto> | ApiErrorResponse>> {
  try {
    // ── 1. Auth guard (Secured by middleware.ts) ──────────────────
    const userId = req.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json<ApiErrorResponse>(
        { status: 'error', message: 'Authentication required.' },
        { status: 401 },
      )
    }

    // ── 2. Parse & validate query params ─────────────────────────
    const { searchParams } = req.nextUrl
    const rawQuery = {
      page: searchParams.get('page') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    }

    const parsed = MyOrderListQuerySchema.safeParse(rawQuery)
    if (!parsed.success) {
      return NextResponse.json<ApiErrorResponse>(
        { status: 'error', message: parsed.error.issues[0].message },
        { status: 400 },
      )
    }

    // ── 3. Delegate to use-case ──────────────────────────────────
    const result = await listMyOrders({
      userId,
      page: parsed.data.page,
      limit: parsed.data.limit,
    })

    return NextResponse.json<ApiSuccessResponse<MyOrderListResultDto>>(
      { status: 'success', data: result },
      { status: 200 },
    )
  } catch (error) {
    console.error('[GET /api/orders/me] Error:', error)
    return NextResponse.json<ApiErrorResponse>(
      { status: 'error', message: 'An internal server error occurred.' },
      { status: 500 },
    )
  }
}
