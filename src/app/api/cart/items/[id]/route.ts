import { NextRequest, NextResponse } from 'next/server'
import { UpdateCartItemBodySchema } from '@/domain/schemas/cart.schema'
import { updateCartItem } from '@/use-cases/cart/update-cart-item'
import { removeCartItem } from '@/use-cases/cart/delete-cart-item'
import {
  CartItemNotFoundError,
  CartInsufficientStockError,
  CartDatabaseError,
} from '@/domain/errors/cart-errors'
import type {
  ApiSuccessResponse,
  ApiErrorResponse,
} from '@/domain/types/product'
import type { CartItemDto } from '@/domain/types/cart'

// Per nextjs-backend.md: force-dynamic for any endpoint that mutates state
export const dynamic = 'force-dynamic'

// ================================================================
// Next.js 15 App Router: Dynamic route params are now a Promise.
// We must await the params object before accessing its properties.
// ================================================================

type RouteContext = {
  params: Promise<{ id: string }>
}

/**
 * PUT /api/cart/items/:id
 *
 * Body: { quantity: number }
 *
 * Updates the quantity of a specific CartItem.
 * Quantity is an absolute SET (not increment).
 *
 * Validates:
 *   - CartItem exists and belongs to the authenticated user's cart
 *   - New quantity does not exceed available stock
 *
 * Auth: Requires valid JWT (middleware.ts injects x-user-id).
 *
 * Error mapping:
 *   CartItemNotFoundError       → 404
 *   CartInsufficientStockError  → 409
 *   CartDatabaseError           → 500
 */
export async function PUT(
  req: NextRequest,
  context: RouteContext,
): Promise<NextResponse<ApiSuccessResponse<CartItemDto> | ApiErrorResponse>> {
  // ── 1. Auth guard ──────────────────────────────────────────────
  const userId = req.headers.get('x-user-id')
  if (!userId) {
    return NextResponse.json<ApiErrorResponse>(
      { status: 'error', message: 'Authentication required.' },
      { status: 401 },
    )
  }

  // ── 2. Extract route param ─────────────────────────────────────
  const { id: itemId } = await context.params

  // ── 3. Parse & validate request body ──────────────────────────
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json<ApiErrorResponse>(
      { status: 'error', message: 'Invalid JSON body.' },
      { status: 400 },
    )
  }

  const parsed = UpdateCartItemBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json<ApiErrorResponse>(
      { status: 'error', message: parsed.error.issues[0].message },
      { status: 400 },
    )
  }

  // ── 4. Delegate to use-case ────────────────────────────────────
  try {
    const result = await updateCartItem({
      userId,
      itemId,
      quantity: parsed.data.quantity,
    })

    return NextResponse.json<ApiSuccessResponse<CartItemDto>>(
      { status: 'success', data: result },
      { status: 200 },
    )
  } catch (error) {
    // 404 — Item not found or doesn't belong to user
    if (error instanceof CartItemNotFoundError) {
      return NextResponse.json<ApiErrorResponse>(
        { status: 'error', message: error.message },
        { status: 404 },
      )
    }

    // 409 — Insufficient stock
    if (error instanceof CartInsufficientStockError) {
      return NextResponse.json<ApiErrorResponse>(
        {
          status: 'error',
          message: `Insufficient stock. Available: ${error.available}, Requested: ${error.requested}.`,
        },
        { status: 409 },
      )
    }

    // 500 — DB / unexpected error
    console.error('[PUT /api/cart/items/:id] Error:', error)
    return NextResponse.json<ApiErrorResponse>(
      { status: 'error', message: 'An internal server error occurred.' },
      { status: 500 },
    )
  }
}

/**
 * DELETE /api/cart/items/:id
 *
 * Removes a specific CartItem from the user's cart.
 *
 * Validates:
 *   - CartItem exists and belongs to the authenticated user's cart
 *
 * Auth: Requires valid JWT (middleware.ts injects x-user-id).
 *
 * Error mapping:
 *   CartItemNotFoundError → 404
 *   CartDatabaseError     → 500
 */
export async function DELETE(
  req: NextRequest,
  context: RouteContext,
): Promise<NextResponse<ApiSuccessResponse<{ deletedItemId: string }> | ApiErrorResponse>> {
  // ── 1. Auth guard ──────────────────────────────────────────────
  const userId = req.headers.get('x-user-id')
  if (!userId) {
    return NextResponse.json<ApiErrorResponse>(
      { status: 'error', message: 'Authentication required.' },
      { status: 401 },
    )
  }

  // ── 2. Extract route param ─────────────────────────────────────
  const { id: itemId } = await context.params

  // ── 3. Delegate to use-case ────────────────────────────────────
  try {
    const result = await removeCartItem({ userId, itemId })

    return NextResponse.json<ApiSuccessResponse<{ deletedItemId: string }>>(
      { status: 'success', data: result },
      { status: 200 },
    )
  } catch (error) {
    // 404 — Item not found or doesn't belong to user
    if (error instanceof CartItemNotFoundError) {
      return NextResponse.json<ApiErrorResponse>(
        { status: 'error', message: error.message },
        { status: 404 },
      )
    }

    // 500 — DB / unexpected error
    console.error('[DELETE /api/cart/items/:id] Error:', error)
    return NextResponse.json<ApiErrorResponse>(
      { status: 'error', message: 'An internal server error occurred.' },
      { status: 500 },
    )
  }
}
