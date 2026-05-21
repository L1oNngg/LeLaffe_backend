import { randomUUID } from 'crypto'
import { generatePresignedPutUrl } from '@/infrastructure/services/aws-s3'
import {
  UnsupportedFileTypeError,
  FileTooLargeError,
  PresignedUrlGenerationError,
} from '@/domain/errors/media-errors'
import {
  ALLOWED_VIDEO_TYPES,
  MAX_VIDEO_SIZE,
  MAX_IMAGE_SIZE,
  ALL_ALLOWED_TYPES,
} from '@/domain/schemas/media.schema'
import type {
  PresignedUrlPayload,
  PresignedUrlResultDto,
} from '@/domain/types/media'

/**
 * Use-Case — Generate Pre-signed URL for S3 Upload
 *
 * Rule (nextjs-backend.md → SRP):
 * This function handles one specific business action:
 * validate media constraints and generate a pre-signed PUT URL.
 *
 * Rule (nextjs-backend.md → DIP):
 * Calls aws-s3 service (infrastructure) — never imports SDK directly.
 *
 * Business Rules enforced:
 * - BR-01: Only .mp4, .mov, .jpg, .png, .webp allowed
 * - BR-02: Video max 2GB, Image max 10MB
 * - BR-04: URL only grants PUT permission (enforced in aws-s3.ts)
 *
 * S3 Key Strategy:
 *   raw/{media_type}/{uuid}.{ext}
 *   Example: raw/video/a1b2c3d4-e5f6-7890-abcd-ef1234567890.mp4
 *   The "raw/" prefix indicates unprocessed uploads.
 *   MediaConvert picks up from "raw/video/" and outputs to "processed/".
 */

// ── Map MIME types to file extensions ──
const MIME_TO_EXTENSION: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

// ── Map MIME types to S3 folder prefix ──
const MIME_TO_FOLDER: Record<string, string> = {
  'video/mp4': 'video',
  'video/quicktime': 'video',
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
}

export async function generateMediaUploadUrl(
  payload: PresignedUrlPayload
): Promise<PresignedUrlResultDto> {
  const { fileName, fileType, fileSize } = payload

  // ── 1. Validate file type (BR-01) ──
  if (!(ALL_ALLOWED_TYPES as readonly string[]).includes(fileType)) {
    throw new UnsupportedFileTypeError(fileType)
  }

  // ── 2. Validate file size (BR-02) ──
  const isVideo = (ALLOWED_VIDEO_TYPES as readonly string[]).includes(fileType)
  const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE

  if (fileSize > maxSize) {
    throw new FileTooLargeError(fileSize, maxSize)
  }

  // ── 3. Build S3 key ──
  const extension = MIME_TO_EXTENSION[fileType] || extractExtension(fileName)
  const folder = MIME_TO_FOLDER[fileType] || 'other'
  const uuid = randomUUID()
  const fileKey = `raw/${folder}/${uuid}.${extension}`

  // ── 4. Generate pre-signed URL (BR-04: PUT only) ──
  try {
    const uploadUrl = await generatePresignedPutUrl(fileKey, fileType, fileSize)

    return {
      uploadUrl,
      fileKey,
    }
  } catch (error) {
    // Re-throw domain errors from S3 service (config issues)
    if (error instanceof Error && error.name === 'S3ConfigurationError') {
      throw error
    }
    throw new PresignedUrlGenerationError()
  }
}

/**
 * Fallback extension extraction from the original file name.
 * Used when MIME type doesn't have a known mapping.
 */
function extractExtension(fileName: string): string {
  const parts = fileName.split('.')
  if (parts.length < 2) return 'bin'
  return parts[parts.length - 1].toLowerCase()
}
