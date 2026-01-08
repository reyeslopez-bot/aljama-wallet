// app/(wallet)/unlock/page.tsx
'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { setHumanOk } from '@/lib/storage/humanGate'
import { BRAND } from '@/constants/brand'

export default function UnlockPage() {
  const router = useRouter()
  const sp = useSearchParams()
  const next = useMemo(() => sp.get('next') || '/', [sp])
  const [done, setDone] = useState(false)

  return (
    <div className="relative min-h-screen">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/backgrounds/background_image_dunes_light_mode.jpg')" }}
      />
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(217,111,66,0.18),transparent_55%)]" />

      {/* gate card */}
      <div className="relative mx-auto flex min-h-screen max-w-xl items-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 14, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.35 }}
          className="relative w-full rounded-3xl border border-white/10 bg-black/60 p-8 shadow-2xl shadow-black/50 backdrop-blur-xl"
        >
          <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <div className="text-xs uppercase tracking-[0.25em] text-[#c9a24d]/90">{BRAND.name}</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-white">Confirm intent</div>
          <div className="mt-1 text-sm text-white/70">
            {done ? 'Verified. Redirecting…' : 'Quick local check. No network calls.'}
          </div>

          <div className="mt-7">
            <SliderConfirm
              onDone={() => {
                setDone(true)
                setHumanOk()
                router.replace(next)
              }}
            />
          </div>

          <div className="mt-6 text-[11px] text-white/40">
            Session-only. Refresh keeps it. New tab resets.
          </div>
        </motion.div>
      </div>
    </div>
  )
}

function SliderConfirm({ onDone }: { onDone: () => void }) {
  const [v, setV] = useState(0)

  return (
    <div className="space-y-3">
      <div className="text-xs uppercase tracking-[0.18em] text-white/60">Slide to continue</div>

      <div className="rounded-2xl border border-white/10 bg-black/40 p-4 shadow-inner shadow-black/40">
        <input
          type="range"
          min={0}
          max={100}
          value={v}
          onChange={(e) => {
            const n = Number(e.target.value)
            setV(n)
            if (n >= 98) onDone()
          }}
          className="w-full accent-[#c9a24d]"
        />
        <div className="mt-2 flex justify-between text-[11px] text-white/40">
          <span>Start</span>
          <span>End</span>
        </div>

        <button
          type="button"
          onClick={() => setV(0)}
          className="mt-4 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10"
        >
          Reset
        </button>
      </div>
    </div>
  )
}
