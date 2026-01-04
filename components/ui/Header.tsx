// components/ui/Header.tsx
'use client'

import Link from 'next/link'
import { BRAND } from '@/constants/brand'

export default function Header() {
  return (
    <header className="w-full bg-blue-600 text-white p-4">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <h1 className="text-3xl font-bold">{BRAND.name}</h1>

        <nav className="space-x-4">
          <Link href="/" className="hover:underline">Home</Link>
          <Link href="/about" className="hover:underline">About Us</Link>
          <Link href="/contact" className="hover:underline">Contact</Link>
        </nav>
      </div>
    </header>
  )
}
