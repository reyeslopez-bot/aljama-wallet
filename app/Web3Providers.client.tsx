// app/Web3Providers.client.tsx
"use client"

import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { WagmiProvider, createConfig, http } from "wagmi"
import { base, mainnet, polygon, sepolia } from "wagmi/chains"
import { injected, walletConnect } from "wagmi/connectors"
import type { Chain } from "viem"
import { BRAND } from "@/constants/brand"

const CHAINS = [mainnet, sepolia, polygon, base] as const satisfies readonly [
  Chain,
  ...Chain[],
]

export default function Web3Providers({ children }: { children: ReactNode }) {
  // Prevent connector init during hydration, but\ still render UI.
  const [mounted, setMounted] = useState(false)

  // Create once.
  const [queryClient] = useState(() => new QueryClient())

  // Create once. (No need for useMemo + deps footguns.)
  const [config] = useState(() => {
    const connectors = [injected()]
    const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID

    if (projectId) {
      const appUrl =
        typeof window !== "undefined" ? window.location.origin : "http://localhost"
      connectors.push(
        walletConnect({
          projectId,
          metadata: {
            name: BRAND.name,
            description: BRAND.description,
            url: appUrl,
            icons: [],
          },
        }),
      )
    }

    return createConfig({
      chains: CHAINS,
      ssr: false,
      connectors,
      transports: {
        [mainnet.id]: http(),
        [sepolia.id]: http(),
        [polygon.id]: http(),
        [base.id]: http(),
      },
    })
  })

  useEffect(() => setMounted(true), [])

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
