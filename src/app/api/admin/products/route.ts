import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createProduct } from '@/use-cases/admin/manage-products'
import { DuplicateSlugError } from '@/domain/errors/admin-errors'
import { db } from '@/infrastructure/database/db'
import { BlockType } from '@prisma/client'

// Middleware adds `x-user-id`
async function checkAdmin(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return false
  
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true },
  })

  return user?.role === 'ADMIN'
}

const blockSchema = z.object({
  media_id: z.string().uuid(),
  block_type: z.nativeEnum(BlockType),
  text_content: z.any(),
  order_index: z.number().int().nonnegative(),
})

const createProductSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  price: z.number().positive('Price must be greater than 0'),
  stock: z.number().int().nonnegative('Stock must be >= 0'),
  slug: z.string().min(1, 'Slug is required'),
  category_id: z.string().uuid('Category ID must be a valid UUID'),
  blocks: z.array(blockSchema).optional(),
  media_ids: z.array(z.string().uuid()).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const isAdmin = await checkAdmin(req)
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden: Admins only' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = createProductSchema.parse(body)

    const product = await createProduct(parsed)

    return NextResponse.json({ status: 'success', data: product }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { status: 'error', message: 'Validation failed', errors: error.issues },
        { status: 400 }
      )
    }
    if (error instanceof DuplicateSlugError) {
      return NextResponse.json(
        { status: 'error', message: error.message },
        { status: 409 } // Conflict
      )
    }
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 }
    )
  }
}
