import type { Prisma } from '@prisma/client'

/**
 * Prisma Include Definition — Product with all relations
 *
 * Rule (nextjs-backend.md → Avoid N+1 Queries):
 * Always use `include` or `select` to fetch related data in a single DB trip.
 *
 * Include strategy:
 * - category: for menu breadcrumb / filter display
 * - media: all product media assets (HLS .m3u8, WebP)
 * - story_blocks: ordered by index, each with its associated media
 */
export const productWithRelationsInclude = {
  category: true,
  media: {
    orderBy: { status: 'asc' } as Prisma.MediaOrderByWithRelationInput,
  },
  story_blocks: {
    orderBy: { order_index: 'asc' } as Prisma.Product_Story_BlockOrderByWithRelationInput,
    include: {
      media: true,
    },
  },
} satisfies Prisma.ProductInclude

/**
 * Inferred full product type from Prisma (with relations)
 * Used internally in mappers — not exposed to API consumers directly.
 */
export type ProductWithRelations = Prisma.ProductGetPayload<{
  include: typeof productWithRelationsInclude
}>
