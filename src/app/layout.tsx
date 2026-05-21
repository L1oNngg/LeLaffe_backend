import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Imperial Skin | Luxury Skincare Experience',
  description: 'Trải nghiệm dòng sản phẩm chăm sóc da cao cấp với công nghệ hình ảnh 4K và storytelling đắm chìm.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="vi">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
