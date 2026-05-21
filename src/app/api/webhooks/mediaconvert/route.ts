import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { MediaConvertWebhookSchema } from '@/domain/schemas/media.schema'
import { processMediaConvertWebhook } from '@/use-cases/media/process-mediaconvert-webhook'
import {
  InvalidWebhookSignatureError,
  MediaNotFoundError,
  MediaWebhookProcessingError,
} from '@/domain/errors/media-errors'
import type { MediaConvertJobPayload } from '@/domain/types/media'

/**
 * POST /api/webhooks/mediaconvert
 *
 * Receive MediaConvert job status updates from AWS EventBridge.
 *
 * Security:
 * - NOT protected by JWT middleware (webhooks don't carry user tokens).
 * - Instead, validates a shared secret token in the
 *   `x-webhook-secret` header (configured on the EventBridge HTTP target).
 *   In production, this would use AWS Signature V4 verification.
 *
 * Happy path:  200 OK           → { received: true, data }
 * Unhappy:     400 Bad Request  → Invalid payload (Zod)
 *              401 Unauthorized → Missing or invalid webhook signature
 *              404 Not Found    → Media record not in DB
 *              500 Internal     → Unexpected processing error
 */

// ── Webhook Signature Verification ──
// EventBridge HTTP API Destination sends this header.
// In production, replace with AWS Signature V4 (via @aws-sdk/signature-v4).
function verifyWebhookSignature(req: NextRequest): void {
  const secret = process.env.MEDIACONVERT_WEBHOOK_SECRET
  if (!secret) {
    console.error(
      '[MediaConvert Webhook] MEDIACONVERT_WEBHOOK_SECRET is not configured in .env'
    )
    throw new InvalidWebhookSignatureError()
  }

  const headerSecret = req.headers.get('x-webhook-secret')
  if (!headerSecret || headerSecret !== secret) {
    throw new InvalidWebhookSignatureError()
  }
}

/**
 * Build the CDN URL from the MediaConvert output.
 *
 * MediaConvert outputs to: s3://bucket/processed/video/{uuid}/playlist.m3u8
 * We convert this to: https://{CLOUDFRONT_DOMAIN}/processed/video/{uuid}/playlist.m3u8
 */
function buildCdnUrl(
  outputGroupDetails?: { playlistFilePaths?: string[] }[]
): string | undefined {
  if (!outputGroupDetails || outputGroupDetails.length === 0) return undefined

  const firstOutput = outputGroupDetails[0]
  if (
    !firstOutput.playlistFilePaths ||
    firstOutput.playlistFilePaths.length === 0
  ) {
    return undefined
  }

  const s3Path = firstOutput.playlistFilePaths[0]
  const cloudfrontDomain = process.env.CLOUDFRONT_DOMAIN

  if (!cloudfrontDomain) {
    // Fallback: return the raw S3 path if CloudFront is not configured
    return s3Path
  }

  // Extract the key from s3://bucket-name/path/to/file
  // → https://cloudfront-domain/path/to/file
  const s3Match = s3Path.match(/^s3:\/\/[^/]+\/(.+)$/)
  if (s3Match) {
    const objectKey = s3Match[1]
    return `${cloudfrontDomain.replace(/\/$/, '')}/${objectKey}`
  }

  // If not an S3 URI, return as-is (already a URL or relative path)
  return s3Path
}

export async function POST(req: NextRequest) {
  try {
    // ── 1. Verify webhook signature ──
    verifyWebhookSignature(req)

    // ── 2. Parse & validate payload ──
    const body = await req.json()
    const parsed = MediaConvertWebhookSchema.parse(body)

    // ── 3. Ignore PROGRESSING if not needed (optional — we process it) ──
    const { status, userMetadata, outputGroupDetails } = parsed.detail

    // ── 4. Build CDN URL from output (only meaningful for COMPLETE) ──
    const cdnUrl = status === 'COMPLETE'
      ? buildCdnUrl(outputGroupDetails)
      : undefined

    // ── 5. Build use-case payload ──
    const jobPayload: MediaConvertJobPayload = {
      status,
      fileKey: userMetadata.fileKey,
      cdnUrl,
    }

    // ── 6. Delegate to use-case ──
    const result = await processMediaConvertWebhook(jobPayload)

    return NextResponse.json(
      { received: true, data: result },
      { status: 200 }
    )
  } catch (error) {
    // ── Webhook signature error → 401 ──
    if (error instanceof InvalidWebhookSignatureError) {
      return NextResponse.json(
        { status: 'error', message: error.message },
        { status: 401 }
      )
    }

    // ── Zod validation error → 400 ──
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Invalid webhook payload',
          errors: error.issues,
        },
        { status: 400 }
      )
    }

    // ── Media not found → 404 ──
    if (error instanceof MediaNotFoundError) {
      console.warn(`[MediaConvert Webhook] ${error.message}`)
      return NextResponse.json(
        { status: 'error', message: error.message },
        { status: 404 }
      )
    }

    // ── Processing error → 500 ──
    if (error instanceof MediaWebhookProcessingError) {
      console.error(`[MediaConvert Webhook] ${error.message}`)
      return NextResponse.json(
        { status: 'error', message: 'Internal server error' },
        { status: 500 }
      )
    }

    // ── Unknown error → 500 ──
    console.error('[MediaConvert Webhook] Unexpected error:', error)
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 }
    )
  }
}
