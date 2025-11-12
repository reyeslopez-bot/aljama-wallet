'use client'

import { PropsWithChildren, useState } from 'react'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConnectKitProvider } from 'connectkit'
import { config } from '@/infra/wagmi/wagmi'
import { WalletPanelsProvider } from '@/components/wallet/context/WalletPanelsContext'

export default function Providers({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient())
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider>
          <WalletPanelsProvider>
            {children}
          </WalletPanelsProvider>
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
