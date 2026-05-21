import {
  findMediaByRawS3Key,
  updateMediaStatus,
} from '@/infrastructure/repositories/media-repository'
import {
  MediaNotFoundError,
  MediaWebhookProcessingError,
} from '@/domain/errors/media-errors'
import type {
  MediaConvertJobPayload,
  MediaConvertWebhookResultDto,
} from '@/domain/types/media'

/**
 * Use-Case — Process MediaConvert Webhook
 *
 * Rule (nextjs-backend.md → SRP):
 * This function handles one specific business action:
 * update Media status in DB based on MediaConvert job result.
 *
 * Rule (nextjs-backend.md → DIP):
 * Calls media-repository (infrastructure) — never imports Prisma directly.
 *
 * Business Rules enforced:
 * - BR-10 (Fallback): If status is ERROR → mark as FAILED
 *   so Frontend auto-falls back to static thumbnail.
 * - Idempotency: If media is already READY, skip duplicate COMPLETE events.
 *
 * Flow:
 * 1. Look up Media by raw_s3_key (the fileKey from presigned URL step)
 * 2. If COMPLETE → set status=READY, save cdn_url (HLS .m3u8 path)
 * 3. If ERROR   → set status=FAILED (BR-10 fallback trigger)
 * 4. If PROGRESSING → set status=PROCESSING (intermediate state)
 */
export async function processMediaConvertWebhook(
  payload: MediaConvertJobPayload
): Promise<MediaConvertWebhookResultDto> {
  const { status, fileKey, cdnUrl } = payload

  try {
    // ── 1. Find the Media record by raw S3 key ──
    const media = await findMediaByRawS3Key(fileKey)
    if (!media) {
      throw new MediaNotFoundError(fileKey)
    }

    // ── 2. Idempotency check ──
    // If media is already READY, ignore duplicate COMPLETE signals
    if (media.status === 'READY' && status === 'COMPLETE') {
      console.log(
        `[MediaConvert Webhook] Media ${media.id} is already READY. Skipping duplicate.`
      )
      return {
        mediaId: media.id,
        newStatus: 'READY',
      }
    }

    // If media is already FAILED, ignore duplicate ERROR signals
    if (media.status === 'FAILED' && status === 'ERROR') {
      console.log(
        `[MediaConvert Webhook] Media ${media.id} is already FAILED. Skipping duplicate.`
      )
      return {
        mediaId: media.id,
        newStatus: 'FAILED',
      }
    }

    // ── 3. Update DB based on job status ──
    switch (status) {
      case 'COMPLETE': {
        // MediaConvert finished successfully → READY
        const updated = await updateMediaStatus(media.id, 'READY', cdnUrl)
        console.log(
          `[MediaConvert Webhook] Media ${updated.id} → READY. CDN: ${updated.cdn_url}`
        )
        return {
          mediaId: updated.id,
          newStatus: 'READY',
        }
      }

      case 'ERROR': {
        // MediaConvert failed → FAILED (BR-10: Frontend will fallback to thumbnail)
        const updated = await updateMediaStatus(media.id, 'FAILED')
        console.log(
          `[MediaConvert Webhook] Media ${updated.id} → FAILED. BR-10 fallback active.`
        )
        return {
          mediaId: updated.id,
          newStatus: 'FAILED',
        }
      }

      case 'PROGRESSING': {
        // Job is still running → PROCESSING
        const updated = await updateMediaStatus(media.id, 'PROCESSING')
        console.log(
          `[MediaConvert Webhook] Media ${updated.id} → PROCESSING.`
        )
        return {
          mediaId: updated.id,
          newStatus: 'PROCESSING',
        }
      }

      default:
        throw new MediaWebhookProcessingError(
          `Unexpected MediaConvert status: ${status}`
        )
    }
  } catch (error) {
    if (
      error instanceof MediaNotFoundError ||
      error instanceof MediaWebhookProcessingError
    ) {
      throw error
    }
    throw new MediaWebhookProcessingError(
      error instanceof Error ? error.message : 'Unknown error'
    )
  }
}
