// components/SecureGate.tsx
import type { ReactNode } from 'react'
import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'

type SecureGateProps = {
  children: ReactNode
  redirectTo?: string
}

export default async function SecureGate({ children, redirectTo = '/login' }: SecureGateProps) {
  const session = await getServerSession(authOptions)
  if (!session) {
    redirect(redirectTo)
  }

  return <>{children}</>
}
