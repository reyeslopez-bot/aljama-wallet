"use client"

import "@rainbow-me/rainbowkit/styles.css"
import type { ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"
import { WagmiProvider, createConfig, http } from "wagmi"
import { mainnet, sepolia } from "wagmi/chains"
import { injected } from "wagmi/connectors"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { getDefaultConfig, RainbowKitProvider } from "@rainbow-me/rainbowkit"
import { BRAND } from "@/constants/brand"

const CHAINS = [mainnet, sepolia] as const

export default function Web3Providers({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false)
  const [queryClient] = useState(() => new QueryClient())

  useEffect(() => setMounted(true), [])

  const projectId = (process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "").trim()

  const config = useMemo(() => {
    if (projectId) {
      return getDefaultConfig({
        appName: BRAND.name,
        projectId,
        chains: CHAINS,
        ssr: false,
      })
    }

    return createConfig({
      chains: CHAINS,
      ssr: false,
      connectors: [injected()],
      transports: { [mainnet.id]: http(), [sepolia.id]: http() },
    })
  }, [projectId])

  // Don’t let RainbowKit/ConnectModal initialize during hydration
  if (!mounted) return <>{children}</>

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
