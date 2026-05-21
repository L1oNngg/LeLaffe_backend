import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { SigninBodySchema } from '@/domain/schemas/auth.schema'
import { signinUser } from '@/use-cases/auth/authenticate-user'
import { InvalidCredentialsError } from '@/domain/errors/auth-errors'
import { REFRESH_TOKEN_COOKIE_OPTIONS } from '@/infrastructure/services/jwt-service'

/**
 * POST /api/auth/signin
 *
 * Authenticate user and issue tokens.
 * accessToken → returned in response body (FE stores in memory)
 * refreshToken → set as HTTP-only Secure Cookie (XSS-safe)
 *
 * Happy path:  200 OK      → { status, data: { accessToken, user } }
 * Unhappy:     400 Bad Request  → Zod validation error
 *              401 Unauthorized → Invalid email or password
 *              500 Internal     → Unexpected database error
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = SigninBodySchema.parse(body)

    const { result, refreshToken } = await signinUser({
      email: parsed.email,
      password: parsed.password,
    })

    // Build the response with the access token in the body
    const response = NextResponse.json(
      { status: 'success', data: result },
      { status: 200 }
    )

    // Set refresh token as HTTP-only cookie
    const { name, ...cookieOptions } = REFRESH_TOKEN_COOKIE_OPTIONS
    response.cookies.set(name, refreshToken, cookieOptions)

    return response
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Validation failed',
          errors: error.issues,
        },
        { status: 400 }
      )
    }

    if (error instanceof InvalidCredentialsError) {
      return NextResponse.json(
        { status: 'error', message: error.message },
        { status: 401 }
      )
    }

    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 }
    )
  }
}
