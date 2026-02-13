import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { verifyPassword } from '@/lib/auth/password'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import { prismaPg } from '@/lib/prisma-pg'
import { findUserByEmail, usePgAuth } from '@/lib/auth/store'
import { logError, logWarn } from '@/lib/security/logging'

const usePg = usePgAuth()

export const authOptions: NextAuthOptions = {
  secret:
    process.env.NEXTAUTH_SECRET ??
    (process.env.NODE_ENV !== 'production' ? 'dev-secret-change-me' : undefined),
  adapter: usePg ? PrismaAdapter(prismaPg) : undefined,
  session: {
    strategy: usePg ? 'database' : 'jwt',
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'text', placeholder: 'you@company.com' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email?.toLowerCase().trim()
        const password = credentials?.password ?? ''

        if (!email || !password) return null

        const user = await findUserByEmail(email)

        if (!user || !user.passwordHash) return null

        const ok = await verifyPassword(password, user.passwordHash)
        if (!ok) return null

        return {
          id: user.id,
          email: user.email,
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
