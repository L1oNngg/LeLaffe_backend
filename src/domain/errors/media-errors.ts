/**
 * Custom Domain Errors — Media Pipeline
 *
 * Rule (nextjs-backend.md):
 * Each error maps to a specific HTTP status in route.ts.
 * NEVER return raw error messages or DB stack traces to the client.
 */

/** BR-01: File type not in whitelist → HTTP 400 */
export class UnsupportedFileTypeError extends Error {
  public readonly fileType: string

  constructor(fileType: string) {
    super(
      `File type "${fileType}" is not supported. Allowed: .mp4, .mov, .jpg, .png, .webp`
    )
    this.name = 'UnsupportedFileTypeError'
    this.fileType = fileType
  }
}

/** BR-02: File exceeds size limit → HTTP 413 */
export class FileTooLargeError extends Error {
  public readonly fileSize: number
  public readonly maxSize: number

  constructor(fileSize: number, maxSize: number) {
    const maxMB = Math.round(maxSize / (1024 * 1024))
    super(
      `File size ${Math.round(fileSize / (1024 * 1024))}MB exceeds the maximum allowed ${maxMB}MB.`
    )
    this.name = 'FileTooLargeError'
    this.fileSize = fileSize
    this.maxSize = maxSize
  }
}

/** AWS S3 configuration is missing or invalid → HTTP 500 */
export class S3ConfigurationError extends Error {
  constructor(detail: string) {
    super(`S3 configuration error: ${detail}`)
    this.name = 'S3ConfigurationError'
  }
}

/** Failed to generate pre-signed URL from AWS → HTTP 500 */
export class PresignedUrlGenerationError extends Error {
  constructor() {
    super('Failed to generate upload URL. Please try again later.')
    this.name = 'PresignedUrlGenerationError'
  }
}

// ================================================================
// MediaConvert Webhook Errors
// ================================================================

/** Webhook signature/token mismatch → HTTP 401 */
export class InvalidWebhookSignatureError extends Error {
  constructor() {
    super('Invalid or missing webhook signature.')
    this.name = 'InvalidWebhookSignatureError'
  }
}

/** Media record not found by raw_s3_key → HTTP 404 */
export class MediaNotFoundError extends Error {
  public readonly fileKey: string

  constructor(fileKey: string) {
    super(`Media record with fileKey "${fileKey}" not found.`)
    this.name = 'MediaNotFoundError'
    this.fileKey = fileKey
  }
}

/** Generic failure during webhook processing → HTTP 500 */
export class MediaWebhookProcessingError extends Error {
  constructor(detail: string) {
    super(`Webhook processing error: ${detail}`)
    this.name = 'MediaWebhookProcessingError'
  }
}
