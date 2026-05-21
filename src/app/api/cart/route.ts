import { NextRequest, NextResponse } from 'next/server'
import { getCart } from '@/use-cases/cart/get-cart'
import type {
  ApiSuccessResponse,
  ApiErrorResponse,
} from '@/domain/types/product'
import type { CartDto } from '@/domain/types/cart'

// Per nextjs-backend.md: force-dynamic for user-specific data
export const dynamic = 'force-dynamic'

/**
 * GET /api/cart
 *
 * Returns the authenticated user's shopping cart with all items.
 * If user doesn't have a cart yet, one is auto-created (empty).
 *
 * Auth: Requires valid JWT (middleware.ts injects x-user-id).
 *
 * Response includes:
 *   - Cart items with product details (name, price, stock)
 *   - Total items count and total amount for display
 *
 * Rule (nextjs-backend.md → Route Thinness):
 * This file ONLY: extracts userId, calls use-case, returns JSON.
 */
export async function GET(
  req: NextRequest,
): Promise<NextResponse<ApiSuccessResponse<CartDto> | ApiErrorResponse>> {
  try {
    // ── 1. Auth guard (Secured by middleware.ts) ──────────────────
    const userId = req.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json<ApiErrorResponse>(
        { status: 'error', message: 'Authentication required.' },
        { status: 401 },
      )
    }

    // ── 2. Delegate to use-case ──────────────────────────────────
    const cart = await getCart(userId)

    return NextResponse.json<ApiSuccessResponse<CartDto>>(
      { status: 'success', data: cart },
      { status: 200 },
    )
  } catch (error) {
    console.error('[GET /api/cart] Error:', error)
    return NextResponse.json<ApiErrorResponse>(
      { status: 'error', message: 'An internal server error occurred.' },
      { status: 500 },
    )
  }
}
