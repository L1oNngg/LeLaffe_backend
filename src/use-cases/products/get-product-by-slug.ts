import { db } from '@/infrastructure/database/db'
import { productWithRelationsInclude } from '@/infrastructure/repositories/product-repository'
import { DatabaseError, ProductNotFoundError } from '@/domain/errors/catalog-errors'
import type { ProductDetailDto } from '@/domain/types/product'
import { mapToProductDetail } from './mappers'

// ================================================================
// USE CASE: Get Product by Slug (Detail / Scrollytelling)
//
// Rule (nextjs-backend.md):
// - Framework-agnostic: NO Next.js imports here.
// - Single responsibility: ONLY handles product detail lookup.
// - Throws ProductNotFoundError → route.ts maps to HTTP 404.
// - Throws DatabaseError → route.ts maps to HTTP 500.
// - Includes all story_blocks ordered by order_index for Scrollytelling.
// ================================================================

export async function getProductBySlug(slug: string): Promise<ProductDetailDto> {
  try {
    const product = await db.product.findUnique({
      where: {
        slug,
        is_published: true, // Guard: never expose unpublished products
      },
      include: productWithRelationsInclude,
    })

    if (!product) {
      throw new ProductNotFoundError(slug)
    }

    return mapToProductDetail(product)
  } catch (error) {
    // Re-throw domain errors as-is; wrap unknown errors
    if (error instanceof ProductNotFoundError) throw error

    throw new DatabaseError(
      error instanceof Error ? error.message : 'Failed to fetch product',
    )
  }
}
