import { z } from 'zod'

/**
 * Zod Schemas — Pre-signed URL Request Validation
 *
 * Rule (nextjs-backend.md): Validate ALL incoming payloads with Zod.
 * Zod is the single source of truth for TypeScript types.
 *
 * BR-01: Only allow .mp4, .mov, .jpg, .png, .webp
 * BR-02: Video max 2GB, Image max 10MB
 *
 * Note: This project uses Zod v4 — use string param for error messages.
 */

// ── Whitelist of allowed MIME types (BR-01) ──
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime'] as const
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

const ALL_ALLOWED_TYPES = [
  ...ALLOWED_VIDEO_TYPES,
  ...ALLOWED_IMAGE_TYPES,
] as const

type AllowedFileType = (typeof ALL_ALLOWED_TYPES)[number]

// ── Size limits in bytes (BR-02) ──
const MAX_VIDEO_SIZE = 2 * 1024 * 1024 * 1024 // 2 GB
const MAX_IMAGE_SIZE = 10 * 1024 * 1024        // 10 MB

// ----------------------------------------------------------------
// POST /api/admin/media/presigned-url — Request body schema
// ----------------------------------------------------------------
export const PresignedUrlBodySchema = z
  .object({
    /** Original file name (used to extract extension for S3 key) */
    fileName: z
      .string('fileName is required')
      .min(1, 'fileName cannot be empty')
      .max(255, 'fileName must be at most 255 characters'),

    /** MIME type of the file being uploaded */
    fileType: z
      .string('fileType is required')
      .refine(
        (val): val is AllowedFileType =>
          (ALL_ALLOWED_TYPES as readonly string[]).includes(val),
        {
          message: `Unsupported file type. Allowed: ${ALL_ALLOWED_TYPES.join(', ')}`,
        }
      ),

    /** File size in bytes */
    fileSize: z
      .number('fileSize is required')
      .int('fileSize must be an integer')
      .positive('fileSize must be a positive number'),
  })
  .refine(
    (data) => {
      const isVideo = (ALLOWED_VIDEO_TYPES as readonly string[]).includes(
        data.fileType
      )
      return isVideo
        ? data.fileSize <= MAX_VIDEO_SIZE
        : data.fileSize <= MAX_IMAGE_SIZE
    },
    {
      message: 'File size exceeds the maximum allowed limit',
      path: ['fileSize'],
    }
  )

export type PresignedUrlBody = z.infer<typeof PresignedUrlBodySchema>

// ── Exported constants for use in use-case layer ──
export {
  ALLOWED_VIDEO_TYPES,
  ALLOWED_IMAGE_TYPES,
  ALL_ALLOWED_TYPES,
  MAX_VIDEO_SIZE,
  MAX_IMAGE_SIZE,
}
export type { AllowedFileType }

// ================================================================
// POST /api/webhooks/mediaconvert — EventBridge Payload Schema
// ================================================================

/**
 * Models the AWS EventBridge event for MediaConvert job status changes.
 *
 * Real AWS payload structure:
 * {
 *   "source": "aws.mediaconvert",
 *   "detail-type": "MediaConvert Job State Change",
 *   "detail": {
 *     "status": "COMPLETE" | "ERROR",
 *     "userMetadata": { "fileKey": "raw/video/uuid.mp4" },
 *     "outputGroupDetails": [{ "playlistFilePaths": ["s3://bucket/processed/..."] }]
 *   }
 * }
 *
 * We model only the fields we need for DB updates.
 */

const MEDIACONVERT_STATUSES = ['COMPLETE', 'ERROR', 'PROGRESSING'] as const

const OutputGroupDetailSchema = z.object({
  playlistFilePaths: z.array(z.string()).optional(),
})

export const MediaConvertWebhookSchema = z.object({
  /** Event source identifier — must be from AWS MediaConvert */
  source: z.string('source is required'),

  /** Human-readable event type from EventBridge */
  'detail-type': z.string('detail-type is required'),

  /** Core payload containing job status and metadata */
  detail: z.object({
    /** MediaConvert job status */
    status: z.enum(MEDIACONVERT_STATUSES, {
      message: `status must be one of: ${MEDIACONVERT_STATUSES.join(', ')}`,
    }),

    /** Custom metadata we attached when creating the MediaConvert job */
    userMetadata: z.object({
      /** The raw S3 key we used when uploading — this is our DB lookup key */
      fileKey: z
        .string('fileKey is required in userMetadata')
        .min(1, 'fileKey cannot be empty'),
    }),

    /** Output details from MediaConvert (only present on COMPLETE) */
    outputGroupDetails: z.array(OutputGroupDetailSchema).optional(),
  }),
})

export type MediaConvertWebhookPayload = z.infer<typeof MediaConvertWebhookSchema>
export { MEDIACONVERT_STATUSES }

