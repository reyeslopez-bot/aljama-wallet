// app/(site)/layout.tsx
import type { ReactNode } from 'react'
import LayoutClient from '@/components/layout/LayoutClient'
import SecureGate from '@/components/SecureGate'

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <LayoutClient>
      <SecureGate storageKey="site_secure_gate_v1">{children}</SecureGate>
    </LayoutClient>
  )
}
