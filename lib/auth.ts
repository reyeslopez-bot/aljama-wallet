import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { verifyPassword } from '@/lib/auth/password'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import { prismaPg } from '@/lib/prisma-pg'
import { findUserByIdentifier, usePgAuth } from '@/lib/auth/store'
import { logError, logWarn } from '@/lib/security/logging'
import { rateLimit } from '@/lib/security/rate-limit'
import { isStrictMode } from '@/lib/security/runtime'

const usePg = usePgAuth()
const configuredNextAuthSecret = process.env.NEXTAUTH_SECRET?.trim() ?? ''
const configuredDevNextAuthSecret = process.env.NEXTAUTH_DEV_SECRET?.trim() ?? ''
const devNextAuthSecret = configuredDevNextAuthSecret || 'aljama-dev-nextauth-secret'
const usingImplicitDevSecretFallback = !configuredNextAuthSecret && !configuredDevNextAuthSecret
const globalForAuth = globalThis as typeof globalThis & {
  nextAuthDevSecretFallbackWarningLogged?: boolean
}

if (isStrictMode && !configuredNextAuthSecret) {
  throw new Error('Missing NEXTAUTH_SECRET in strict mode')
}

const nextAuthSecret = configuredNextAuthSecret || devNextAuthSecret
const AUTH_LOGIN_RATE_LIMIT = {
  bucket: 'auth-login',
  limit: 8,
  windowMs: 60_000,
} as const

function normalizeForwardedIp(rawValue: string | string[] | undefined): string | null {
  if (Array.isArray(rawValue)) {
    return normalizeForwardedIp(rawValue[0])
  }
  if (typeof rawValue !== 'string') return null
  const first = rawValue.split(',')[0]?.trim()
  return first || null
}

function buildCredentialRateLimitKey(
  identifier: string,
  req?: { headers?: Headers | Record<string, string | string[] | undefined> } | null,
) {
  const headers = req?.headers
  const forwardedIp =
    headers instanceof Headers
      ? normalizeForwardedIp(headers.get('x-forwarded-for') ?? headers.get('x-real-ip') ?? undefined)
      : normalizeForwardedIp(headers?.['x-forwarded-for'] ?? headers?.['x-real-ip'])

  if (forwardedIp) {
    return `principal:${identifier}:ip:${forwardedIp}`
  }

  return `principal:${identifier}`
}

if (usingImplicitDevSecretFallback && !globalForAuth.nextAuthDevSecretFallbackWarningLogged) {
  globalForAuth.nextAuthDevSecretFallbackWarningLogged = true
  logWarn('next-auth:secret', { message: 'Using built-in NEXTAUTH_DEV_SECRET fallback in non-strict mode' })
}

export const authOptions: NextAuthOptions = {
  secret: nextAuthSecret,
  adapter: usePg ? PrismaAdapter(prismaPg) : undefined,
  session: {
    strategy: usePg ? 'database' : 'jwt',
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        identifier: { label: 'Username or email', type: 'text', placeholder: 'username or you@company.com' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        const identifier = (credentials?.identifier ?? '').trim().toLowerCase()
        const password = credentials?.password ?? ''

        if (!identifier || !password) return null

        const limit = await rateLimit({
          ...AUTH_LOGIN_RATE_LIMIT,
          key: buildCredentialRateLimitKey(identifier, req),
        })

        if (!limit.ok) {
          logWarn('next-auth:credentials-rate-limit', {
            message: 'Credentials login attempt blocked by rate limit',
            identifierKind: identifier.includes('@') ? 'email' : 'username',
            retryAfter: limit.retryAfter,
          })
          return null
        }

        const user = await findUserByIdentifier(identifier)

        if (!user || !user.passwordHash) return null

        const ok = await verifyPassword(password, user.passwordHash)
        if (!ok) return null

        return {
          id: user.id,
          email: user.email ?? undefined,
          name: user.name ?? undefined,
        }
      },
    }),
  ],
  callbacks: {
    async session({ session, user, token }) {
      if (session.user) {
        session.user.id = user?.id ?? token?.sub ?? session.user.id
      }
      return session
    },
  },
  logger: {
    error(code, metadata) {
      const details =
        typeof metadata === 'object' && metadata !== null
          ? (metadata as Record<string, unknown>)
          : undefined
      if (code === 'JWT_SESSION_ERROR') {
        logWarn('next-auth:jwt-session', { message: code }, details)
        return
      }
      logError('next-auth', { message: code }, details)
    },
  },
}
