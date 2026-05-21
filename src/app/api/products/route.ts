import { NextRequest, NextResponse } from 'next/server'
import { GetProductsQuerySchema } from '@/domain/schemas/product.schema'
import { getProducts } from '@/use-cases/products/get-products'
import { DatabaseError } from '@/domain/errors/catalog-errors'
import type { ApiErrorResponse, ApiSuccessResponse, PaginatedResponse, ProductListItemDto } from '@/domain/types/product'

// Cache: Revalidate every 60s — product list changes infrequently.
// Per nextjs-backend.md: explicitly handle Next.js caching.
export const revalidate = 60

/**
 * GET /api/products
 *
 * Query params:
 *   - page    (number, default: 1)
 *   - limit   (number, default: 12, max: 50)
 *   - category (string, optional — category slug)
 *
 * Rule (nextjs-backend.md → Route Thinness):
 * This file ONLY: validates input, calls use-case, returns JSON.
 * All business logic lives in src/use-cases/products/get-products.ts
 */
export async function GET(
  req: NextRequest,
): Promise<NextResponse<ApiSuccessResponse<PaginatedResponse<ProductListItemDto>> | ApiErrorResponse>> {
  // 1. Parse & validate query params with Zod
  const rawQuery = {
    page: req.nextUrl.searchParams.get('page') ?? undefined,
    limit: req.nextUrl.searchParams.get('limit') ?? undefined,
    category: req.nextUrl.searchParams.get('category') ?? undefined,
  }

  const parsed = GetProductsQuerySchema.safeParse(rawQuery)

  if (!parsed.success) {
    return NextResponse.json<ApiErrorResponse>(
      { status: 'error', message: parsed.error.issues[0].message },
      { status: 400 },
    )
  }

  // 2. Delegate to use-case
  try {
    const result = await getProducts(parsed.data)

    return NextResponse.json<ApiSuccessResponse<PaginatedResponse<ProductListItemDto>>>(
      { status: 'success', data: result },
      { status: 200 },
    )
  } catch (error) {
    if (error instanceof DatabaseError) {
      // DB errors: log internally, return safe generic message
      console.error('[GET /api/products] DatabaseError:', error.message)
      return NextResponse.json<ApiErrorResponse>(
        { status: 'error', message: 'An internal server error occurred.' },
        { status: 500 },
      )
    }

    // Unexpected errors
    console.error('[GET /api/products] Unexpected error:', error)
    return NextResponse.json<ApiErrorResponse>(
      { status: 'error', message: 'An internal server error occurred.' },
      { status: 500 },
    )
  }
}
