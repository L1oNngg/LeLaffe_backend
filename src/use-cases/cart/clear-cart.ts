import { clearCartByUserId } from '@/infrastructure/repositories/cart-repository'

// ================================================================
// USE CASE: Clear Cart (Post-Checkout)
//
// Called AFTER successful payment to clean up all cart items.
// This is a helper function, not an API endpoint — invoked by
// the checkout/webhook flow after order status moves to PROCESSING.
//
// Design Decision:
//   Cart itself (the "shell") is preserved — only items are deleted.
//   This avoids re-creating the cart entity on the next visit.
// ================================================================

export async function clearCart(userId: string): Promise<number> {
  return clearCartByUserId(userId)
}
