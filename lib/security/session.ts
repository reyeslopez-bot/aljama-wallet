import { getServerSession } from 'next-auth/next'
import { getErrorMessage } from '@/lib/security/errors'
import { logWarn } from '@/lib/security/logging'

function isRecoverableSessionError(error: unknown): boolean {
  const message = getErrorMessage(error, '').toLowerCase()
  return (
    message.includes('decryption operation failed') ||
    message.includes('jwt_session_error')
  )
}

export async function getSession() {
  try {
    const { authOptions } = await import('@/lib/auth')
    return await getServerSession(authOptions)
  } catch (error) {
    if (isRecoverableSessionError(error)) {
      logWarn('auth-session:recoverable', error)
      return null
    }
    throw error
  }
}

export async function requireSession() {
  const session = await getSession()
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
