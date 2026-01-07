'use client'

import '@rainbow-me/rainbowkit/styles.css'
import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { mainnet, sepolia } from 'wagmi/chains'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider, connectorsForWallets } from '@rainbow-me/rainbowkit'
import { metaMaskWallet, coinbaseWallet, walletConnectWallet } from '@rainbow-me/rainbowkit/wallets'
import { usePathname } from 'next/navigation'
import { BRAND } from '@/constants/brand'

function makeLightConfig() {
  // No connectors. No wallet probing. Still provides Wagmi context for code that expects it.
  return createConfig({
    chains: [mainnet, sepolia],
    transports: {
      [mainnet.id]: http(),
      [sepolia.id]: http(),
    },
    ssr: false,
  })
}

function makeFullConfig() {
  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? ''
  const wcProjectId = projectId || '00000000000000000000000000000000'

  const connectors = connectorsForWallets(
    [
      {
        groupName: 'Wallets',
        wallets: [metaMaskWallet, coinbaseWallet, walletConnectWallet],
      },
    ],
    { appName: BRAND.name, projectId: wcProjectId }
  )

  return createConfig({
    chains: [mainnet, sepolia],
    transports: {
      [mainnet.id]: http(),
      [sepolia.id]: http(),
    },
    connectors,
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

  // Critical: config must be stable per route class.
  const config = useMemo(() => {
    return needsWalletBoot ? makeFullConfig() : makeLightConfig()
  }, [needsWalletBoot])

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
