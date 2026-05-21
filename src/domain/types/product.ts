import type { BlockType, MediaStatus, MediaType } from '@prisma/client'

// ================================================================
// DOMAIN INTERFACES — Imperial Skin Product Catalog
// These types are the "source of truth" for the Application Layer.
// Use-cases return these shapes; route.ts serialises to JSON.
// ================================================================

export interface CategoryDto {
  id: string
  name: string
  slug: string
}

export interface MediaDto {
  id: string
  mediaType: MediaType
  cdnUrl: string          // HLS .m3u8 or WebP URL — the ONLY URL exposed to FE
  thumbnailUrl: string | null
  resolutions: unknown    // JSON: { variants: ["1080p", "4k"] }
  status: MediaStatus
}

export interface StoryBlockDto {
  id: string
  blockType: BlockType
  textContent: unknown    // JSON: multilingual title/description structure
  orderIndex: number
  media: MediaDto
}

/** Lightweight product used in listing responses */
export interface ProductListItemDto {
  id: string
  name: string
  slug: string            // derived from category slug — see use-case note
  price: string           // Decimal serialised as string for JSON safety
  stock: number
  category: CategoryDto
  /** First READY image media — used as catalogue thumbnail */
  coverMedia: MediaDto | null
}

/** Full product with story blocks — used in detail / Scrollytelling response */
export interface ProductDetailDto extends ProductListItemDto {
  storyBlocks: StoryBlockDto[]
  media: MediaDto[]
}

// ================================================================
// PAGINATED RESPONSE WRAPPER
// ================================================================

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

// ================================================================
// STANDARD API RESPONSE ENVELOPE
// Per nextjs-backend.md: { status, data?, message? }
// ================================================================

export interface ApiSuccessResponse<T> {
  status: 'success'
  data: T
}

export interface ApiErrorResponse {
  status: 'error'
  message: string
}
