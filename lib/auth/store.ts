import { prismaPg } from '@/lib/prisma-pg'
import { randomUUID } from 'node:crypto'

type StoredUser = {
  id: string
  email: string
  passwordHash: string
  name?: string | null
}

const globalForAuth = globalThis as unknown as {
  authDevUsers?: Map<string, StoredUser>
}

const devUsers = globalForAuth.authDevUsers ?? new Map<string, StoredUser>()
if (process.env.NODE_ENV !== 'production') {
  globalForAuth.authDevUsers = devUsers
}

export function usePgAuth(): boolean {
  const mode = process.env.AUTH_MODE
  if (mode === 'memory') return false
  if (mode === 'pg') return true
  if (process.env.NODE_ENV !== 'production') return false
  return Boolean(process.env.PG_DATABASE_URL ?? process.env.POSTGRES_URL)
}

export async function findUserByEmail(email: string): Promise<StoredUser | null> {
  if (usePgAuth()) {
    try {
      return await prismaPg.user.findUnique({ where: { email } })
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('auth: pg lookup failed, falling back to memory', error)
        return devUsers.get(email) ?? null
      }
      throw error
    }
  }
  return devUsers.get(email) ?? null
}

export async function createUser(params: {
  email: string
  passwordHash: string
}): Promise<StoredUser> {
  const email = params.email.trim().toLowerCase()
  if (usePgAuth()) {
    try {
      return await prismaPg.user.create({
        data: {
          email,
          passwordHash: params.passwordHash,
        },
      })
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('auth: pg create failed, falling back to memory', error)
      } else {
        throw error
      }
    }
  }

  if (devUsers.has(email)) {
    throw new Error('User already exists')
  }

  const id = `dev_${randomUUID()}`
  const user: StoredUser = { id, email, passwordHash: params.passwordHash }
  devUsers.set(email, user)
  return user
}
