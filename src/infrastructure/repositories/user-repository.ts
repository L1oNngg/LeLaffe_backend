import { db } from '@/infrastructure/database/db'
import type { Role } from '@prisma/client'

/**
 * User Repository — Infrastructure Layer
 *
 * Rule (nextjs-backend.md → DIP):
 * Use-cases call repository functions instead of
 * importing PrismaClient directly. This allows swapping
 * the data source without touching business logic.
 *
 * Rule (nextjs-backend.md → Soft-Delete / BR-13):
 * Never physically DELETE a User. Use status flags if needed.
 */

export interface CreateUserData {
  email: string
  password_hash: string
  role?: Role
}

/**
 * Find a user by email address.
 * Returns null if not found.
 */
export async function findUserByEmail(email: string) {
  return db.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      password_hash: true,
      role: true,
      created_at: true,
    },
  })
}

/**
 * Find a user by their ID.
 * Returns null if not found.
 */
export async function findUserById(userId: string) {
  return db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      created_at: true,
    },
  })
}

/**
 * Create a new user in the database.
 * Password must already be hashed before calling this function.
 */
export async function createUser(data: CreateUserData) {
  return db.user.create({
    data: {
      email: data.email,
      password_hash: data.password_hash,
      role: data.role ?? 'CUSTOMER',
    },
    select: {
      id: true,
      email: true,
      role: true,
      created_at: true,
    },
  })
}
