import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { SignupBodySchema } from '@/domain/schemas/auth.schema'
import { signupUser } from '@/use-cases/auth/authenticate-user'
import { EmailAlreadyExistsError } from '@/domain/errors/auth-errors'

/**
 * POST /api/auth/signup
 *
 * Create a new Customer account.
 * No authentication required (public endpoint).
 *
 * Happy path:  201 Created  → { status, data: { user } }
 * Unhappy:     400 Bad Request  → Zod validation error
 *              409 Conflict     → Email already exists
 *              500 Internal     → Unexpected database error
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = SignupBodySchema.parse(body)

    const result = await signupUser({
      email: parsed.email,
      password: parsed.password,
      name: parsed.name,
    })

    return NextResponse.json(
      { status: 'success', data: result },
      { status: 201 }
    )
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

    if (error instanceof EmailAlreadyExistsError) {
      return NextResponse.json(
        { status: 'error', message: error.message },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 }
    )
  }
}
