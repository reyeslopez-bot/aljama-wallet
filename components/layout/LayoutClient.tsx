// components/layout/LayoutClient.tsx
'use client'

import Navbar from './Navbar'
import type { ReactNode } from 'react'

export default function LayoutClient({ children }: { children: ReactNode }) {
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

      <main className="relative z-10 flex-1 px-4 py-12 pt-28 md:px-10">
        <div className="mx-auto max-w-7xl">
          {children}
        </div>
      </main>
    </>
  )
}
