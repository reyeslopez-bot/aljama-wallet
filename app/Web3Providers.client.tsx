'use client'

import '@rainbow-me/rainbowkit/styles.css'
import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { mainnet, sepolia } from 'wagmi/chains'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider, connectorsForWallets } from '@rainbow-me/rainbowkit'
import { metaMaskWallet, coinbaseWallet, walletConnectWallet } from '@rainbow-me/rainbowkit/wallets'
import { BRAND } from '@/constants/brand'

function makeConfig() {
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
  const [queryClient] = useState(() => new QueryClient())
  const config = useMemo(() => makeConfig(), [])

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
