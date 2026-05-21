import { hash, compare } from 'bcryptjs'
import {
  findUserByEmail,
  findUserById,
  createUser,
} from '@/infrastructure/repositories/user-repository'
import {
  signAccessToken,
  signRefreshToken,
  verifyToken,
} from '@/infrastructure/services/jwt-service'
import {
  EmailAlreadyExistsError,
  InvalidCredentialsError,
  MissingRefreshTokenError,
  InvalidRefreshTokenError,
  AuthDatabaseError,
} from '@/domain/errors/auth-errors'
import type {
  SignupPayload,
  SigninPayload,
  SignupResultDto,
  SigninResultDto,
  RefreshResultDto,
} from '@/domain/types/auth'

/**
 * Use-Cases — Authentication
 *
 * Rule (nextjs-backend.md → SRP):
 * Each exported function handles one specific business action.
 *
 * Rule (nextjs-backend.md → DIP):
 * Use-cases depend on repository/service abstractions,
 * never on Prisma or jose directly.
 *
 * Security:
 * - bcryptjs with salt rounds = 12 (balances security & speed)
 * - Timing-safe: always hash/compare even for non-existent users
 *   to prevent user enumeration via response time differences.
 */

const BCRYPT_SALT_ROUNDS = 12

// ================================================================
// UC: SIGNUP — Create a new Customer account
// ================================================================
export async function signupUser(
  payload: SignupPayload
): Promise<SignupResultDto> {
  try {
    // 1. Check if email already exists
    const existing = await findUserByEmail(payload.email)
    if (existing) {
      throw new EmailAlreadyExistsError(payload.email)
    }

    // 2. Hash the password (bcryptjs)
    const passwordHash = await hash(payload.password, BCRYPT_SALT_ROUNDS)

    // 3. Persist the user with role CUSTOMER (default)
    const user = await createUser({
      email: payload.email,
      password_hash: passwordHash,
    })

    // 4. Return public user data (never expose password_hash)
    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    }
  } catch (error) {
    if (error instanceof EmailAlreadyExistsError) throw error
    throw new AuthDatabaseError(
      error instanceof Error ? error.message : 'Signup failed'
    )
  }
}

// ================================================================
// UC: SIGNIN — Authenticate and issue tokens
// ================================================================
export async function signinUser(
  payload: SigninPayload
): Promise<{ result: SigninResultDto; refreshToken: string }> {
  try {
    // 1. Find user by email
    const user = await findUserByEmail(payload.email)

    if (!user) {
      // Timing attack mitigation: hash a dummy password
      // so the response time is indistinguishable from a real user
      await hash('dummy-password-for-timing', BCRYPT_SALT_ROUNDS)
      throw new InvalidCredentialsError()
    }

    // 2. Compare password with stored hash
    const isMatch = await compare(payload.password, user.password_hash)
    if (!isMatch) {
      throw new InvalidCredentialsError()
    }

    // 3. Generate tokens
    const tokenPayload = { sub: user.id, role: user.role }
    const accessToken = await signAccessToken(tokenPayload)
    const refreshToken = await signRefreshToken(tokenPayload)

    // 4. Return result (refreshToken is separate — it goes into Cookie)
    return {
      result: {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      },
      refreshToken,
    }
  } catch (error) {
    if (error instanceof InvalidCredentialsError) throw error
    throw new AuthDatabaseError(
      error instanceof Error ? error.message : 'Signin failed'
    )
  }
}

// ================================================================
// UC: REFRESH — Issue a new access token from refresh token
// ================================================================
export async function refreshAccessToken(
  refreshToken: string | undefined
): Promise<RefreshResultDto> {
  // 1. Validate presence of refresh token
  if (!refreshToken) {
    throw new MissingRefreshTokenError()
  }

  try {
    // 2. Verify the refresh token signature and expiry
    const decoded = await verifyToken(refreshToken)

    // 3. Verify the user still exists in the database
    //    (covers scenario where user was deleted/banned after token was issued)
    const user = await findUserById(decoded.sub)
    if (!user) {
      throw new InvalidRefreshTokenError()
    }

    // 4. Issue a fresh access token with the user's CURRENT role
    //    (role may have changed since the refresh token was issued)
    const accessToken = await signAccessToken({
      sub: user.id,
      role: user.role,
    })

    return { accessToken }
  } catch (error) {
    if (
      error instanceof MissingRefreshTokenError ||
      error instanceof InvalidRefreshTokenError
    ) {
      throw error
    }
    // jose throws JWSSignatureVerificationFailed, JWTExpired, etc.
    throw new InvalidRefreshTokenError()
  }
}
