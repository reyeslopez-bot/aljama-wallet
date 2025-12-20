'use client'

import '@rainbow-me/rainbowkit/styles.css'

import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { WagmiProvider, http } from 'wagmi'
import type { Config } from 'wagmi'
import { mainnet, sepolia } from 'wagmi/chains'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'

import { createConfig } from 'wagmi'
import { injected, coinbaseWallet } from 'wagmi/connectors'

function makeSafeConfig(): Config {
  return createConfig({
    chains: [mainnet, sepolia],
    transports: {
      [mainnet.id]: http(),
      [sepolia.id]: http(),
    },
    connectors: [injected(), coinbaseWallet({ appName: 'Aljama Wallet' })],
    ssr: true,
  }) as unknown as Config
}

export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  const safeConfig = useMemo(() => makeSafeConfig(), [])
  const [config, setConfig] = useState<Config>(() => safeConfig)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { getDefaultConfig } = await import('@rainbow-me/rainbowkit')

      const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? ''
      if (!projectId) console.warn('Missing NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID')

      const fullConfig = getDefaultConfig({
        appName: 'Aljama Wallet',
        projectId,
        chains: [mainnet, sepolia],
        transports: {
          [mainnet.id]: http(),
          [sepolia.id]: http(),
        },
      })

      if (!cancelled) setConfig(fullConfig as unknown as Config)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
