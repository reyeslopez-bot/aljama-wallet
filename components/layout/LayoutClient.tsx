// components/layout/LayoutClient.tsx
'use client'
import Navbar from './Navbar'
import type { ReactNode } from 'react'

export default function LayoutClient({ children }: { children: ReactNode }) {
  return (
    <>
      {/* background layer */}
      <div className="fixed inset-0 overflow-hidden z-0">
        <div
          className="
            absolute inset-0
            bg-[url('/backgrounds/dunes-night.png')]
            bg-repeat-x bg-center bg-cover
            animate-slide-dunes
          "
        />
        <div className="absolute inset-0 pointer-events-none" />
      </div>

      <Navbar />

      {/* This is the ONLY main */}
      <main className="relative z-10 flex-1 px-4 md:px-8 py-6 pt-20">
        {children}
      </main>
    </>
  )
}
