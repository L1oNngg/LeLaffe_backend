// ================================================================
// DOMAIN TYPES — Cart (Server-side)
// ================================================================

/** Single item in a cart — includes product details for stock validation */
export interface CartItemDto {
  id: string
  productId: string
  productName: string
  productSlug: string
  price: string           // Decimal → string for JSON safety
  quantity: number
  stock: number           // Current stock — for client-side "out of stock" UI
  addedAt: string         // ISO timestamp
}

/** Full cart response returned to the authenticated user */
export interface CartDto {
  id: string
  userId: string
  items: CartItemDto[]
  totalItems: number      // Sum of all quantities
  totalAmount: string     // Sum of price * quantity — for display only
  updatedAt: string       // ISO timestamp
}
