// ================================================================
// DOMAIN TYPES — Media Pipeline (Pre-signed URL)
// ================================================================

/** Payload passed from route.ts → generate-presigned-url use-case */
export interface PresignedUrlPayload {
  fileName: string
  fileType: string
  fileSize: number
}

/** Response returned after successful pre-signed URL generation */
export interface PresignedUrlResultDto {
  /** Pre-signed URL for the client to PUT the file directly to S3 */
  uploadUrl: string
  /** S3 object key (e.g. "raw/video/a1b2c3d4.mp4") — saved to DB later */
  fileKey: string
}

// ================================================================
// DOMAIN TYPES — Media Pipeline (MediaConvert Webhook)
// ================================================================

/** Parsed payload passed from route.ts → webhook use-case */
export interface MediaConvertJobPayload {
  /** MediaConvert job status: COMPLETE or ERROR */
  status: 'COMPLETE' | 'ERROR' | 'PROGRESSING'
  /** The raw S3 key used to look up the Media record in DB */
  fileKey: string
  /** CDN URL of the processed HLS playlist (only on COMPLETE) */
  cdnUrl?: string
}

/** Result after processing the webhook */
export interface MediaConvertWebhookResultDto {
  /** The Media record ID that was updated */
  mediaId: string
  /** New status of the media record */
  newStatus: 'READY' | 'FAILED' | 'PROCESSING'
}
