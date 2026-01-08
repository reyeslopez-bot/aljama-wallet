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
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-white">{label}</div>
          <div
            className={[
              'rounded-full px-2 py-1 text-xs border',
              done
                ? 'bg-emerald-400/15 text-emerald-200 border-emerald-400/20'
                : 'bg-white/5 text-white/60 border-white/10',
            ].join(' ')}
          >
            {done ? 'Human OK' : 'Local check'}
          </div>
        </div>

        <div className="mt-3">
          <div className="relative">
            <div className="h-2 w-full rounded-full bg-white/10" />
            <div
              className="absolute left-0 top-0 h-2 rounded-full bg-[#c9a24d]/70"
              style={{ width: `${Math.min(v, 100)}%` }}
            />
          </div>

          <input
            aria-label="Human confirmation slider"
            type="range"
            min={0}
            max={100}
            value={v}
            disabled={!armed || done}
            onChange={(e) => setV(Number(e.target.value))}
            className="mt-3 w-full accent-[#c9a24d]"
          />

          <div className="mt-2 flex justify-between text-xs text-white/40">
            <span>Start</span>
            <span>Confirm</span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          firedRef.current = false
          setV(0)
        }}
        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
      >
        Reset
      </button>

      <p className="text-xs text-white/45">
        This is not a real CAPTCHA. It blocks basic scripted fetch loops.
      </p>
    </div>
  )
}
