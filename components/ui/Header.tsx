// components/ui/Header.tsx
'use client'

import Link from 'next/link'
import { BRAND } from '@/constants/brand'

export default function Header() {
  return (
    <header className="w-full border-b border-white/10 bg-black/50 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <h1 className="text-2xl font-semibold tracking-tight text-white">{BRAND.name}</h1>

        <nav className="space-x-4">
          <Link href="/" className="text-sm uppercase tracking-[0.18em] text-white/70 transition hover:text-amber-200">Home</Link>
          <Link href="/about" className="text-sm uppercase tracking-[0.18em] text-white/70 transition hover:text-amber-200">About Us</Link>
          <Link href="/contact" className="text-sm uppercase tracking-[0.18em] text-white/70 transition hover:text-amber-200">Contact</Link>
        </nav>
      </div>
    </header>
  )
}
