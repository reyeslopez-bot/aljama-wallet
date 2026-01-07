// app/(wallet)/layout.tsx
import type { ReactNode } from 'react'
import { BRAND } from '@/constants/brand'

export default function WalletLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-black text-white">
      <div
        className="fixed inset-0 -z-20 bg-cover bg-center opacity-60"
        style={{
          backgroundImage:
            "url('/backgrounds/background_image_dunes_light_mode.jpg')",
        }}
      />
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-black/70 via-black/55 to-black/85" />
      <div className="fixed inset-0 -z-10 shadow-[inset_0_0_180px_rgba(0,0,0,0.85)]" />

      <div className="mx-auto flex min-h-screen w-full max-w-xl items-center justify-center px-6 py-16">
        <div className="w-full">{children}</div>
      </div>

      <div className="fixed bottom-6 left-0 right-0 text-center text-xs text-white/35">
        {BRAND.name}
      </div>
    </div>
  )
}