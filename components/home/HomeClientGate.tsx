// components/home/HomeClientGate.tsx
'use client'

import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { HumanGate } from '@/components/ui/HumanGate'
import { BRAND } from '@/constants/brand'

type Props = {
  children: ReactNode
  storageKey?: string
}

export default function HomeClientGate({
  children,
  storageKey = 'aljama_human_ok_v1',
}: Props) {
  const [ok, setOk] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const saved = window.sessionStorage.getItem(storageKey)
      if (saved === '1') setOk(true)
    } catch {
      // ignore
    }
  }, [storageKey])

  const verified = () => {
    setOk(true)
    if (typeof window === 'undefined') return
    try {
      window.sessionStorage.setItem(storageKey, '1')
    } catch {
      // ignore
    }
  }

  if (ok) return <>{children}</>

  return (
    <div className="min-h-[70vh] w-full px-6 pt-24">
      <div className="relative mx-auto w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-black/60 p-7 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        <div className="absolute -left-16 -top-16 h-32 w-32 rounded-full bg-amber-400/20 blur-[80px]" />
        <div className="mb-5">
          <div className="text-sm uppercase tracking-[0.2em] text-amber-100/70">
            {BRAND.name}
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-white">
            {BRAND.name}
          </div>
          <div className="mt-1 text-sm text-white/70">
            Confirm you’re human to continue.
          </div>
        </div>

        <HumanGate onVerified={verified} />

        <div className="mt-5 text-xs text-white/50">Local check. No network calls.</div>
      </div>
    </div>
  )
}
