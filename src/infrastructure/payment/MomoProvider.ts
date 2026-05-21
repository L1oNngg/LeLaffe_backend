import crypto from 'crypto'

// ================================================================
// MOMO PAYMENT PROVIDER — Infrastructure Layer
//
// Implements the MoMo e-wallet payment gateway integration using
// the official MoMo API v2 (Sandbox/Production).
//
// Key security features:
//   - HMAC-SHA256 signature generation (MoMo standard)
//   - Raw string fields are concatenated alphabetically before hashing
//   - Unique requestId (UUID) + orderId ([dbId]_[timestamp]) to avoid
//     MoMo's Duplicate OrderId error on retry attempts
//   - Signature validation on IPN callback
//
// Architecture (nextjs-backend.md):
//   This file belongs in src/infrastructure/payment/ alongside
//   StripeProvider.ts and VnpayProvider.ts. It encapsulates all
//   MoMo-specific logic so the use-case layer remains gateway-agnostic.
// ================================================================

// ── Environment validation ────────────────────────────────────────
const MOMO_PARTNER_CODE = process.env.MOMO_PARTNER_CODE || ''
const MOMO_ACCESS_KEY = process.env.MOMO_ACCESS_KEY || ''
const MOMO_SECRET_KEY = process.env.MOMO_SECRET_KEY || ''
const MOMO_API_URL =
  process.env.MOMO_API_URL || 'https://test-payment.momo.vn/v2/gateway/api/create'
const MOMO_REDIRECT_URL =
  process.env.MOMO_REDIRECT_URL || 'http://localhost:3000/checkout/momo-return'
const MOMO_IPN_URL =
  process.env.MOMO_IPN_URL || 'http://localhost:3000/api/webhooks/momo'

if (!MOMO_PARTNER_CODE || !MOMO_ACCESS_KEY || !MOMO_SECRET_KEY) {
  console.warn(
    '[MomoProvider] MOMO_PARTNER_CODE, MOMO_ACCESS_KEY, or MOMO_SECRET_KEY is missing from .env',
  )
}

// ── Types ─────────────────────────────────────────────────────────

export interface MomoCreatePaymentDto {
  orderId: string // DB Order ID (UUID)
  totalAmount: number // In VND (integer, no decimal)
  orderDescription?: string
}

export interface MomoCreatePaymentResult {
  payUrl: string
  momoOrderId: string // The [dbId]_[timestamp] sent to MoMo
}

export interface MomoIpnPayload {
  partnerCode: string
  orderId: string // [dbId]_[timestamp] format from MoMo
  requestId: string
  amount: number
  orderInfo: string
  orderType: string
  transId: number
  resultCode: number
  message: string
  payType: string
  responseTime: number
  extraData: string
  signature: string
}

// ── Provider ──────────────────────────────────────────────────────

export class MomoProvider {
  /**
   * Creates a MoMo payment request by calling their API.
   *
   * Algorithm:
   *   1. Generate a unique requestId (UUID v4) and orderId
   *      with format [dbOrderId]_[timestamp] to prevent MoMo's
   *      "Duplicate OrderId" error when a customer retries payment.
   *   2. Build the raw signature string with fields sorted
   *      alphabetically by field name (MoMo specification):
   *        accessKey=...&amount=...&extraData=...&ipnUrl=...
   *        &orderId=...&orderInfo=...&partnerCode=...
   *        &redirectUrl=...&requestId=...&requestType=captureWallet
   *   3. Compute HMAC-SHA256 of the raw string using MOMO_SECRET_KEY
   *   4. POST the JSON payload to MoMo API
   *   5. Return payUrl for client redirect
   *
   * Note on orderId format:
   *   MoMo rejects duplicate orderId values globally. If a customer
   *   abandons payment and retries, using the raw DB orderId would
   *   cause a Duplicate OrderId error. We append a timestamp suffix:
   *     [dbOrderId]_[timestamp]
   *   The webhook handler strips this suffix to recover the real DB ID.
   */
  static async createPayment(
    data: MomoCreatePaymentDto,
  ): Promise<MomoCreatePaymentResult> {
    const requestId = crypto.randomUUID()
    const momoOrderId = `${data.orderId}_${Date.now()}`
    const amount = String(data.totalAmount)
    const orderInfo =
      data.orderDescription || `Imperial Skin - Don hang ${data.orderId.split('-')[0].toUpperCase()}`
    const extraData = '' // Base64-encoded additional data (empty for now)
    const requestType = 'captureWallet'

    // ── Step 1: Build raw signature string (ALPHABETICAL ORDER) ──
    // MoMo requires fields concatenated in strict alphabetical order
    // by field name, separated by '&', in key=value format.
    const rawSignature =
      `accessKey=${MOMO_ACCESS_KEY}` +
      `&amount=${amount}` +
      `&extraData=${extraData}` +
      `&ipnUrl=${MOMO_IPN_URL}` +
      `&orderId=${momoOrderId}` +
      `&orderInfo=${orderInfo}` +
      `&partnerCode=${MOMO_PARTNER_CODE}` +
      `&redirectUrl=${MOMO_REDIRECT_URL}` +
      `&requestId=${requestId}` +
      `&requestType=${requestType}`

    // ── Step 2: HMAC-SHA256 hash ──
    const signature = crypto
      .createHmac('sha256', MOMO_SECRET_KEY)
      .update(rawSignature)
      .digest('hex')

    // ── Step 3: Build request body ──
    const requestBody = {
      partnerCode: MOMO_PARTNER_CODE,
      partnerName: 'Imperial Skin',
      storeId: MOMO_PARTNER_CODE,
      requestId,
      amount: Number(amount),
      orderId: momoOrderId,
      orderInfo,
      redirectUrl: MOMO_REDIRECT_URL,
      ipnUrl: MOMO_IPN_URL,
      lang: 'vi',
      requestType,
      autoCapture: true,
      extraData,
      signature,
    }

    // ── Step 4: Call MoMo API ──
    const response = await fetch(MOMO_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    })

    const result = await response.json()

    if (result.resultCode !== 0) {
      console.error('[MomoProvider] API error:', {
        resultCode: result.resultCode,
        message: result.message,
        momoOrderId,
      })
      throw new Error(
        `MoMo payment creation failed: ${result.message || 'Unknown error'} (code: ${result.resultCode})`,
      )
    }

    if (!result.payUrl) {
      throw new Error('MoMo API returned success but payUrl is missing.')
    }

    return {
      payUrl: result.payUrl,
      momoOrderId,
    }
  }

  /**
   * Validates the MoMo IPN (Instant Payment Notification) signature.
   *
   * Algorithm:
   *   1. Reconstruct the raw signature string from received fields
   *      in strict alphabetical order
   *   2. Compute HMAC-SHA256 using MOMO_SECRET_KEY
   *   3. Compare computed hash with received signature (timing-safe)
   *
   * Raw string format (alphabetical):
   *   accessKey=...&amount=...&extraData=...&message=...
   *   &orderId=...&orderInfo=...&orderType=...&partnerCode=...
   *   &payType=...&requestId=...&responseTime=...
   *   &resultCode=...&transId=...
   *
   * @returns true if signature is valid, false otherwise
   */
  static validateIpnSignature(payload: MomoIpnPayload): boolean {
    const receivedSignature = payload.signature
    if (!receivedSignature) return false

    // Build raw string in alphabetical order for IPN verification
    const rawSignature =
      `accessKey=${MOMO_ACCESS_KEY}` +
      `&amount=${payload.amount}` +
      `&extraData=${payload.extraData}` +
      `&message=${payload.message}` +
      `&orderId=${payload.orderId}` +
      `&orderInfo=${payload.orderInfo}` +
      `&orderType=${payload.orderType}` +
      `&partnerCode=${payload.partnerCode}` +
      `&payType=${payload.payType}` +
      `&requestId=${payload.requestId}` +
      `&responseTime=${payload.responseTime}` +
      `&resultCode=${payload.resultCode}` +
      `&transId=${payload.transId}`

    const expectedSignature = crypto
      .createHmac('sha256', MOMO_SECRET_KEY)
      .update(rawSignature)
      .digest('hex')

    // Timing-safe comparison to prevent timing attacks
    try {
      return crypto.timingSafeEqual(
        Buffer.from(receivedSignature, 'hex'),
        Buffer.from(expectedSignature, 'hex'),
      )
    } catch {
      // Buffer length mismatch = invalid hash
      return false
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────

  /**
   * Extracts the real DB Order ID from MoMo's orderId format.
   *
   * MoMo orderId format: [dbOrderId]_[timestamp]
   * Example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890_1716048000000"
   *        → "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
   *
   * Why this is needed:
   *   MoMo rejects duplicate orderId values. When customers retry
   *   payment for the same order, we append a timestamp suffix to
   *   create a unique orderId for MoMo. The webhook must strip this
   *   suffix to look up the real order in our database.
   *
   * Parsing strategy:
   *   UUID format is fixed at 36 characters (8-4-4-4-12).
   *   We extract the first 36 characters as the DB order ID,
   *   which is safer than splitting by '_' since UUIDs contain '-'
   *   but never '_'.
   */
  static extractDbOrderId(momoOrderId: string): string {
    // UUID is always 36 chars: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    // Our format: [UUID]_[timestamp]
    // Split by '_' and rejoin all parts except the last (the timestamp)
    const parts = momoOrderId.split('_')

    // The timestamp is the last segment (numeric).
    // UUID parts joined by '-' will never be purely numeric,
    // so the last '_'-delimited purely-numeric segment is the timestamp.
    if (parts.length < 2) {
      // No timestamp suffix — return as-is (fallback safety)
      return momoOrderId
    }

    // Remove the last part (timestamp) and rejoin
    // This handles edge cases where UUID might contain '_' (it doesn't,
    // but this is defensive programming)
    const lastPart = parts[parts.length - 1]

    // Verify the last part is a numeric timestamp
    if (/^\d+$/.test(lastPart)) {
      return parts.slice(0, -1).join('_')
    }

    // If last part isn't numeric, return the full string as-is
    return momoOrderId
  }
}
