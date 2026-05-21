import { NextRequest, NextResponse } from 'next/server'
import { MomoProvider } from '@/infrastructure/payment/MomoProvider'
import type { MomoIpnPayload } from '@/infrastructure/payment/MomoProvider'
import { EmailProvider } from '@/infrastructure/email/EmailProvider'
import { db } from '@/infrastructure/database/db'
import { clearCart } from '@/use-cases/cart/clear-cart'

// Per nextjs-backend.md: force-dynamic for webhook endpoints
export const dynamic = 'force-dynamic'

/**
 * POST /api/webhooks/momo
 *
 * MoMo IPN (Instant Payment Notification) endpoint.
 *
 * MoMo sends payment results as a JSON POST body.
 *
 * Security:
 *   - HMAC-SHA256 signature validation using MOMO_SECRET_KEY
 *   - Timing-safe comparison to prevent timing attacks
 *
 * Business Rules:
 *   - BR-08: Idempotency — Only update if order status is PENDING.
 *            Uses Prisma Transaction with WHERE status guard for
 *            atomic idempotency enforcement.
 *   - BR-07: Inventory recovery on payment failure
 *
 * MoMo IPN Response Codes:
 *   - resultCode == 0  → Payment successful
 *   - Any other code   → Payment failed
 *
 * OrderId parsing:
 *   MoMo receives orderId in format [dbOrderId]_[timestamp].
 *   We strip the timestamp suffix to recover the real DB order ID.
 *   See MomoProvider.extractDbOrderId() for details.
 *
 * IPN Response (MoMo expects HTTP 204 No Content on success):
 *   - 204: Acknowledged (MoMo stops retrying)
 *   - Non-2xx: MoMo will retry the IPN
 */
export async function POST(req: NextRequest) {
  try {
    // ── 1. Parse JSON body from MoMo ────────────────────────────────
    let payload: MomoIpnPayload
    try {
      payload = await req.json()
    } catch {
      console.error('[MoMo Webhook] Invalid JSON body')
      return new NextResponse(null, { status: 400 })
    }

    // ── 2. Validate HMAC-SHA256 signature ───────────────────────────
    const isValidSignature = MomoProvider.validateIpnSignature(payload)

    if (!isValidSignature) {
      console.error('[MoMo Webhook] Invalid signature', {
        orderId: payload.orderId,
        partnerCode: payload.partnerCode,
      })
      return new NextResponse(null, { status: 400 })
    }

    // ── 3. Extract real DB order ID ─────────────────────────────────
    // MoMo orderId format: [dbOrderId]_[timestamp]
    // We need the real DB UUID to query our database.
    const dbOrderId = MomoProvider.extractDbOrderId(payload.orderId)

    if (!dbOrderId) {
      console.error('[MoMo Webhook] Could not extract order ID from:', payload.orderId)
      return new NextResponse(null, { status: 400 })
    }

    // ── 4. Lookup order in DB ───────────────────────────────────────
    const order = await db.order.findUnique({
      where: { id: dbOrderId },
      include: { user: true, items: true },
    })

    if (!order) {
      console.error(`[MoMo Webhook] Order not found: ${dbOrderId} (momo: ${payload.orderId})`)
      // Return 204 to prevent MoMo from retrying for a non-existent order
      return new NextResponse(null, { status: 204 })
    }

    // ── 5. BR-08: Idempotency Check ─────────────────────────────────
    // If order is already beyond PENDING, skip processing.
    // This prevents duplicate webhook calls from re-processing orders.
    if (order.status !== 'PENDING') {
      console.log(
        `[MoMo Webhook] Order ${dbOrderId} already ${order.status}. Skipping (idempotent).`,
      )
      return new NextResponse(null, { status: 204 })
    }

    // ── 6. Process based on resultCode ──────────────────────────────
    if (payload.resultCode === 0) {
      // ── PAYMENT SUCCESS → Update to PROCESSING ──
      // BR-08: Atomic idempotency — the WHERE clause ensures we only
      // update if the order is still PENDING. If another webhook call
      // already processed this order, updateMany returns count=0.
      await db.$transaction(async (tx) => {
        const updated = await tx.order.updateMany({
          where: {
            id: dbOrderId,
            status: 'PENDING', // BR-08: Atomic idempotency guard
          },
          data: { status: 'PROCESSING' },
        })

        // If 0 rows updated, another webhook call already processed this
        if (updated.count === 0) {
          console.log(`[MoMo Webhook] Order ${dbOrderId} was already processed (race condition avoided).`)
          return
        }

        // Send confirmation email (non-blocking — won't fail the transaction)
        await EmailProvider.sendOrderConfirmation(
          order.user.email,
          dbOrderId,
          Number(order.total_amount),
        )
      })

      console.log(
        `[MoMo Webhook] Order ${dbOrderId} → PROCESSING (transId: ${payload.transId})`,
      )

      // Clear the user's cart after successful payment
      await clearCart(order.user_id)

      return new NextResponse(null, { status: 204 })
    } else {
      // ── PAYMENT FAILED → BR-07: Inventory Recovery ──
      await db.$transaction(async (tx) => {
        const updated = await tx.order.updateMany({
          where: {
            id: dbOrderId,
            status: 'PENDING', // BR-08: Only cancel if still PENDING
          },
          data: { status: 'CANCELLED' },
        })

        // If 0 rows updated, skip inventory recovery
        if (updated.count === 0) {
          console.log(`[MoMo Webhook] Order ${dbOrderId} was already processed. Skipping cancellation.`)
          return
        }

        // Restore stock for each item
        for (const item of order.items) {
          await tx.product.update({
            where: { id: item.product_id },
            data: { stock: { increment: item.quantity } },
          })
        }
      })

      console.log(
        `[MoMo Webhook] Order ${dbOrderId} → CANCELLED (resultCode: ${payload.resultCode}, message: ${payload.message}). Inventory restored.`,
      )
      return new NextResponse(null, { status: 204 })
    }
  } catch (error) {
    console.error('[MoMo Webhook] Unexpected error:', error)
    // Return 500 so MoMo retries the IPN
    return new NextResponse(null, { status: 500 })
  }
}
