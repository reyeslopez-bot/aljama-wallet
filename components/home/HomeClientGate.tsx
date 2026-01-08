// components/home/HomeClientGate.tsx
'use client'

import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { HumanGate } from '@/components/ui/HumanGate'

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
    const saved = window.sessionStorage.getItem(storageKey)
    if (saved === '1') setOk(true)
  }, [storageKey])

  const verified = () => {
    setOk(true)
    window.sessionStorage.setItem(storageKey, '1')
  }

  if (ok) return <>{children}</>

  return (
    <div className="relative min-h-[80vh] w-full px-6 pt-24">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-black via-black/80 to-black" />
        <div className="absolute -left-24 top-24 h-64 w-64 rounded-full bg-[#c9a24d]/15 blur-[140px]" />
        <div className="absolute -right-24 bottom-24 h-64 w-64 rounded-full bg-[#d96f42]/12 blur-[160px]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      </div>

      <div className="mx-auto w-full max-w-md">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/45 p-7 shadow-[0_40px_120px_rgba(0,0,0,0.75)] backdrop-blur">
          <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[#c9a24d]/35 to-transparent" />

          <header className="mb-6 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-[0.28em] text-[#c9a24d]/90">
                Entry Gate
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60">
                Session
              </div>
            </div>

            <div className="text-3xl font-semibold tracking-tight text-white">
              Aljama Wallet
            </div>

            <p className="text-sm text-white/65">
              Confirm intent before we render the app surface.
            </p>
          </header>

          <HumanGate onVerified={verified} />

          <div className="mt-6 rounded-2xl border border-white/10 bg-black/40 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-white/45">
              What this does
            </div>
            <ul className="mt-2 space-y-1 text-sm text-white/60">
              <li>• Blocks dumb scripted refresh loops.</li>
              <li>• Stores a session flag only.</li>
              <li>• No network calls.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
