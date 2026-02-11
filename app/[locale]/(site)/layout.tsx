// app/(site)/layout.tsx
// app/[locale]/(site)/layout.tsx
import type { ReactNode } from 'react'
import LayoutClient from '@/components/layout/LayoutClient'

export default function SiteLayout({ children }: { children: ReactNode }) {
  return <LayoutClient>{children}</LayoutClient>
}
