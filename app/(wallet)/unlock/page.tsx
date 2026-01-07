// app/(wallet)/unlock/page.tsx
'use client'

import { useWalletGate } from '@/infra/utils/useWalletGate'
// ⬆️ ONLY new import

export default function UnlockPage() {
  useWalletGate('require-locked')

  return (
    // ⬇️ your existing unlock JSX stays EXACTLY as-is
    <div className="relative mx-auto max-w-5xl space-y-10 pb-24 pt-20">
      {/* unlock UI */}
    </div>
  )
}
