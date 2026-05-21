import {
  findCartItemById,
  deleteCartItem as deleteCartItemRepo,
} from '@/infrastructure/repositories/cart-repository'
import {
  CartItemNotFoundError,
  CartDatabaseError,
} from '@/domain/errors/cart-errors'

// ================================================================
// USE CASE: Delete Cart Item
//
// Business Rules:
//   1. CartItem MUST exist AND belong to the authenticated user's cart
//   2. Physical DELETE is acceptable here (cart items are ephemeral,
//      unlike Products which use soft-delete per BR-13)
// ================================================================

export interface DeleteCartItemPayload {
  userId: string
  itemId: string
}

export async function removeCartItem(
  payload: DeleteCartItemPayload,
): Promise<{ deletedItemId: string }> {
  const { userId, itemId } = payload

  try {
    // ── 1. Find cart item and verify ownership ───────────────────
    const cartItem = await findCartItemById(itemId)

    if (!cartItem || cartItem.cart.user_id !== userId) {
      throw new CartItemNotFoundError(itemId)
    }

    // ── 2. Delete the item ───────────────────────────────────────
    await deleteCartItemRepo(itemId)

    return { deletedItemId: itemId }
  } catch (error) {
    // Re-throw known domain errors
    if (error instanceof CartItemNotFoundError) {
      throw error
    }

    throw new CartDatabaseError(
      error instanceof Error ? error.message : 'Unknown cart error',
    )
  }
}
