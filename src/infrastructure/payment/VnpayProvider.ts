import crypto from 'crypto'

// ================================================================
// VNPAY PAYMENT PROVIDER — Infrastructure Layer
//
// Implements the VNPay payment gateway integration using the
// official VNPay Sandbox/Production specifications.
//
// Key security features:
//   - HMAC-SHA512 signature generation (VNPay standard)
//   - Parameters are sorted alphabetically before hashing
//   - All monetary amounts are in VND (no decimal)
//   - Signature validation on IPN callback
//
// Architecture (nextjs-backend.md):
//   This file belongs in src/infrastructure/payment/ alongside
//   StripeProvider.ts. It encapsulates all VNPay-specific logic
//   so the use-case layer remains gateway-agnostic.
// ================================================================

// ── Environment validation ────────────────────────────────────────
const VNPAY_TMN_CODE = process.env.VNPAY_TMN_CODE || ''
const VNPAY_HASH_SECRET = process.env.VNPAY_HASH_SECRET || ''
const VNPAY_URL = process.env.VNPAY_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'
const VNPAY_RETURN_URL = process.env.VNPAY_RETURN_URL || 'http://localhost:3000/checkout/vnpay-return'

if (!VNPAY_TMN_CODE || !VNPAY_HASH_SECRET) {
  console.warn('[VnpayProvider] VNPAY_TMN_CODE or VNPAY_HASH_SECRET is missing from .env')
}

// ── Types ─────────────────────────────────────────────────────────

export interface VnpayCreateUrlDto {
  orderId: string
  totalAmount: number      // In VND (integer, no decimal)
  orderDescription?: string
  ipAddress: string        // Client IP for VNPay audit trail
}

export interface VnpayIpnPayload {
  [key: string]: string
}

// ── Provider ──────────────────────────────────────────────────────

export class VnpayProvider {
  /**
   * Creates a VNPay payment URL.
   *
   * Algorithm:
   *   1. Build required params (vnp_TmnCode, vnp_Amount, vnp_TxnRef, etc.)
   *   2. Sort all params alphabetically by key name
   *   3. Build query string from sorted params
   *   4. Compute HMAC-SHA512 of the sorted query string using VNPAY_HASH_SECRET
   *   5. Append vnp_SecureHash to the final URL
   *
   * Note: vnp_Amount must be multiplied by 100 per VNPay specification
   * (e.g., 980,000 VND → 98000000)
   */
  static createPaymentUrl(data: VnpayCreateUrlDto): string {
    const createDate = VnpayProvider.formatDate(new Date())

    // Expire in 15 minutes (aligns with BR-07: 15-minute payment window)
    const expireDate = VnpayProvider.formatDate(
      new Date(Date.now() + 15 * 60 * 1000)
    )

    const params: Record<string, string> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: VNPAY_TMN_CODE,
      vnp_Locale: 'vn',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: data.orderId,
      vnp_OrderInfo: data.orderDescription || `Thanh toan don hang ${data.orderId}`,
      vnp_OrderType: 'other',
      vnp_Amount: String(data.totalAmount * 100), // VNPay spec: amount × 100
      vnp_ReturnUrl: VNPAY_RETURN_URL,
      vnp_IpAddr: data.ipAddress,
      vnp_CreateDate: createDate,
      vnp_ExpireDate: expireDate,
    }

    // ── Step 1: Sort params alphabetically ──
    const sortedParams = VnpayProvider.sortParams(params)

    // ── Step 2: Build query string from sorted params ──
    const signData = new URLSearchParams(sortedParams).toString()

    // ── Step 3: HMAC-SHA512 hash ──
    const secureHash = crypto
      .createHmac('sha512', VNPAY_HASH_SECRET)
      .update(signData)
      .digest('hex')

    // ── Step 4: Build final URL ──
    return `${VNPAY_URL}?${signData}&vnp_SecureHash=${secureHash}`
  }

  /**
   * Validates the VNPay IPN (Instant Payment Notification) signature.
   *
   * Algorithm:
   *   1. Extract vnp_SecureHash from the incoming params
   *   2. Remove vnp_SecureHash and vnp_SecureHashType from the param set
   *   3. Sort remaining params alphabetically
   *   4. Build query string from sorted params
   *   5. Compute HMAC-SHA512 using VNPAY_HASH_SECRET
   *   6. Compare computed hash with received vnp_SecureHash (timing-safe)
   *
   * @returns true if signature is valid, false otherwise
   */
  static validateSignature(params: VnpayIpnPayload): boolean {
    const receivedHash = params['vnp_SecureHash']
    if (!receivedHash) return false

    // Clone and remove hash fields before re-computing
    const verifyParams = { ...params }
    delete verifyParams['vnp_SecureHash']
    delete verifyParams['vnp_SecureHashType']

    // Sort and build query string
    const sortedParams = VnpayProvider.sortParams(verifyParams)
    const signData = new URLSearchParams(sortedParams).toString()

    // Compute expected hash
    const expectedHash = crypto
      .createHmac('sha512', VNPAY_HASH_SECRET)
      .update(signData)
      .digest('hex')

    // Timing-safe comparison to prevent timing attacks
    try {
      return crypto.timingSafeEqual(
        Buffer.from(receivedHash, 'hex'),
        Buffer.from(expectedHash, 'hex'),
      )
    } catch {
      // Buffer length mismatch = invalid hash
      return false
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────

  /**
   * Sorts params alphabetically by key — required by VNPay spec.
   * Ensures deterministic hash computation regardless of param order.
   */
  private static sortParams(
    params: Record<string, string>,
  ): Record<string, string> {
    const sorted: Record<string, string> = {}
    const keys = Object.keys(params).sort()
    for (const key of keys) {
      // Only include params that have non-empty values
      if (params[key] !== '' && params[key] !== undefined && params[key] !== null) {
        sorted[key] = params[key]
      }
    }
    return sorted
  }

  /**
   * Formats a Date to VNPay's required format: yyyyMMddHHmmss
   * Example: 2026-05-18 12:30:45 → '20260518123045'
   */
  private static formatDate(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0')
    return (
      `${date.getFullYear()}` +
      `${pad(date.getMonth() + 1)}` +
      `${pad(date.getDate())}` +
      `${pad(date.getHours())}` +
      `${pad(date.getMinutes())}` +
      `${pad(date.getSeconds())}`
    )
  }
}
