// app/Web3Providers.client.tsx
'use client'

import '@rainbow-me/rainbowkit/styles.css'
import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'

import { WagmiProvider } from 'wagmi'
import { mainnet, sepolia } from 'wagmi/chains'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { getDefaultConfig, RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { BRAND } from '@/constants/brand'

const CHAINS = [mainnet, sepolia] as const

function makeLightConfig() {
  // no RK connectors \to no probing \to no modal
  return getDefaultConfig({
    appName: BRAND.name,
    projectId: 'skip', // not used because we won’t render RK button on light routes
    chains: CHAINS,
    ssr: false,
  })
}

function makeFullConfig() {
  const projectId = (process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? '').trim()
  if (!projectId) return makeLightConfig()

  return getDefaultConfig({
    appName: BRAND.name,
    projectId,
    chains: CHAINS,
    ssr: false,
  })
}

export default function Web3Providers({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [queryClient] = useState(() => new QueryClient())

  const needsWalletBoot =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/wallet') ||
    pathname.startsWith('/swap') ||
    pathname.startsWith('/send')

  const config = useMemo(() => {
    return needsWalletBoot ? makeFullConfig() : makeLightConfig()
  }, [needsWalletBoot])

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {/* IMPORTANT: no chains prop in your version */}
        <RainbowKitProvider>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
