// components/layout/LayoutClient.tsx
'use client'

import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { useAdaptiveExperience } from '@/hooks/useAdaptiveExperience'
import Navbar from './Navbar'
import SupportDrawer from '@/components/support/SupportDrawer.client'

export default function LayoutClient({ children }: { children: ReactNode }) {
  const { shouldUseLightweightMode } = useAdaptiveExperience()

  useEffect(() => {
    document.documentElement.dataset.js = 'true'
    document.documentElement.dataset.runtimeMode = shouldUseLightweightMode ? 'lightweight' : 'enhanced'
  }, [shouldUseLightweightMode])

  return (
    <>
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(210,167,98,0.2),transparent_55%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_30%_60%,rgba(92,152,124,0.18),transparent_55%)]"
        aria-hidden="true"
      />

      <Navbar />
      <SupportDrawer />

      <main className="app-navbar-offset relative z-10 flex-1 px-4 pb-12 md:px-10">
        <div className="mx-auto max-w-7xl">
          {children}
        </div>
      </main>
    </>
  )
}
