"use client"

import type { ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"
import { WagmiProvider, createConfig, http } from "wagmi"
import { mainnet, sepolia } from "wagmi/chains"
import { injected } from "@wagmi/core"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

const CHAINS = [mainnet, sepolia] as const

export default function Web3Providers({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false)
  const [queryClient] = useState(() => new QueryClient())

  useEffect(() => setMounted(true), [])

  const config = useMemo(() => {
    return createConfig({
      chains: CHAINS,
      ssr: false,
      connectors: [injected()],
      transports: { [mainnet.id]: http(), [sepolia.id]: http() },
    })
  }, [])

  // Don’t let wallet connectors initialize during hydration
  if (!mounted) return <>{children}</>

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}
