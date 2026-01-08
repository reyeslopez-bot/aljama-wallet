// components/ui/HumanGate.tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

export function HumanGate({ onVerified }: { onVerified: () => void }) {
  const [v, setV] = useState(0)
  const [armed, setArmed] = useState(false)
  const firedRef = useRef(false)

  useEffect(() => {
    const t = window.setTimeout(() => setArmed(true), 600)
    return () => window.clearTimeout(t)
  }, [])

  const done = v >= 98

  useEffect(() => {
    if (!armed) return
    if (!done) return
    if (firedRef.current) return
    firedRef.current = true
    onVerified()
  }, [armed, done, onVerified])

  const label = useMemo(() => {
    if (!armed) return 'Initializing…'
    if (done) return 'Verified'
    if (v > 0) return 'Keep going'
    return 'Slide to confirm'
  }, [armed, done, v])

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

          <div className="mt-2 flex justify-between text-xs text-white/40">
            <span>Start</span>
            <span>Confirm</span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setV(0)}
        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
      >
        Reset
      </button>

      <p className="text-xs text-white/45">
        This is not a real CAPTCHA. It blocks basic scripted fetch loops.
      </p>
    </div>
  )
}
