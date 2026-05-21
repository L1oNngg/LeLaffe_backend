import { Resend } from 'resend'

if (!process.env.RESEND_API_KEY) {
  console.warn('RESEND_API_KEY is missing.')
}

export const resend = new Resend(process.env.RESEND_API_KEY || 're_mocked')

export class EmailProvider {
  static async sendOrderConfirmation(email: string, orderId: string, totalAmount: number): Promise<void> {
    try {
      await resend.emails.send({
        from: 'Imperial Skin <no-reply@resend.dev>', // Use resend.dev for testing without verified domain
        to: [email],
        subject: `[Imperial Skin] Xác nhận đơn hàng - #${orderId.split('-')[0].toUpperCase()}`,
        html: `
          <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: auto; padding: 40px 20px; border: 1px solid #eaeaea; background-color: #fafafa; color: #333;">
            <p style="text-align: center; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #888;">Thông báo thanh toán thành công</p>
            <h1 style="font-weight: 300; text-align: center; font-size: 28px; letter-spacing: 4px; margin-bottom: 30px;">IMPERIAL SKIN</h1>
            <div style="background-color: #fff; padding: 30px; border-radius: 4px; border: 1px solid #eaeaea;">
              <p>Xin chào,</p>
              <p>Cảm ơn bạn đã tin tưởng và lựa chọn sản phẩm từ Imperial Skin.</p>
              <p>Đơn hàng <strong>#${orderId.split('-')[0].toUpperCase()}</strong> đã được thanh toán thành công với tổng số tiền <strong>${totalAmount.toLocaleString('vi-VN')} VND</strong>.</p>
              <p>Chúng tôi đang tiến hành chuẩn bị các sản phẩm tinh túy nhất và sẽ thông báo đến bạn ngay khi đơn hàng được bàn giao cho đơn vị vận chuyển.</p>
            </div>
            <p style="font-size: 12px; color: #888; text-align: center; margin-top: 40px;">© ${new Date().getFullYear()} Imperial Skin Luxury. The Art of Ageless Beauty.</p>
          </div>
        `,
      })
    } catch (error) {
      console.error('[EmailProvider] Failed to send order confirmation:', error)
      // We don't throw here to avoid failing the webhook transaction
    }
  }
}
