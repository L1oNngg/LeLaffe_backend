import { db } from '@/infrastructure/database/db'
import {
  findCartItemById,
  updateCartItemQuantity,
} from '@/infrastructure/repositories/cart-repository'
import {
  CartItemNotFoundError,
  CartInsufficientStockError,
  CartDatabaseError,
} from '@/domain/errors/cart-errors'
import type { CartItemDto } from '@/domain/types/cart'

// ================================================================
// USE CASE: Update Cart Item Quantity
//
// Business Rules:
//   1. CartItem MUST exist AND belong to the authenticated user's cart
//   2. New quantity must NOT exceed product's current stock
//   3. Quantity replaces (not increments) — this is an absolute SET
// ================================================================

export interface UpdateCartItemPayload {
  userId: string
  itemId: string
  quantity: number
}

export async function updateCartItem(
  payload: UpdateCartItemPayload,
): Promise<CartItemDto> {
  const { userId, itemId, quantity } = payload

  try {
    // ── 1. Find cart item and verify ownership ───────────────────
    const cartItem = await findCartItemById(itemId)

    if (!cartItem || cartItem.cart.user_id !== userId) {
      throw new CartItemNotFoundError(itemId)
    }

    // ── 2. Validate stock sufficiency ────────────────────────────
    if (quantity > cartItem.product.stock) {
      throw new CartInsufficientStockError(
        cartItem.product.id,
        quantity,
        cartItem.product.stock,
      )
    }

    // ── 3. Update quantity ───────────────────────────────────────
    const updated = await updateCartItemQuantity(itemId, quantity)

    return {
      id: updated.id,
      productId: updated.product.id,
      productName: updated.product.name,
      productSlug: updated.product.slug,
      price: updated.product.price.toString(),
      quantity: updated.quantity,
      stock: updated.product.stock,
      addedAt: updated.added_at.toISOString(),
    }
  } catch (error) {
    // Re-throw known domain errors
    if (
      error instanceof CartItemNotFoundError ||
      error instanceof CartInsufficientStockError
    ) {
      throw error
    }

    throw new CartDatabaseError(
      error instanceof Error ? error.message : 'Unknown cart error',
    )
  }
}
