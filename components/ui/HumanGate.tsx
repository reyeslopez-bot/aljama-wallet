// components/wallet/ui/HumanGate.tsx
'use client'

import { useState } from 'react'

export function HumanGate({ onVerified }: { onVerified: () => void }) {
  const [v, setV] = useState(0)
  const done = v >= 98

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="mb-3 flex items-center justify-between text-xs text-white/60">
          <span>Slide to verify</span>
          <span>{done ? 'Verified' : `${v}%`}</span>
        </div>

        <input
          type="range"
          min={0}
          max={100}
          value={v}
          onChange={(e) => {
            const next = Number(e.target.value)
            setV(next)
            if (next >= 98) onVerified()
          }}
          className="w-full accent-white"
        />

        <div className="mt-3 flex items-center justify-between text-xs text-white/40">
          <span>Start</span>
          <span>End</span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setV(0)}
        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
      >
        Reset
      </button>
    </div>
  )
}