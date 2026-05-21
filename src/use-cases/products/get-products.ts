import { db } from '@/infrastructure/database/db'
import { productWithRelationsInclude } from '@/infrastructure/repositories/product-repository'
import { DatabaseError } from '@/domain/errors/catalog-errors'
import type { GetProductsQuery } from '@/domain/schemas/product.schema'
import type { PaginatedResponse, ProductListItemDto } from '@/domain/types/product'
import { mapToProductListItem } from './mappers'

// ================================================================
// USE CASE: Get Products (Paginated)
//
// Rule (nextjs-backend.md):
// - Framework-agnostic: NO Next.js imports here.
// - Single responsibility: ONLY handles paginated product listing.
// - Only returns is_published=true products to public consumers.
// - Accepts optional `category` filter (category slug).
// ================================================================

export async function getProducts(
  query: GetProductsQuery,
): Promise<PaginatedResponse<ProductListItemDto>> {
  const { page, limit, category } = query
  const skip = (page - 1) * limit

  try {
    const where = {
      is_published: true,
      ...(category && {
        category: { slug: category },
      }),
    }

    // Single DB round-trip: count + data via Promise.all
    const [total, products] = await Promise.all([
      db.product.count({ where }),
      db.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: productWithRelationsInclude,
      }),
    ])

    return {
      data: products.map(mapToProductListItem),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  } catch (error) {
    // Re-throw as domain error — route.ts will map to HTTP 500
    throw new DatabaseError(
      error instanceof Error ? error.message : 'Failed to fetch products',
    )
  }
}
