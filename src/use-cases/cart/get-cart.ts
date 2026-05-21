import { Prisma } from '@prisma/client'
import {
  findOrCreateCart,
  type CartWithItems,
} from '@/infrastructure/repositories/cart-repository'
import type { CartDto, CartItemDto } from '@/domain/types/cart'

// ================================================================
// USE CASE: Get Cart
//
// Returns the user's current cart with all items and product details.
// If user doesn't have a cart yet, one is auto-created (empty).
//
// Business Logic:
//   - Stock is included so the Frontend can show "out of stock" indicators
//   - Total is calculated server-side from DB prices (not client prices)
//   - Only published products' data is returned
// ================================================================

/**
 * Map Prisma CartWithItems to the domain CartDto.
 * Centralised mapper ensures consistent response shape.
 */
function mapCartToDto(cart: CartWithItems): CartDto {
  let totalItems = 0
  let totalAmount = new Prisma.Decimal(0)

  const items: CartItemDto[] = cart.items.map((item) => {
    totalItems += item.quantity
    const lineTotal = item.product.price.mul(item.quantity)
    totalAmount = totalAmount.add(lineTotal)

    return {
      id: item.id,
      productId: item.product.id,
      productName: item.product.name,
      productSlug: item.product.slug,
      price: item.product.price.toString(),
      quantity: item.quantity,
      stock: item.product.stock,
      addedAt: item.added_at.toISOString(),
    }
  })

  return {
    id: cart.id,
    userId: cart.user_id,
    items,
    totalItems,
    totalAmount: totalAmount.toString(),
    updatedAt: cart.updated_at.toISOString(),
  }
}

export async function getCart(userId: string): Promise<CartDto> {
  const cart = await findOrCreateCart(userId)
  return mapCartToDto(cart)
}
