import type { Role } from '@prisma/client'

// ================================================================
// DOMAIN TYPES — Authentication
// ================================================================

/** Payload passed from route.ts → signup use-case */
export interface SignupPayload {
  email: string
  password: string
  name?: string
}

/** Payload passed from route.ts → signin use-case */
export interface SigninPayload {
  email: string
  password: string
}

/** Public user info returned to the client (never expose password_hash) */
export interface UserPublicDto {
  id: string
  email: string
  role: Role
}

/** Response returned after successful signup */
export interface SignupResultDto {
  user: UserPublicDto
}

/** Response returned after successful signin */
export interface SigninResultDto {
  accessToken: string
  user: UserPublicDto
  /** refreshToken is NOT returned in the body — it's set as HTTP-only Cookie */
}

/** Response returned after successful token refresh */
export interface RefreshResultDto {
  accessToken: string
}

/** JWT payload structure stored inside both access & refresh tokens */
export interface JwtTokenPayload {
  /** User ID (standard JWT "sub" claim) */
  sub: string
  /** User role for RBAC (CUSTOMER | ADMIN) */
  role: Role
}
