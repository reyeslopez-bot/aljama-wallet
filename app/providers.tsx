'use client'

import { PropsWithChildren, useState } from 'react'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { config } from '@/infra/wagmi/wagmi'

export default function Providers({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient())
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
            {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}
