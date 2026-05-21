import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

// In-memory rate limiter per V8 isolate (BR-12)
// Limits to 5 requests / hour / IP
const ipRateLimitMap = new Map<string, { count: number; resetTime: number }>()
const RATE_LIMIT_WINDOW = 60 * 60 * 1000 // 1 hour
const RATE_LIMIT_MAX_REQUESTS = 5

export async function middleware(req: NextRequest) {
  const isOrderRoute = req.nextUrl.pathname.startsWith('/api/orders')
  const isAdminRoute = req.nextUrl.pathname.startsWith('/api/admin')
  const isUserRoute = req.nextUrl.pathname.startsWith('/api/users')
  const isCartRoute = req.nextUrl.pathname.startsWith('/api/cart')

  if (!isOrderRoute && !isAdminRoute && !isUserRoute && !isCartRoute) {
    return NextResponse.next()
  }

  // ── 1. RATE LIMITING (BR-12) - Only for orders ──
  if (isOrderRoute) {
    const ip = req.ip || req.headers.get('x-forwarded-for') || 'unknown'
    const now = Date.now()
    const record = ipRateLimitMap.get(ip)

    if (record) {
      if (now > record.resetTime) {
        // Reset window
        ipRateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW })
      } else {
        if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
          return NextResponse.json(
            { status: 'error', message: 'Too many requests. Limit: 5 per hour.' },
            { status: 429 }
          )
        }
        record.count += 1
        ipRateLimitMap.set(ip, record)
      }
    } else {
      ipRateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW })
    }
  }

  // ── 2. AUTHENTICATION & JWT VERIFICATION ──
  const authHeader = req.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { status: 'error', message: 'Authentication required. Missing Bearer token.' },
      { status: 401 }
    )
  }

  const token = authHeader.split(' ')[1]
  const secret = process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET

  if (!secret) {
    console.error('Missing SUPABASE_JWT_SECRET or JWT_SECRET inside .env')
    return NextResponse.json(
      { status: 'error', message: 'Server configuration error.' },
      { status: 500 }
    )
  }

  try {
    const encoder = new TextEncoder()
    const { payload } = await jwtVerify(token, encoder.encode(secret))

    const userId = payload.sub
    if (!userId) {
      throw new Error('Invalid token payload: missing sub')
    }

    // Pass the actual userId securely to the Next.js route
    const requestHeaders = new Headers(req.headers)
    requestHeaders.set('x-user-id', userId)
    
    // Pass role if it exists in metadata (for Supabase JWT)
    if (payload.role) {
      requestHeaders.set('x-user-role', payload.role as string)
    }

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: 'Invalid or expired token.' },
      { status: 401 }
    )
  }
}

export const config = {
  matcher: ['/api/orders/:path*', '/api/admin/:path*', '/api/users/:path*', '/api/cart/:path*'],
}
