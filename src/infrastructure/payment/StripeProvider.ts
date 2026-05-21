import Stripe from 'stripe'

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('STRIPE_SECRET_KEY is missing.')
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mocked', {
  apiVersion: '2026-03-25.dahlia',
})

export interface CheckoutSessionDto {
  orderId: string
  items: Array<{ name: string; price: number; quantity: number }> // price in VND
}

export class StripeProvider {
  static async createCheckoutSession(data: CheckoutSessionDto): Promise<string> {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      client_reference_id: data.orderId,
      line_items: data.items.map((item) => ({
        price_data: {
          currency: 'vnd',
          product_data: {
            name: item.name,
          },
          unit_amount: item.price,
        },
        quantity: item.quantity,
      })),
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/checkout/cancel?order_id=${data.orderId}`,
      metadata: {
        orderId: data.orderId,
      },
      // Expires in 30 minutes (Stripe minimum is 30m, which softly implements our 15m BR-07, ideally we cancel earlier via cron)
      expires_at: Math.floor(Date.now() / 1000) + (30 * 60), 
    })

    if (!session.url) throw new Error('Stripe Session URL is null')
    return session.url
  }
}
