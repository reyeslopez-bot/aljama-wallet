// app/Providers.client.tsx
'use client'

import type { ReactNode } from 'react'
import dynamic from 'next/dynamic'

const Web3Providers = dynamic(() => import('./Web3Providers.client'), {
  ssr: false,
})

export default function Providers({ children }: { children: ReactNode }) {
  return <Web3Providers>{children}</Web3Providers>
}
