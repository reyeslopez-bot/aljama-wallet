import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { verifyPassword } from '@/lib/auth/password'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import { prismaPg } from '@/lib/prisma-pg'
import { findUserByIdentifier, usePgAuth } from '@/lib/auth/store'
import { logError, logWarn } from '@/lib/security/logging'
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
      async authorize(credentials) {
        const identifier = (credentials?.identifier ?? '').trim().toLowerCase()
        const password = credentials?.password ?? ''

        if (!identifier || !password) return null

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
