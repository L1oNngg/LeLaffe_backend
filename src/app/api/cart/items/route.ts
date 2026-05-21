import { NextRequest, NextResponse } from 'next/server'
import { AddCartItemBodySchema } from '@/domain/schemas/cart.schema'
import { addCartItem } from '@/use-cases/cart/add-cart-item'
import {
  CartProductUnavailableError,
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

/**
 * POST /api/cart/items
 *
 * Body: { productId: string, quantity: number }
 *
 * Adds a product to the user's cart using Upsert logic:
 *   - If product NOT in cart → creates new entry with quantity
 *   - If product ALREADY in cart → increments quantity
 *
 * Validates:
 *   - Product exists and is published
 *   - Combined quantity does not exceed available stock
 *
 * Auth: Requires valid JWT (middleware.ts injects x-user-id).
 *
 * Error mapping:
 *   CartProductUnavailableError → 400
 *   CartInsufficientStockError  → 409
 *   CartDatabaseError           → 500
 */
export async function POST(
  req: NextRequest,
): Promise<NextResponse<ApiSuccessResponse<CartItemDto> | ApiErrorResponse>> {
  // ── 1. Auth guard ──────────────────────────────────────────────
  const userId = req.headers.get('x-user-id')
  if (!userId) {
    return NextResponse.json<ApiErrorResponse>(
      { status: 'error', message: 'Authentication required.' },
      { status: 401 },
    )
  }

  // ── 2. Parse & validate request body ──────────────────────────
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json<ApiErrorResponse>(
      { status: 'error', message: 'Invalid JSON body.' },
      { status: 400 },
    )
  }

  const parsed = AddCartItemBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json<ApiErrorResponse>(
      { status: 'error', message: parsed.error.issues[0].message },
      { status: 400 },
    )
  }

  // ── 3. Delegate to use-case ────────────────────────────────────
  try {
    const result = await addCartItem({
      userId,
      productId: parsed.data.productId,
      quantity: parsed.data.quantity,
    })

    return NextResponse.json<ApiSuccessResponse<CartItemDto>>(
      { status: 'success', data: result },
      { status: 201 },
    )
  } catch (error) {
    // 400 — Product not available
    if (error instanceof CartProductUnavailableError) {
      return NextResponse.json<ApiErrorResponse>(
        { status: 'error', message: error.message },
        { status: 400 },
      )
    }

    // 409 — Insufficient stock
    if (error instanceof CartInsufficientStockError) {
      return NextResponse.json<ApiErrorResponse>(
        {
          status: 'error',
          message: `Insufficient stock. Available: ${error.available}, Requested total: ${error.requested}.`,
        },
        { status: 409 },
      )
    }

    // 500 — DB / unexpected error
    console.error('[POST /api/cart/items] Error:', error)
    return NextResponse.json<ApiErrorResponse>(
      { status: 'error', message: 'An internal server error occurred.' },
      { status: 500 },
    )
  }
}
