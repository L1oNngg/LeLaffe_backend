/**
 * Custom Domain Errors — Orders / Checkout
 *
 * Rule (nextjs-backend.md):
 * Each error maps to a specific HTTP status in route.ts.
 * NEVER return raw error messages or DB stack traces to the client.
 */

/** BR-06: Stock dropped to zero during checkout → HTTP 409 */
export class InsufficientStockError extends Error {
  public readonly productId: string
  public readonly requested: number
  public readonly available: number

  constructor(productId: string, requested: number, available: number) {
    super(
      `Product "${productId}" has insufficient stock. Requested: ${requested}, Available: ${available}`,
    )
    this.name = 'InsufficientStockError'
    this.productId = productId
    this.requested = requested
    this.available = available
  }
}

/** Checkout contains no items → HTTP 400 */
export class EmptyCartError extends Error {
  constructor() {
    super('Checkout cart cannot be empty.')
    this.name = 'EmptyCartError'
  }
}

/** One of the requested products does not exist or is not published → HTTP 400 */
export class ProductUnavailableError extends Error {
  public readonly productId: string

  constructor(productId: string) {
    super(`Product "${productId}" is not available for purchase.`)
    this.name = 'ProductUnavailableError'
    this.productId = productId
  }
}

/** Generic DB failure during checkout → HTTP 500 */
export class CheckoutDatabaseError extends Error {
  constructor(message = 'An error occurred while processing your order.') {
    super(message)
    this.name = 'CheckoutDatabaseError'
  }
}

// ================================================================
// Admin Order Management Errors
// ================================================================

/** Order ID not found in database → HTTP 404 */
export class OrderNotFoundError extends Error {
  public readonly orderId: string

  constructor(orderId: string) {
    super(`Order "${orderId}" not found.`)
    this.name = 'OrderNotFoundError'
    this.orderId = orderId
  }
}

/** Invalid status transition (e.g., CANCELLED → SHIPPED) → HTTP 400 */
export class InvalidOrderStatusTransitionError extends Error {
  constructor(currentStatus: string, targetStatus: string) {
    super(
      `Cannot transition order from "${currentStatus}" to "${targetStatus}".`,
    )
    this.name = 'InvalidOrderStatusTransitionError'
  }
}

