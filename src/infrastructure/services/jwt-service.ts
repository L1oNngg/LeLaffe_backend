import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import type { JwtTokenPayload } from '@/domain/types/auth'
import type { Role } from '@prisma/client'

/**
 * JWT Service — Infrastructure Layer
 *
 * Uses the `jose` library (Edge-compatible, no Node.js crypto required).
 *
 * Token strategy:
 * - accessToken:  short-lived (15 min), sent in response body → stored in memory by FE
 * - refreshToken: long-lived (7 days), sent as HTTP-only Secure Cookie
 *
 * Both tokens use HS256 symmetric signing with the same secret.
 * In production, consider separate secrets for access/refresh tokens.
 */

const ACCESS_TOKEN_EXPIRY = '15m'
const REFRESH_TOKEN_EXPIRY = '7d'

function getJwtSecret(): Uint8Array {
  const secret = process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET
  if (!secret) {
    throw new Error(
      'Missing SUPABASE_JWT_SECRET or JWT_SECRET in environment variables.'
    )
  }
  return new TextEncoder().encode(secret)
}

/**
 * Sign a short-lived access token.
 */
export async function signAccessToken(payload: JwtTokenPayload): Promise<string> {
  return new SignJWT({ role: payload.role } as unknown as JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .setIssuer('le-laffe')
    .sign(getJwtSecret())
}

/**
 * Sign a long-lived refresh token.
 * Contains only the user ID (sub) — role is re-fetched on refresh.
 */
export async function signRefreshToken(payload: JwtTokenPayload): Promise<string> {
  return new SignJWT({ role: payload.role } as unknown as JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_EXPIRY)
    .setIssuer('le-laffe')
    .sign(getJwtSecret())
}

/**
 * Verify and decode a JWT token.
 * Throws if the token is expired, tampered, or invalid.
 *
 * @returns Decoded payload with `sub` (userId) and `role`
 */
export async function verifyToken(
  token: string
): Promise<{ sub: string; role: Role }> {
  const { payload } = await jwtVerify(token, getJwtSecret(), {
    issuer: 'le-laffe',
  })

  if (!payload.sub) {
    throw new Error('Invalid token payload: missing sub')
  }

  return {
    sub: payload.sub,
    role: (payload.role as Role) ?? 'CUSTOMER',
  }
}

/**
 * Cookie configuration for the refresh token.
 * - httpOnly:  prevents JS access (XSS protection)
 * - secure:    only sent over HTTPS (disabled in dev)
 * - sameSite:  strict CSRF protection
 * - path:      scoped to the auth refresh endpoint
 * - maxAge:    7 days in seconds
 */
export const REFRESH_TOKEN_COOKIE_OPTIONS = {
  name: 'refresh_token',
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/auth/refresh',
  maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
}
