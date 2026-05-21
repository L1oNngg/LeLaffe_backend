import { NextRequest, NextResponse } from 'next/server'
import { getUserProfile } from '@/use-cases/users/user-profile'
import type {
  ApiSuccessResponse,
  ApiErrorResponse,
} from '@/domain/types/product'
import type { UserProfileDto } from '@/domain/types/user'

// Per nextjs-backend.md: force-dynamic for user-specific data
export const dynamic = 'force-dynamic'

/**
 * GET /api/users/me
 *
 * Returns the authenticated user's profile.
 * Auth: Requires valid JWT (middleware.ts injects x-user-id).
 *
 * Security:
 *   - password_hash is NEVER returned (excluded at DB query level)
 *   - userId comes from JWT middleware, not from query/body
 *
 * Rule (nextjs-backend.md → Route Thinness):
 * This file ONLY: extracts userId, calls use-case, returns JSON.
 */
export async function GET(
  req: NextRequest,
): Promise<NextResponse<ApiSuccessResponse<UserProfileDto> | ApiErrorResponse>> {
  try {
    // ── 1. Auth guard (Secured by middleware.ts) ──────────────────
    const userId = req.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json<ApiErrorResponse>(
        { status: 'error', message: 'Authentication required.' },
        { status: 401 },
      )
    }

    // ── 2. Delegate to use-case ──────────────────────────────────
    const profile = await getUserProfile(userId)

    if (!profile) {
      return NextResponse.json<ApiErrorResponse>(
        { status: 'error', message: 'User not found.' },
        { status: 404 },
      )
    }

    return NextResponse.json<ApiSuccessResponse<UserProfileDto>>(
      { status: 'success', data: profile },
      { status: 200 },
    )
  } catch (error) {
    console.error('[GET /api/users/me] Error:', error)
    return NextResponse.json<ApiErrorResponse>(
      { status: 'error', message: 'An internal server error occurred.' },
      { status: 500 },
    )
  }
}
