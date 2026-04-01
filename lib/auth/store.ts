import { prismaPg } from '@/lib/prisma-pg'
import { randomUUID } from 'node:crypto'
import { logWarn } from '@/lib/security/logging'
import { disablePgFeatureInDev, isPgFeatureDisabledInDev } from '@/lib/security/pg-dev-fallback'
import { getPrismaSchemaIssue } from '@/lib/security/prisma-schema'

type StoredUser = {
  id: string
  email: string | null
  passwordHash: string
  name?: string | null
  image?: string | null
}

const globalForAuth = globalThis as unknown as {
  authDevUsersById?: Map<string, StoredUser>
}

const devUsersById = globalForAuth.authDevUsersById ?? new Map<string, StoredUser>()
if (process.env.NODE_ENV !== 'production') {
  globalForAuth.authDevUsersById = devUsersById
}

const AUTH_PG_FEATURE = 'auth-store'

export function usePgAuth(): boolean {
  const mode = process.env.AUTH_MODE
  if (mode === 'memory') return false
  const pgConfigured =
    mode === 'pg' ||
    (process.env.NODE_ENV === 'production' && Boolean(process.env.PG_DATABASE_URL ?? process.env.POSTGRES_URL))

  if (!pgConfigured) return false
  return !isPgFeatureDisabledInDev(AUTH_PG_FEATURE)
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}

function handlePgAuthError(scope: string, error: unknown): boolean {
  if (process.env.NODE_ENV === 'production') {
    return false
  }

  const schemaIssue = getPrismaSchemaIssue(error)
  if (schemaIssue) {
    const firstFailure = disablePgFeatureInDev(AUTH_PG_FEATURE, schemaIssue.summary)
    if (firstFailure) {
      logWarn(
        'auth:pg-schema',
        {
          message:
            `Postgres auth schema is missing or outdated (${schemaIssue.summary}); ` +
            'using in-memory auth for this dev server process. Run `pnpm prisma:migrate:deploy:pg` and restart `pnpm dev`.',
        },
        {
          code: schemaIssue.code,
          target: schemaIssue.target,
        },
      )
    }
    return true
  }

  logWarn(scope, error)
  return true
}

function findDevUserByEmail(email: string): StoredUser | null {
  const normalized = normalizeEmail(email)
  if (!normalized) return null

  for (const user of devUsersById.values()) {
    if (user.email && normalizeEmail(user.email) === normalized) {
      return user
    }
  }

  return null
}

function findDevUserByUsername(username: string): StoredUser | null {
  const normalized = normalizeUsername(username)
  if (!normalized) return null

  for (const user of devUsersById.values()) {
    if (user.name && normalizeUsername(user.name) === normalized) {
      return user
    }
  }

  return null
}

export async function findUserByEmail(email: string): Promise<StoredUser | null> {
  const normalized = normalizeEmail(email)
  if (!normalized) return null

  if (usePgAuth()) {
    try {
      return await prismaPg.user.findUnique({ where: { email: normalized } })
    } catch (error) {
      if (handlePgAuthError('auth:lookup', error)) {
        return findDevUserByEmail(normalized)
      }
      throw error
    }
  }

  return findDevUserByEmail(normalized)
}

export async function findUserByUsername(username: string): Promise<StoredUser | null> {
  const normalized = normalizeUsername(username)
  if (!normalized) return null

  if (usePgAuth()) {
    try {
      return await prismaPg.user.findFirst({
        where: { name: normalized },
      })
    } catch (error) {
      if (handlePgAuthError('auth:lookup-username', error)) {
        return findDevUserByUsername(normalized)
      }
      throw error
    }
  }

  return findDevUserByUsername(normalized)
}

export async function findUserByIdentifier(identifier: string): Promise<StoredUser | null> {
  const normalized = identifier.trim().toLowerCase()
  if (!normalized) return null

  if (usePgAuth()) {
    try {
      return await prismaPg.user.findFirst({
        where: {
          OR: [
            { email: normalized },
            { name: normalized },
          ],
        },
      })
    } catch (error) {
      if (handlePgAuthError('auth:lookup-identifier', error)) {
        return findDevUserByEmail(normalized) ?? findDevUserByUsername(normalized)
      }
      throw error
    }
  }

  return findDevUserByEmail(normalized) ?? findDevUserByUsername(normalized)
}

export async function createUser(params: {
  username: string
  email?: string | null
  passwordHash: string
  image?: string | null
}): Promise<StoredUser> {
  const username = normalizeUsername(params.username)
  const email = params.email ? normalizeEmail(params.email) : null
  const image = params.image?.trim() || null

  if (!username) {
    throw new Error('username is required')
  }

  if (usePgAuth()) {
    try {
      return await prismaPg.user.create({
        data: {
          name: username,
          email,
          passwordHash: params.passwordHash,
          image,
        },
      })
    } catch (error) {
      if (!handlePgAuthError('auth:create', error)) {
        throw error
      }
    }
  }

  if (findDevUserByUsername(username)) {
    throw new Error('Username already exists')
  }
  if (email && findDevUserByEmail(email)) {
    throw new Error('User already exists')
  }

  const id = `dev_${randomUUID()}`
  const user: StoredUser = {
    id,
    name: username,
    email,
    passwordHash: params.passwordHash,
    image,
  }
  devUsersById.set(id, user)
  return user
}
