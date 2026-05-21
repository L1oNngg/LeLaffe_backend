import { db } from '@/infrastructure/database/db'
import { Prisma, BlockType } from '@prisma/client'
import {
  AdminDatabaseError,
  ProductNotFoundError,
  DuplicateSlugError,
} from '@/domain/errors/admin-errors'

export interface CreateProductPayload {
  name: string
  price: number
  stock: number
  slug: string
  category_id: string
  blocks?: {
    media_id: string
    block_type: keyof typeof BlockType
    text_content: any
    order_index: number
  }[]
  media_ids?: string[]
}

export interface UpdateProductPayload {
  name?: string
  price?: number
  stock?: number
  slug?: string
  category_id?: string
  is_published?: boolean
}

export interface UpdateBlocksPayload {
  blocks: {
    media_id: string
    block_type: keyof typeof BlockType
    text_content: any
    order_index: number
  }[]
}

export async function createProduct(payload: CreateProductPayload) {
  try {
    const existing = await db.product.findUnique({ where: { slug: payload.slug } })
    if (existing) {
      throw new DuplicateSlugError(payload.slug)
    }

    // Connect existing media via IDs if any.
    // Assuming the media already exists in the database.
    const mediaConnections = payload.media_ids
      ? payload.media_ids.map((id) => ({ id }))
      : []

    const product = await db.product.create({
      data: {
        name: payload.name,
        price: payload.price,
        stock: payload.stock,
        slug: payload.slug,
        category_id: payload.category_id,
        is_published: false,
        media: {
          connect: mediaConnections,
        },
        story_blocks: payload.blocks
          ? {
              create: payload.blocks.map((block) => ({
                media_id: block.media_id,
                block_type: block.block_type as BlockType,
                text_content: block.text_content,
                order_index: block.order_index,
              })),
            }
          : undefined,
      },
      include: {
        media: true,
        story_blocks: true,
      },
    })

    return product
  } catch (error) {
    if (error instanceof DuplicateSlugError) throw error
    throw new AdminDatabaseError(error instanceof Error ? error.message : 'Create error')
  }
}

export async function updateProduct(id: string, payload: UpdateProductPayload) {
  try {
    if (payload.slug) {
      const existing = await db.product.findFirst({
        where: { slug: payload.slug, NOT: { id } },
      })
      if (existing) throw new DuplicateSlugError(payload.slug)
    }

    const updated = await db.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id } })
      if (!product) throw new ProductNotFoundError(id)

      return await tx.product.update({
        where: { id },
        data: {
          ...payload,
        },
      })
    })

    return updated
  } catch (error) {
    if (error instanceof ProductNotFoundError || error instanceof DuplicateSlugError) {
      throw error
    }
    throw new AdminDatabaseError(error instanceof Error ? error.message : 'Update error')
  }
}

export async function updateBlocks(id: string, payload: UpdateBlocksPayload) {
  try {
    return await db.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id } })
      if (!product) throw new ProductNotFoundError(id)

      // Delete old blocks
      await tx.product_Story_Block.deleteMany({
        where: { product_id: id },
      })

      // Insert new blocks
      if (payload.blocks && payload.blocks.length > 0) {
        await tx.product_Story_Block.createMany({
          data: payload.blocks.map((block) => ({
            product_id: id,
            media_id: block.media_id,
            block_type: block.block_type as BlockType,
            text_content: block.text_content,
            order_index: block.order_index,
          })),
        })
      }

      // Return updated product with blocks
      return await tx.product.findUnique({
        where: { id },
        include: { story_blocks: { orderBy: { order_index: 'asc' } } },
      })
    })
  } catch (error) {
    if (error instanceof ProductNotFoundError) throw error
    throw new AdminDatabaseError(error instanceof Error ? error.message : 'Update blocks error')
  }
}

export async function toggleProductPublishStatus(id: string, is_published: boolean) {
  try {
    const product = await db.product.findUnique({ where: { id } })
    if (!product) throw new ProductNotFoundError(id)

    return await db.product.update({
      where: { id },
      data: { is_published },
    })
  } catch (error) {
    if (error instanceof ProductNotFoundError) throw error
    throw new AdminDatabaseError(error instanceof Error ? error.message : 'Toggle status error')
  }
}
