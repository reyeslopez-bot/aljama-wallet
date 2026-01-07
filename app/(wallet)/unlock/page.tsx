'use client'

import { useState } from 'react'
import { HumanGate } from '@/components/ui/HumanGate'
import { BRAND } from '@/constants/brand'

export default function UnlockPage() {
  const [humanOk, setHumanOk] = useState(false)

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-xl items-center px-6">
      <div className="w-full overflow-hidden rounded-3xl border border-white/10 bg-black/50 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-[0.25em] text-[#c9a24d]/90">
            {BRAND.name}
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-white">
            Confirm intent
          </div>
          <div className="mt-1 text-sm text-white/70">
            {humanOk ? 'Verified.' : 'Quick local check before continuing.'}
          </div>
        </div>

        {!humanOk ? (
          <HumanGate onVerified={() => setHumanOk(true)} />
        ) : (
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-5">
            <div className="text-sm font-medium text-emerald-100">You’re good.</div>
            <div className="mt-1 text-xs text-white/60">
              Local check. No network calls.
            </div>
          </div>
        )}

        <div className="mt-6 text-[11px] text-white/40">
          This is not real bot protection. It only blocks accidental automation.
        </div>
      </div>
    </div>
  )
}
