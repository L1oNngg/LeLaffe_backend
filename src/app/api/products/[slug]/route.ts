import { NextRequest, NextResponse } from 'next/server'
import { GetProductBySlugParamsSchema } from '@/domain/schemas/product.schema'
import { getProductBySlug } from '@/use-cases/products/get-product-by-slug'
import { DatabaseError, ProductNotFoundError } from '@/domain/errors/catalog-errors'
import type { ApiErrorResponse, ApiSuccessResponse, ProductDetailDto } from '@/domain/types/product'

// Cache per product page — revalidate hourly.
// Scrollytelling pages are media-heavy; aggressive caching is intentional.
export const revalidate = 3600

/**
 * GET /api/products/[slug]
 *
 * Path params:
 *   - slug (string) — URL-friendly product identifier
 *
 * Response: Full product with story_blocks and media for Scrollytelling.
 *
 * Rule (nextjs-backend.md → Route Thinness):
 * This file ONLY: validates slug, calls use-case, returns JSON.
 * All logic lives in src/use-cases/products/get-product-by-slug.ts
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } },
): Promise<NextResponse<ApiSuccessResponse<ProductDetailDto> | ApiErrorResponse>> {
  // 1. Validate path param
  const parsed = GetProductBySlugParamsSchema.safeParse(params)

  if (!parsed.success) {
    return NextResponse.json<ApiErrorResponse>(
      { status: 'error', message: parsed.error.issues[0].message },
      { status: 400 },
    )
  }

  // 2. Delegate to use-case
  try {
    const product = await getProductBySlug(parsed.data.slug)

    return NextResponse.json<ApiSuccessResponse<ProductDetailDto>>(
      { status: 'success', data: product },
      { status: 200 },
    )
  } catch (error) {
    // 404 — Product not found or not published
    if (error instanceof ProductNotFoundError) {
      return NextResponse.json<ApiErrorResponse>(
        { status: 'error', message: error.message },
        { status: 404 },
      )
    }

    // 500 — DB error (log internally, return safe message)
    if (error instanceof DatabaseError) {
      console.error(`[GET /api/products/${params.slug}] DatabaseError:`, error.message)
      return NextResponse.json<ApiErrorResponse>(
        { status: 'error', message: 'An internal server error occurred.' },
        { status: 500 },
      )
    }

    // Unexpected errors
    console.error(`[GET /api/products/${params.slug}] Unexpected error:`, error)
    return NextResponse.json<ApiErrorResponse>(
      { status: 'error', message: 'An internal server error occurred.' },
      { status: 500 },
    )
  }
}
