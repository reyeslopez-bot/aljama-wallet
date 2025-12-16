'use client'

import '@rainbow-me/rainbowkit/styles.css'

import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { WagmiProvider, http } from 'wagmi'
import { mainnet, sepolia } from 'wagmi/chains'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider, getDefaultConfig } from '@rainbow-me/rainbowkit'

export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  const config = useMemo(() => {
    // absolute guard: never build WC config unless we are in the browser
    if (typeof window === 'undefined') return null

    const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? ''
    if (!projectId) console.warn('Missing NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID')

    return getDefaultConfig({
      appName: 'Aljama Wallet',
      projectId,
      chains: [mainnet, sepolia],
      transports: {
        [mainnet.id]: http(),
        [sepolia.id]: http(),
      },
    })
  }, [])

  // During SSR or any accidental server evaluation: render children without wagmi.
  // This avoids crashing the dev server.
  if (!config) return <>{children}</>

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
