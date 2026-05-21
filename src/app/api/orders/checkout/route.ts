import { NextRequest, NextResponse } from 'next/server'
import { CheckoutBodySchema } from '@/domain/schemas/order.schema'
import { processCheckout } from '@/use-cases/orders/process-checkout'
import {
  CheckoutDatabaseError,
  EmptyCartError,
  InsufficientStockError,
  ProductUnavailableError,
} from '@/domain/errors/order-errors'
import type {
  ApiErrorResponse,
  ApiSuccessResponse,
} from '@/domain/types/product'
import type { CheckoutResultDto } from '@/domain/types/order'

// Per nextjs-backend.md: force-dynamic for any endpoint that mutates state.
// Prevents stale cached responses on Checkout.
export const dynamic = 'force-dynamic'

/**
 * POST /api/orders/checkout
 *
 * Body: { items: [{ productId: string, quantity: number }], paymentMethod?: 'STRIPE' | 'VNPAY' | 'MOMO' }
 *
 * Auth: Requires authenticated user (userId injected by middleware.ts).
 *       Middleware verifies JWT and sets x-user-id header securely.
 *
 * Rule (nextjs-backend.md → Route Thinness):
 * This file ONLY: validates body, extracts userId, calls use-case, returns JSON.
 *
 * Error mapping:
 *   EmptyCartError          → 400
 *   ProductUnavailableError → 400
 *   InsufficientStockError  → 409 (BR-06)
 *   CheckoutDatabaseError   → 500
 */
export async function POST(
  req: NextRequest,
): Promise<NextResponse<ApiSuccessResponse<CheckoutResultDto> | ApiErrorResponse>> {
  // ── 1. Auth guard (Secured by middleware.ts) ────────────────────
  // Middleware.ts already validated the JWT and injected x-user-id header.
  // We just safely extract it here.
  const userId = req.headers.get('x-user-id')
  if (!userId) {
    return NextResponse.json<ApiErrorResponse>(
      { status: 'error', message: 'Authentication required.' },
      { status: 401 },
    )
  }

  // ── 2. Parse & validate request body ────────────────────────────
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json<ApiErrorResponse>(
      { status: 'error', message: 'Invalid JSON body.' },
      { status: 400 },
    )
  }

  const parsed = CheckoutBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json<ApiErrorResponse>(
      { status: 'error', message: parsed.error.issues[0].message },
      { status: 400 },
    )
  }

  // ── 3. Extract client IP for VNPay audit trail ────────────────────
  const ipAddress =
    req.ip ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    '127.0.0.1'

  // ── 4. Delegate to use-case ──────────────────────────────────────
  try {
    const result = await processCheckout({
      userId,
      items: parsed.data.items,
      paymentMethod: parsed.data.paymentMethod as import('@prisma/client').PaymentMethod,
      ipAddress,
    })

    return NextResponse.json<ApiSuccessResponse<CheckoutResultDto>>(
      { status: 'success', data: result },
      { status: 201 },
    )
  } catch (error) {
    // 400 — Empty cart (belt-and-suspenders)
    if (error instanceof EmptyCartError) {
      return NextResponse.json<ApiErrorResponse>(
        { status: 'error', message: error.message },
        { status: 400 },
      )
    }

    // 400 — Product not available/published
    if (error instanceof ProductUnavailableError) {
      return NextResponse.json<ApiErrorResponse>(
        { status: 'error', message: 'One or more products are not available.' },
        { status: 400 },
      )
    }

    // 409 — Insufficient stock (BR-06: Concurrency conflict → Rollback)
    if (error instanceof InsufficientStockError) {
      return NextResponse.json<ApiErrorResponse>(
        {
          status: 'error',
          message: `Insufficient stock for one or more items. Please update your cart.`,
        },
        { status: 409 },
      )
    }

    // 500 — DB / unexpected error (log internally, safe message to client)
    console.error('[POST /api/orders/checkout] Error:', error)
    return NextResponse.json<ApiErrorResponse>(
      { status: 'error', message: 'An internal server error occurred.' },
      { status: 500 },
    )
  }
}
