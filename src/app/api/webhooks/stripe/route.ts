import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/infrastructure/payment/StripeProvider'
import { EmailProvider } from '@/infrastructure/email/EmailProvider'
import { db } from '@/infrastructure/database/db'
import { clearCart } from '@/use-cases/cart/clear-cart'
import Stripe from 'stripe'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!sig || !endpointSecret) {
    return NextResponse.json({ error: 'Missing stripe signature or secret' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, sig, endpointSecret)
  } catch (err: any) {
    console.error(`[Stripe Webhook] Signature verification failed:`, err.message)
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 })
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const orderId = session.metadata?.orderId

      if (!orderId) {
        console.error('[Stripe Webhook] Order ID missing from metadata')
        break
      }

      try {
        // BR-08: Webhook Idempotency (check if already PROCESSING or SHIPPED)
        // Ensure consistency with transaction
        const txResult = await db.$transaction(async (tx) => {
          const order = await tx.order.findUnique({
            where: { id: orderId },
            include: { user: true }
          })

          if (!order) throw new Error('Order not found')

          // Idempotency check
          if (order.status !== 'PENDING') {
            console.log(`[Stripe Webhook] Order ${orderId} is already ${order.status}. Skipping.`)
            return null
          }

          // Update status to PROCESSING
          await tx.order.update({
            where: { id: orderId },
            data: { status: 'PROCESSING' },
          })

          // Send Email Confirmation
          const customerEmail = session.customer_details?.email || order.user.email
          await EmailProvider.sendOrderConfirmation(
            customerEmail,
            orderId,
            Number(order.total_amount)
          )

          return { userId: order.user_id }
        })

        // Clear the user's cart after successful payment
        if (txResult?.userId) {
          await clearCart(txResult.userId)
        }
      } catch (e: any) {
        console.error('[Stripe Webhook - Completed] Error:', e)
        return NextResponse.json({ error: 'Failed to process order update' }, { status: 500 })
      }
      break
    }
    
    // BR-07: Payment Timeout / Fail -> Inventory Recovery
    case 'checkout.session.expired':
    case 'checkout.session.async_payment_failed': {
      const session = event.data.object as Stripe.Checkout.Session
      const orderId = session.metadata?.orderId

      if (!orderId) break

      try {
        await db.$transaction(async (tx) => {
          const order = await tx.order.findUnique({
            where: { id: orderId },
            include: { items: true }
          })

          if (!order) throw new Error('Order not found')

          // Only recover if it's still PENDING. If already CANCELLED, idempotency skips.
          if (order.status !== 'PENDING') {
            console.log(`[Stripe Webhook] Order ${orderId} is not PENDING. Skipping recovery.`)
            return
          }

          // Mark as CANCELLED
          await tx.order.update({
            where: { id: orderId },
            data: { status: 'CANCELLED' },
          })

          // Restore inventory (BR-07)
          for (const item of order.items) {
            await tx.product.update({
              where: { id: item.product_id },
              data: { stock: { increment: item.quantity } },
            })
          }
          console.log(`[Stripe Webhook] Order ${orderId} cancelled. Inventory restored.`)
        })
      } catch (e: any) {
        console.error('[Stripe Webhook - Expired] Error:', e)
        return NextResponse.json({ error: 'Failed to recover inventory' }, { status: 500 })
      }
      break
    }

    default:
      console.log(`[Stripe Webhook] Unhandled event type ${event.type}`)
  }

  return NextResponse.json({ received: true }, { status: 200 })
}
