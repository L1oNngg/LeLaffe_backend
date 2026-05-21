import { NextRequest, NextResponse } from 'next/server'
import { refreshAccessToken } from '@/use-cases/auth/authenticate-user'
import {
  MissingRefreshTokenError,
  InvalidRefreshTokenError,
} from '@/domain/errors/auth-errors'
import { REFRESH_TOKEN_COOKIE_OPTIONS } from '@/infrastructure/services/jwt-service'

/**
 * POST /api/auth/refresh
 *
 * Issue a new access token using the refresh token from the HTTP-only Cookie.
 * No request body required — the refresh token is read from the cookie.
 *
 * Happy path:  200 OK       → { status, data: { accessToken } }
 * Unhappy:     401 Unauthorized → Missing refresh token
 *              403 Forbidden    → Invalid or expired refresh token
 *              500 Internal     → Unexpected server error
 */
export async function POST(req: NextRequest) {
  try {
    // Read refresh token from HTTP-only cookie
    const refreshToken = req.cookies.get(REFRESH_TOKEN_COOKIE_OPTIONS.name)?.value

    const result = await refreshAccessToken(refreshToken)

    return NextResponse.json(
      { status: 'success', data: result },
      { status: 200 }
    )
  } catch (error) {
    if (error instanceof MissingRefreshTokenError) {
      return NextResponse.json(
        { status: 'error', message: error.message },
        { status: 401 }
      )
    }

    if (error instanceof InvalidRefreshTokenError) {
      // Clear the invalid cookie so the client doesn't keep sending it
      const response = NextResponse.json(
        { status: 'error', message: error.message },
        { status: 403 }
      )
      const { name, ...cookieOptions } = REFRESH_TOKEN_COOKIE_OPTIONS
      response.cookies.set(name, '', { ...cookieOptions, maxAge: 0 })
      return response
    }

    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 }
    )
  }
}
