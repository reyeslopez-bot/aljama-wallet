// app/(site)/layout.tsx
// app/[locale]/(site)/layout.tsx
import type { ReactNode } from 'react'
import LayoutClient from '@/components/layout/LayoutClient'
import HomeConsentGate from '@/components/home/HomeConsentGate.client'

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <HomeConsentGate>
      <LayoutClient>{children}</LayoutClient>
    </HomeConsentGate>
  )
}
