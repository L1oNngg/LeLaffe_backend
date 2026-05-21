import { db } from '@/infrastructure/database/db'
import {
  findOrCreateCart,
  upsertCartItem,
} from '@/infrastructure/repositories/cart-repository'
import {
  CartProductUnavailableError,
  CartInsufficientStockError,
  CartDatabaseError,
} from '@/domain/errors/cart-errors'
import type { CartItemDto } from '@/domain/types/cart'

// ================================================================
// USE CASE: Add Item to Cart (Upsert)
//
// Business Rules:
//   1. Product MUST exist AND be published (is_published = true)
//   2. Quantity added must NOT exceed available stock
//   3. If product already in cart → increment quantity (not replace)
//   4. Combined quantity (existing + new) must NOT exceed stock
//
// Stock Validation Note:
//   This is a "soft check" — the actual stock deduction happens
//   atomically during Checkout (BR-06). But we validate here to
//   provide immediate UX feedback and prevent obviously invalid carts.
// ================================================================

export interface AddCartItemPayload {
  userId: string
  productId: string
  quantity: number
}

export async function addCartItem(
  payload: AddCartItemPayload,
): Promise<CartItemDto> {
  const { userId, productId, quantity } = payload

  try {
    // ── 1. Validate product exists and is purchasable ──────────────
    const product = await db.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        slug: true,
        price: true,
        stock: true,
        is_published: true,
      },
    })

    if (!product || !product.is_published) {
      throw new CartProductUnavailableError(productId)
    }

    // ── 2. Get or create cart ─────────────────────────────────────
    const cart = await findOrCreateCart(userId)

    // ── 3. Check existing quantity in cart (if any) ───────────────
    const existingItem = cart.items.find(
      (item) => item.product_id === productId,
    )
    const currentQty = existingItem ? existingItem.quantity : 0
    const totalQtyAfterAdd = currentQty + quantity

    // ── 4. Validate stock sufficiency ────────────────────────────
    if (totalQtyAfterAdd > product.stock) {
      throw new CartInsufficientStockError(
        productId,
        totalQtyAfterAdd,
        product.stock,
      )
    }

    // ── 5. Upsert cart item (atomic: create or increment) ────────
    const cartItem = await upsertCartItem(cart.id, productId, quantity)

    return {
      id: cartItem.id,
      productId: cartItem.product.id,
      productName: cartItem.product.name,
      productSlug: cartItem.product.slug,
      price: cartItem.product.price.toString(),
      quantity: cartItem.quantity,
      stock: cartItem.product.stock,
      addedAt: cartItem.added_at.toISOString(),
    }
  } catch (error) {
    // Re-throw known domain errors
    if (
      error instanceof CartProductUnavailableError ||
      error instanceof CartInsufficientStockError
    ) {
      throw error
    }

    throw new CartDatabaseError(
      error instanceof Error ? error.message : 'Unknown cart error',
    )
  }
}
