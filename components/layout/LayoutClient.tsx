// components/layout/LayoutClient.tsx
'use client'

import Navbar from './Navbar'
import type { ReactNode } from 'react'

export default function LayoutClient({ children }: { children: ReactNode }) {
  return (
    <>
      {/* background layer */}
      <div className="fixed inset-0 z-0 overflow-hidden">
        <div
          className="
            absolute inset-0
            bg-repeat-x bg-center bg-cover
            animate-slide-dunes
          "
        />
        <div className="absolute inset-0 bg-black/60" /> {/* darken dunes a bit */}
      </div>

      <Navbar />

      {/* only main */}
      <main className="relative z-10 flex-1 px-4 py-10 pt-24 md:px-8">
        <div className="mx-auto max-w-6xl">
          {children}
        </div>
      </main>
    </>
  )
}
