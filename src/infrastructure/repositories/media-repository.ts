import { db } from '@/infrastructure/database/db'
import type { MediaStatus } from '@prisma/client'

/**
 * Media Repository — Infrastructure Layer
 *
 * Rule (nextjs-backend.md → DIP):
 * Use-cases call repository functions instead of
 * importing PrismaClient directly.
 *
 * Handles DB queries related to the Media table,
 * particularly for the MediaConvert webhook flow.
 */

/**
 * Find a Media record by its raw S3 key.
 * This is the key assigned during presigned URL generation (e.g. "raw/video/uuid.mp4").
 */
export async function findMediaByRawS3Key(rawS3Key: string) {
  return db.media.findFirst({
    where: { raw_s3_key: rawS3Key },
    select: {
      id: true,
      status: true,
      raw_s3_key: true,
      cdn_url: true,
      media_type: true,
      product_id: true,
    },
  })
}

/**
 * Update a Media record's status and CDN URL after MediaConvert processing.
 *
 * - COMPLETE → status = READY, cdn_url = HLS playlist path
 * - ERROR    → status = FAILED (BR-10: Frontend fallback to thumbnail)
 */
export async function updateMediaStatus(
  mediaId: string,
  status: MediaStatus,
  cdnUrl?: string
) {
  return db.media.update({
    where: { id: mediaId },
    data: {
      status,
      ...(cdnUrl ? { cdn_url: cdnUrl } : {}),
    },
    select: {
      id: true,
      status: true,
      cdn_url: true,
      raw_s3_key: true,
    },
  })
}
