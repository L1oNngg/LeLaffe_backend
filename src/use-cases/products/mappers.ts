import type { ProductWithRelations } from '@/infrastructure/repositories/product-repository'
import type {
  CategoryDto,
  MediaDto,
  ProductDetailDto,
  ProductListItemDto,
  StoryBlockDto,
} from '@/domain/types/product'

// ================================================================
// MAPPERS — Prisma raw models → Clean DTO shapes
//
// Purpose:
// - Decouple use-cases from Prisma internals (e.g., Decimal type)
// - Ensure raw_s3_key is NEVER exposed to the client (security)
// - Serialise Decimal → string for safe JSON transport
// ================================================================

function mapCategory(category: ProductWithRelations['category']): CategoryDto {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
  }
}

function mapMedia(media: ProductWithRelations['media'][number]): MediaDto {
  return {
    id: media.id,
    mediaType: media.media_type,
    cdnUrl: media.cdn_url,           // HLS .m3u8 or WebP — ONLY this is exposed
    thumbnailUrl: media.thumbnail_url,
    resolutions: media.resolutions,
    status: media.status,
    // raw_s3_key is intentionally excluded — never sent to client
  }
}

function mapStoryBlock(
  block: ProductWithRelations['story_blocks'][number],
): StoryBlockDto {
  return {
    id: block.id,
    blockType: block.block_type,
    textContent: block.text_content,
    orderIndex: block.order_index,
    media: mapMedia(block.media),
  }
}

export function mapToProductListItem(product: ProductWithRelations): ProductListItemDto {
  // Cover = first READY IMAGE media; null if none processed yet
  const coverMedia =
    product.media.find(
      (m) => m.media_type === 'IMAGE' && m.status === 'READY',
    ) ?? null

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    price: product.price.toString(), // Decimal → string for safe JSON
    stock: product.stock,
    category: mapCategory(product.category),
    coverMedia: coverMedia ? mapMedia(coverMedia) : null,
  }
}

export function mapToProductDetail(product: ProductWithRelations): ProductDetailDto {
  return {
    ...mapToProductListItem(product),
    storyBlocks: product.story_blocks.map(mapStoryBlock),
    media: product.media.map(mapMedia),
  }
}
