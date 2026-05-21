import { NextRequest, NextResponse } from 'next/server'
import { VnpayProvider } from '@/infrastructure/payment/VnpayProvider'
import { EmailProvider } from '@/infrastructure/email/EmailProvider'
import { db } from '@/infrastructure/database/db'
import { clearCart } from '@/use-cases/cart/clear-cart'

// Per nextjs-backend.md: force-dynamic for webhook endpoints
export const dynamic = 'force-dynamic'

/**
 * POST /api/webhooks/vnpay
 *
 * VNPay IPN (Instant Payment Notification) endpoint.
 *
 * VNPay sends payment results as query-string params or POST body.
 * We handle both by merging URL searchParams + body params.
 *
 * Security:
 *   - HMAC-SHA512 signature validation using VNPAY_HASH_SECRET
 *   - Timing-safe comparison to prevent timing attacks
 *
 * Business Rules:
 *   - BR-08: Idempotency — Only update if order status is PENDING
 *   - BR-07: Inventory recovery on payment failure
 *
 * VNPay Response Codes:
 *   - vnp_ResponseCode == '00' → Payment successful
 *   - Any other code → Payment failed
 *
 * IPN Response (per VNPay spec):
 *   - RspCode '00' + Message 'Confirm Success' → VNPay marks as processed
 *   - RspCode '97' → Invalid checksum
 *   - RspCode '02' → Order already confirmed (idempotent)
 *   - RspCode '01' → Order not found
 *   - RspCode '99' → Unknown error
 */
export async function POST(req: NextRequest) {
  try {
    // ── 1. Extract params from URL query string + body ──────────────
    // VNPay typically sends data via GET query string for IPN,
    // but we also support POST body for flexibility.
    const params: Record<string, string> = {}

    // From URL query string
    req.nextUrl.searchParams.forEach((value, key) => {
      params[key] = value
    })

    // If POST body exists, merge it (body params take precedence)
    try {
      const body = await req.text()
      if (body) {
        const bodyParams = new URLSearchParams(body)
        bodyParams.forEach((value, key) => {
          params[key] = value
        })
      }
    } catch {
      // Body may not exist for GET-style IPN, that's fine
    }

    // ── 2. Validate HMAC-SHA512 signature ───────────────────────────
    const isValidSignature = VnpayProvider.validateSignature(params)

    if (!isValidSignature) {
      console.error('[VNPay Webhook] Invalid signature')
      return NextResponse.json(
        { RspCode: '97', Message: 'Invalid Checksum' },
        { status: 200 }, // VNPay expects 200 even on validation failure
      )
    }

    // ── 3. Extract critical fields ──────────────────────────────────
    const orderId = params['vnp_TxnRef']
    const responseCode = params['vnp_ResponseCode']
    const transactionNo = params['vnp_TransactionNo'] || ''

    if (!orderId) {
      console.error('[VNPay Webhook] Missing vnp_TxnRef (orderId)')
      return NextResponse.json(
        { RspCode: '01', Message: 'Order Not Found' },
        { status: 200 },
      )
    }

    // ── 4. Lookup order in DB ───────────────────────────────────────
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: { user: true, items: true },
    })

    if (!order) {
      console.error(`[VNPay Webhook] Order not found: ${orderId}`)
      return NextResponse.json(
        { RspCode: '01', Message: 'Order Not Found' },
        { status: 200 },
      )
    }

    // ── 5. BR-08: Idempotency Check ─────────────────────────────────
    // If order is already beyond PENDING, skip processing.
    // This prevents duplicate webhook calls from re-processing orders.
    if (order.status !== 'PENDING') {
      console.log(`[VNPay Webhook] Order ${orderId} already ${order.status}. Skipping.`)
      return NextResponse.json(
        { RspCode: '02', Message: 'Order Already Confirmed' },
        { status: 200 },
      )
    }

    // ── 6. Process based on response code ───────────────────────────
    if (responseCode === '00') {
      // ── PAYMENT SUCCESS → Update to PROCESSING ──
      await db.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: orderId },
          data: { status: 'PROCESSING' },
        })

        // Send confirmation email
        await EmailProvider.sendOrderConfirmation(
          order.user.email,
          orderId,
          Number(order.total_amount),
        )
      })

      console.log(`[VNPay Webhook] Order ${orderId} → PROCESSING (txn: ${transactionNo})`)

      // Clear the user's cart after successful payment
      await clearCart(order.user_id)

      return NextResponse.json(
        { RspCode: '00', Message: 'Confirm Success' },
        { status: 200 },
      )
    } else {
      // ── PAYMENT FAILED → BR-07: Inventory Recovery ──
      await db.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: orderId },
          data: { status: 'CANCELLED' },
        })

        // Restore stock for each item
        for (const item of order.items) {
          await tx.product.update({
            where: { id: item.product_id },
            data: { stock: { increment: item.quantity } },
          })
        }
      })

      console.log(`[VNPay Webhook] Order ${orderId} → CANCELLED (code: ${responseCode}). Inventory restored.`)
      return NextResponse.json(
        { RspCode: '00', Message: 'Confirm Success' },
        { status: 200 },
      )
    }
  } catch (error) {
    console.error('[VNPay Webhook] Unexpected error:', error)
    return NextResponse.json(
      { RspCode: '99', Message: 'Unknown Error' },
      { status: 200 }, // VNPay expects 200 status code
    )
  }
}

/**
 * GET /api/webhooks/vnpay
 *
 * VNPay sometimes sends IPN via GET request.
 * We delegate to the same POST handler logic.
 */
export async function GET(req: NextRequest) {
  return POST(req)
}
