import { z } from 'zod'

/**
 * Zod Schemas — Authentication Request Validation
 *
 * Rule (nextjs-backend.md): Validate ALL incoming payloads with Zod.
 * Zod is the single source of truth for TypeScript types (via z.infer).
 *
 * Note: This project uses Zod v4 — use `error` or string param
 * instead of the deprecated `required_error` from Zod v3.
 */

// ----------------------------------------------------------------
// POST /api/auth/signup — Request body schema
// ----------------------------------------------------------------
export const SignupBodySchema = z.object({
  /** Valid email address */
  email: z
    .string('Email is required')
    .email('Invalid email format')
    .max(255, 'Email must be at most 255 characters')
    .transform((v) => v.toLowerCase().trim()),

  /** Password with minimum security requirements */
  password: z
    .string('Password is required')
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one lowercase letter, one uppercase letter, and one digit'
    ),

  /** Optional display name */
  name: z
    .string()
    .min(1, 'Name cannot be empty')
    .max(100, 'Name must be at most 100 characters')
    .optional(),
})

export type SignupBody = z.infer<typeof SignupBodySchema>

// ----------------------------------------------------------------
// POST /api/auth/signin — Request body schema
// ----------------------------------------------------------------
export const SigninBodySchema = z.object({
  /** Email address (case-insensitive) */
  email: z
    .string('Email is required')
    .email('Invalid email format')
    .transform((v) => v.toLowerCase().trim()),

  /** Password — no regex check here; we just verify against the hash */
  password: z
    .string('Password is required')
    .min(1, 'Password is required'),
})

export type SigninBody = z.infer<typeof SigninBodySchema>
