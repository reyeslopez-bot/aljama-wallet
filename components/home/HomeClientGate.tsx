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
    <div className="min-h-[70vh] w-full px-6 pt-24">
      <div className="mx-auto w-full max-w-md rounded-3xl border border-white/10 bg-black/50 p-6 shadow-2xl backdrop-blur">
        <div className="mb-5">
          <div className="text-2xl font-semibold tracking-wide text-white">
            {BRAND.name}
          </div>
          <div className="mt-1 text-sm text-white/70">
            Confirm you’re human to continue.
          </div>
        </div>
      </div>
    </div>
  )
}
