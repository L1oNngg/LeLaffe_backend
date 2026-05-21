import { Prisma } from '@prisma/client'
import { db } from '@/infrastructure/database/db'
import {
  CheckoutDatabaseError,
  EmptyCartError,
  InsufficientStockError,
  ProductUnavailableError,
} from '@/domain/errors/order-errors'
import type { CheckoutPayload, CheckoutResultDto } from '@/domain/types/order'
import { StripeProvider } from '@/infrastructure/payment/StripeProvider'
import { VnpayProvider } from '@/infrastructure/payment/VnpayProvider'
import { MomoProvider } from '@/infrastructure/payment/MomoProvider'

// ================================================================
// USE CASE: Process Checkout (Multi-Gateway)
//
// Business Rules enforced here:
//   BR-06 — Bắt buộc dùng Database Transaction. Báo lỗi 409 Rollback
//            nếu kho rớt xuống âm.
//   BR-07 — Đơn hàng PENDING giam kho tối đa 15 phút (implemented via
//            a created_at timestamp the scheduler checks — see note).
//   BR-09 — Tuyệt đối không dùng giá Client gửi lên. Phải tự query
//            price từ DB tại giây thanh toán.
//
// Supported Payment Gateways:
//   - STRIPE: International credit/debit cards
//   - VNPAY:  Vietnamese domestic banking (ATM, QR, etc.)
//   - MOMO:   MoMo e-wallet (placeholder, same pattern)
//
// OCP Compliance (nextjs-backend.md):
//   Adding a new gateway only requires:
//   1. Create src/infrastructure/payment/NewProvider.ts
//   2. Add a new case in createPaymentUrl() below
//   No changes to the transaction logic or core flow.
//
// ── Race Condition Analysis ──────────────────────────────────────
//
// PROBLEM: Two users (U1, U2) check out the same product simultaneously:
//   T1: U1 reads stock = 1, decides to buy
//   T2: U2 reads stock = 1, decides to buy
//   T3: U1 writes stock = 0  ✓
//   T4: U2 writes stock = -1 ← OVERSELL BUG
//
// SOLUTION (implemented below — Optimistic Concurrency Control):
//
//   Step 1: READ the product inside the transaction with the current stock.
//   Step 2: CHECK stock sufficiency in application logic.
//   Step 3: UPDATE with a WHERE clause that re-validates stock atomically:
//             WHERE id = $productId AND stock >= $requestedQty
//           If 0 rows updated → another transaction won already → throw.
//
//   This is safer than a naive "update stock = stock - qty" without guard
//   because the WHERE guard makes the update atomic and self-validating.
//
//   For the highest-traffic scenario, PostgreSQL advisory locks or
//   SELECT FOR UPDATE can be added as a pessimistic locking layer.
//
// ── Why NOT SELECT FOR UPDATE here? ─────────────────────────────
//   SELECT FOR UPDATE (pessimistic) is safer under extreme concurrency
//   but reduces throughput due to row-level locks. For a luxury e-commerce
//   with limited concurrent checkouts, Optimistic CC (with atomic WHERE)
//   provides adequate safety without lock contention. Upgrade path exists.
//
// ================================================================

export async function processCheckout(
  payload: CheckoutPayload,
): Promise<CheckoutResultDto> {
  const { userId, items, paymentMethod } = payload

  // Guard: Empty cart (belt-and-suspenders; Zod also catches this)
  if (!items || items.length === 0) {
    throw new EmptyCartError()
  }

  try {
    // ── ATOMIC TRANSACTION ───────────────────────────────────────
    // All operations below are single DB transaction.
    // If ANY step fails → full rollback, stock is never corrupted.
    const order = await db.$transaction(async (tx) => {
      // ── Step 1: Fetch all products from DB (BR-09: SERVER-SIDE PRICE) ──
      // We query price HERE, inside the transaction, at the exact moment of
      // purchase. The client's price is completely ignored — it is not even
      // received by this use-case (see Zod schema: price is not in the body).
      const productIds = items.map((i) => i.productId)

      const products = await tx.product.findMany({
        where: {
          id: { in: productIds },
          is_published: true,           // Guard: only purchasable products
        },
        select: {
          id: true,
          name: true,
          price: true,                  // ← DB price, not client price (BR-09)
          stock: true,
        },
      })

      // ── Step 2: Validate each item ────────────────────────────────
      for (const item of items) {
        const product = products.find((p) => p.id === item.productId)

        // Product not found or not published
        if (!product) {
          throw new ProductUnavailableError(item.productId)
        }

        // Preliminary stock check (optimistic pre-check before the atomic update)
        if (product.stock < item.quantity) {
          throw new InsufficientStockError(
            item.productId,
            item.quantity,
            product.stock,
          )
        }
      }

      // ── Step 3: Deduct stock with atomic WHERE guard (BR-06) ─────────
      // Each UPDATE's WHERE clause re-validates stock at the DB level.
      // If stock was consumed by another transaction between Step 2 and now,
      // the update affects 0 rows → we detect it and throw InsufficientStockError.
      for (const item of items) {
        const updated = await tx.product.updateMany({
          where: {
            id: item.productId,
            stock: { gte: item.quantity }, // ← ATOMIC GUARD: fail if stock < qty
          },
          data: {
            stock: { decrement: item.quantity },
          },
        })

        // 0 rows updated means another transaction won the race → rollback
        if (updated.count === 0) {
          const product = products.find((p) => p.id === item.productId)!
          throw new InsufficientStockError(item.productId, item.quantity, product.stock)
        }
      }

      // ── Step 4: Calculate total from DB prices (BR-09) ────────────
      let totalAmount = new Prisma.Decimal(0)
      for (const item of items) {
        const product = products.find((p) => p.id === item.productId)!
        totalAmount = totalAmount.add(product.price.mul(item.quantity))
      }

      // ── Step 5: Create Order (PENDING) with payment_method ────────
      // BR-07: Status starts as PENDING. The scheduler (not implemented
      // in this sprint) monitors created_at and cancels after 15 minutes
      // if payment is not completed. Stock is restored on cancellation.
      const newOrder = await tx.order.create({
        data: {
          user_id: userId,
          status: 'PENDING',
          payment_method: paymentMethod,
          total_amount: totalAmount,
          items: {
            create: items.map((item) => {
              const product = products.find((p) => p.id === item.productId)!
              return {
                product_id: item.productId,
                quantity: item.quantity,
                price_at_purchase: product.price, // ← DB price snapshot (BR-09)
              }
            }),
          },
        },
        include: { items: true },
      })

      return { newOrder, products }
    }) // ── END TRANSACTION ─────────────────────────────────────────

    // ── Step 6: Create Payment URL via selected gateway ──────────
    const checkoutUrl = await createPaymentUrl({
      paymentMethod,
      orderId: order.newOrder.id,
      totalAmount: Number(order.newOrder.total_amount),
      products: order.products,
      orderItems: order.newOrder.items,
      ipAddress: payload.ipAddress || '127.0.0.1',
    })

    return {
      orderId: order.newOrder.id,
      status: order.newOrder.status,
      total: order.newOrder.total_amount.toString(),
      itemCount: order.newOrder.items.length,
      createdAt: order.newOrder.created_at.toISOString(),
      checkoutUrl,
      paymentMethod: order.newOrder.payment_method,
    }
  } catch (error) {
    // Re-throw known domain errors so route.ts can map to correct HTTP code
    if (
      error instanceof InsufficientStockError ||
      error instanceof ProductUnavailableError ||
      error instanceof EmptyCartError
    ) {
      throw error
    }

    // Wrap unknown/DB errors
    throw new CheckoutDatabaseError(
      error instanceof Error ? error.message : 'Unknown checkout error',
    )
  }
}

// ================================================================
// PAYMENT URL FACTORY (Strategy Pattern — OCP compliant)
//
// Each gateway receives the same inputs and returns a checkout URL.
// To add MoMo: implement MomoProvider.ts → add 'MOMO' case here.
// ================================================================

interface CreatePaymentUrlParams {
  paymentMethod: string
  orderId: string
  totalAmount: number
  products: Array<{ id: string; name: string }>
  orderItems: Array<{ product_id: string; quantity: number; price_at_purchase: any }>
  ipAddress: string
}

async function createPaymentUrl(params: CreatePaymentUrlParams): Promise<string> {
  const { paymentMethod, orderId, totalAmount, products, orderItems, ipAddress } = params

  switch (paymentMethod) {
    case 'STRIPE': {
      return StripeProvider.createCheckoutSession({
        orderId,
        items: orderItems.map((item) => {
          const product = products.find((p) => p.id === item.product_id)!
          return {
            name: product.name,
            price: Number(item.price_at_purchase),
            quantity: item.quantity,
          }
        }),
      })
    }

    case 'VNPAY': {
      return VnpayProvider.createPaymentUrl({
        orderId,
        totalAmount: Math.round(totalAmount), // VND has no decimal
        orderDescription: `Imperial Skin - Don hang ${orderId.split('-')[0].toUpperCase()}`,
        ipAddress,
      })
    }

    case 'MOMO': {
      const momoResult = await MomoProvider.createPayment({
        orderId,
        totalAmount: Math.round(totalAmount), // VND has no decimal
        orderDescription: `Imperial Skin - Don hang ${orderId.split('-')[0].toUpperCase()}`,
      })
      return momoResult.payUrl
    }

    default:
      throw new Error(`Unsupported payment method: ${paymentMethod}`)
  }
}

