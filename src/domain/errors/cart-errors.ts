/**
 * Custom Domain Errors — Cart
 *
 * Rule (nextjs-backend.md):
 * Each error maps to a specific HTTP status in route.ts.
 * NEVER return raw error messages or DB stack traces to the client.
 */

/** Product not found or not published → HTTP 400 */
export class CartProductUnavailableError extends Error {
  public readonly productId: string

  constructor(productId: string) {
    super(`Product "${productId}" is not available.`)
    this.name = 'CartProductUnavailableError'
    this.productId = productId
  }
}

/** Requested quantity exceeds available stock → HTTP 409 */
export class CartInsufficientStockError extends Error {
  public readonly productId: string
  public readonly requested: number
  public readonly available: number

  constructor(productId: string, requested: number, available: number) {
    super(
      `Product "${productId}" has insufficient stock. Requested: ${requested}, Available: ${available}`,
    )
    this.name = 'CartInsufficientStockError'
    this.productId = productId
    this.requested = requested
    this.available = available
  }
}

/** CartItem not found (wrong ID or doesn't belong to user's cart) → HTTP 404 */
export class CartItemNotFoundError extends Error {
  public readonly itemId: string

  constructor(itemId: string) {
    super(`Cart item "${itemId}" not found.`)
    this.name = 'CartItemNotFoundError'
    this.itemId = itemId
  }
}

/** Generic DB failure during cart operation → HTTP 500 */
export class CartDatabaseError extends Error {
  constructor(message = 'An error occurred while processing your cart.') {
    super(message)
    this.name = 'CartDatabaseError'
  }
}
