/**
 * Custom Domain Errors — Authentication
 *
 * Rule (nextjs-backend.md):
 * Each error maps to a specific HTTP status in route.ts.
 * NEVER return raw error messages or DB stack traces to the client.
 */

/** Email already registered → HTTP 409 Conflict */
export class EmailAlreadyExistsError extends Error {
  public readonly email: string

  constructor(email: string) {
    super(`An account with email "${email}" already exists.`)
    this.name = 'EmailAlreadyExistsError'
    this.email = email
  }
}

/** Invalid email or password during signin → HTTP 401 Unauthorized */
export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid email or password.')
    this.name = 'InvalidCredentialsError'
  }
}

/** Missing or invalid refresh token → HTTP 401 Unauthorized */
export class MissingRefreshTokenError extends Error {
  constructor() {
    super('Refresh token is missing.')
    this.name = 'MissingRefreshTokenError'
  }
}

/** Refresh token has expired or is tampered → HTTP 403 Forbidden */
export class InvalidRefreshTokenError extends Error {
  constructor() {
    super('Refresh token is invalid or has expired.')
    this.name = 'InvalidRefreshTokenError'
  }
}

/** Generic auth database failure → HTTP 500 */
export class AuthDatabaseError extends Error {
  constructor(message = 'An error occurred during authentication.') {
    super(message)
    this.name = 'AuthDatabaseError'
  }
}
