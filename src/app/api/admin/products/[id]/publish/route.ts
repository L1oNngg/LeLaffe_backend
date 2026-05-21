import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { toggleProductPublishStatus } from '@/use-cases/admin/manage-products'
import { ProductNotFoundError } from '@/domain/errors/admin-errors'
import { db } from '@/infrastructure/database/db'

async function checkAdmin(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return false
  
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true },
  })

  return user?.role === 'ADMIN'
}

const togglePublishSchema = z.object({
  is_published: z.boolean(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const isAdmin = await checkAdmin(req)
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden: Admins only' }, { status: 403 })
    }

    const { id } = params
    const body = await req.json()
    const parsed = togglePublishSchema.parse(body)

    const product = await toggleProductPublishStatus(id, parsed.is_published)

    return NextResponse.json({ status: 'success', data: product }, { status: 200 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { status: 'error', message: 'Validation failed', errors: error.issues },
        { status: 400 }
      )
    }
    if (error instanceof ProductNotFoundError) {
      return NextResponse.json(
        { status: 'error', message: error.message },
        { status: 404 }
      )
    }
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 }
    )
  }
}
