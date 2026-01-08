// components/layout/LayoutClient.tsx
'use client'

import Navbar from './Navbar'
import type { ReactNode } from 'react'

export default function LayoutClient({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="fixed inset-0 z-0 bg-black/70" aria-hidden="true" />
      <div className="fixed inset-0 z-0 bg-[radial-gradient(circle_at_top,rgba(217,111,66,0.18),transparent_55%)]" aria-hidden="true" />
      <div className="fixed inset-0 z-0 bg-[radial-gradient(circle_at_30%_60%,rgba(56,189,248,0.12),transparent_50%)]" aria-hidden="true" />

      <Navbar />

      {/* only main */}
      <main className="relative z-10 flex-1 px-4 py-12 pt-28 md:px-10">
        <div className="mx-auto max-w-7xl">
          {children}
        </div>
      </main>
    </>
  )
}
