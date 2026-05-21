import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { PresignedUrlBodySchema } from '@/domain/schemas/media.schema'
import { generateMediaUploadUrl } from '@/use-cases/admin/generate-presigned-url'
import {
  UnsupportedFileTypeError,
  FileTooLargeError,
  S3ConfigurationError,
  PresignedUrlGenerationError,
} from '@/domain/errors/media-errors'
import { db } from '@/infrastructure/database/db'

/**
 * POST /api/admin/media/presigned-url
 *
 * Issue a pre-signed PUT URL for direct Client-to-S3 upload.
 * Requires ADMIN role (RBAC).
 *
 * Middleware already verifies JWT and sets x-user-id / x-user-role headers.
 * This route additionally verifies the user's role from the database
 * as a defense-in-depth measure.
 *
 * Happy path:  200 OK           → { status, data: { uploadUrl, fileKey } }
 * Unhappy:     400 Bad Request  → Zod validation (missing/invalid fields)
 *              403 Forbidden    → Non-admin user
 *              413 Too Large    → File exceeds size limit (BR-02)
 *              500 Internal     → S3 config error or unexpected failure
 */

// ── RBAC: Check Admin Role ──
async function checkAdmin(req: NextRequest): Promise<boolean> {
  const userId = req.headers.get('x-user-id')
  if (!userId) return false

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true },
  })

  return user?.role === 'ADMIN'
}

export async function POST(req: NextRequest) {
  try {
    // 1. RBAC check
    const isAdmin = await checkAdmin(req)
    if (!isAdmin) {
      return NextResponse.json(
        { status: 'error', message: 'Forbidden: Admins only' },
        { status: 403 }
      )
    }

    // 2. Parse & validate body
    const body = await req.json()
    const parsed = PresignedUrlBodySchema.parse(body)

    // 3. Delegate to use-case
    const result = await generateMediaUploadUrl({
      fileName: parsed.fileName,
      fileType: parsed.fileType,
      fileSize: parsed.fileSize,
    })

    return NextResponse.json(
      { status: 'success', data: result },
      { status: 200 }
    )
  } catch (error) {
    // ── Zod validation error → 400 ──
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Validation failed',
          errors: error.issues,
        },
        { status: 400 }
      )
    }

    // ── BR-01: unsupported file type → 400 ──
    if (error instanceof UnsupportedFileTypeError) {
      return NextResponse.json(
        { status: 'error', message: error.message },
        { status: 400 }
      )
    }

    // ── BR-02: file too large → 413 ──
    if (error instanceof FileTooLargeError) {
      return NextResponse.json(
        { status: 'error', message: error.message },
        { status: 413 }
      )
    }

    // ── S3 config or generation error → 500 ──
    if (
      error instanceof S3ConfigurationError ||
      error instanceof PresignedUrlGenerationError
    ) {
      console.error(`[presigned-url] ${error.name}: ${error.message}`)
      return NextResponse.json(
        { status: 'error', message: 'Internal server error' },
        { status: 500 }
      )
    }

    // ── Unknown error → 500 ──
    console.error('[presigned-url] Unexpected error:', error)
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 }
    )
  }
}
