import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { S3ConfigurationError } from '@/domain/errors/media-errors'

/**
 * AWS S3 Service — Infrastructure Layer
 *
 * Rule (nextjs-backend.md → DIP):
 * Use-cases call this service instead of importing AWS SDK directly.
 *
 * Rule (BR-04): Pre-signed URLs ONLY grant PutObject permission.
 * No GetObject, ListBucket, or DeleteObject.
 *
 * @see 01_SRS_Architecture.md → Security: S3 Block Public Access + OAC
 */

// ── URL Expiration: 5 minutes (300 seconds) ──
const PRESIGNED_URL_EXPIRES_IN = 300

/**
 * Lazily-initialized S3 client singleton.
 * Prevents issues during build/import when env vars may not exist.
 */
let _s3Client: S3Client | null = null

function getS3Client(): S3Client {
  if (_s3Client) return _s3Client

  const region = process.env.AWS_REGION
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

  if (!region || !accessKeyId || !secretAccessKey) {
    throw new S3ConfigurationError(
      'Missing AWS_REGION, AWS_ACCESS_KEY_ID, or AWS_SECRET_ACCESS_KEY in environment variables.'
    )
  }

  _s3Client = new S3Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  })

  return _s3Client
}

function getBucketName(): string {
  const bucket = process.env.AWS_S3_BUCKET_NAME
  if (!bucket) {
    throw new S3ConfigurationError(
      'Missing AWS_S3_BUCKET_NAME in environment variables.'
    )
  }
  return bucket
}

/**
 * Generate a pre-signed PUT URL for direct client-to-S3 upload.
 *
 * @param fileKey   - The S3 object key (e.g. "raw/video/uuid.mp4")
 * @param fileType  - MIME type for Content-Type enforcement
 * @param fileSize  - File size in bytes for Content-Length enforcement
 * @returns Pre-signed URL string valid for 5 minutes
 *
 * Security (BR-04):
 * - Only PutObject command is signed (no GET, LIST, DELETE)
 * - Content-Type is locked to the declared MIME type
 * - Content-Length is locked to prevent upload of larger files
 */
export async function generatePresignedPutUrl(
  fileKey: string,
  fileType: string,
  fileSize: number
): Promise<string> {
  const client = getS3Client()
  const bucket = getBucketName()

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: fileKey,
    ContentType: fileType,
    ContentLength: fileSize,
  })

  return getSignedUrl(client, command, {
    expiresIn: PRESIGNED_URL_EXPIRES_IN,
  })
}
