import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

export async function getSession() {
  return getServerSession(authOptions)
}

export async function requireSession() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return null
  return session
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false
  const raw = process.env.AUTH_ADMIN_EMAILS
  if (!raw) return false
  const allowed = raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
  return allowed.includes(email.toLowerCase())
}
