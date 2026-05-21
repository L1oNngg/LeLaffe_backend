import { db } from '@/infrastructure/database/db'
import type { Prisma } from '@prisma/client'

/**
 * Cart Repository — Infrastructure Layer
 *
 * Rule (nextjs-backend.md → DIP):
 * Use-cases call repository functions instead of
 * importing PrismaClient directly.
 *
 * Rule (nextjs-backend.md → Avoid N+1 Queries):
 * Always use `include` or `select` to fetch related data in a single DB trip.
 */

/**
 * Prisma Include Definition — Cart with items + product details
 * Used for GET /api/cart to return product info (name, price, stock)
 */
const cartWithItemsInclude = {
  items: {
    include: {
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          price: true,
          stock: true,
          is_published: true,
        },
      },
    },
    orderBy: {
      added_at: 'desc',
    } as Prisma.CartItemOrderByWithRelationInput,
  },
} satisfies Prisma.CartInclude

/**
 * Inferred full cart type from Prisma (with relations)
 */
export type CartWithItems = Prisma.CartGetPayload<{
  include: typeof cartWithItemsInclude
}>

/**
 * Find or Create the cart for a user.
 * If user has no cart yet, creates an empty one.
 *
 * Uses upsert to handle race conditions atomically —
 * two concurrent GET /api/cart calls won't create duplicate carts
 * thanks to the @@unique([user_id]) constraint.
 */
export async function findOrCreateCart(userId: string): Promise<CartWithItems> {
  return db.cart.upsert({
    where: { user_id: userId },
    create: { user_id: userId },
    update: {},                    // No-op update — just return existing
    include: cartWithItemsInclude,
  })
}

/**
 * Find a cart by userId. Returns null if not found.
 */
export async function findCartByUserId(userId: string) {
  return db.cart.findUnique({
    where: { user_id: userId },
    select: { id: true },
  })
}

/**
 * Add item to cart using Upsert logic.
 * - If product NOT in cart → create new CartItem with given quantity
 * - If product ALREADY in cart → increment quantity by given amount
 *
 * The @@unique([cart_id, product_id]) constraint makes this atomic.
 */
export async function upsertCartItem(
  cartId: string,
  productId: string,
  quantity: number,
) {
  return db.cartItem.upsert({
    where: {
      cart_id_product_id: { cart_id: cartId, product_id: productId },
    },
    create: {
      cart_id: cartId,
      product_id: productId,
      quantity,
    },
    update: {
      quantity: { increment: quantity },
    },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          price: true,
          stock: true,
        },
      },
    },
  })
}

/**
 * Find a CartItem by its ID.
 * Includes the cart relation to verify ownership.
 */
export async function findCartItemById(itemId: string) {
  return db.cartItem.findUnique({
    where: { id: itemId },
    include: {
      cart: {
        select: { user_id: true },
      },
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          price: true,
          stock: true,
        },
      },
    },
  })
}

/**
 * Update the quantity of a specific CartItem.
 */
export async function updateCartItemQuantity(itemId: string, quantity: number) {
  return db.cartItem.update({
    where: { id: itemId },
    data: { quantity },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          price: true,
          stock: true,
        },
      },
    },
  })
}

/**
 * Delete a specific CartItem.
 */
export async function deleteCartItem(itemId: string) {
  return db.cartItem.delete({
    where: { id: itemId },
  })
}

/**
 * Clear all items from a user's cart.
 * Called after successful checkout to clean up the cart.
 *
 * Uses deleteMany for bulk delete efficiency.
 * Returns the count of deleted items.
 */
export async function clearCartByUserId(userId: string): Promise<number> {
  const cart = await db.cart.findUnique({
    where: { user_id: userId },
    select: { id: true },
  })

  if (!cart) return 0

  const result = await db.cartItem.deleteMany({
    where: { cart_id: cart.id },
  })

  return result.count
}
