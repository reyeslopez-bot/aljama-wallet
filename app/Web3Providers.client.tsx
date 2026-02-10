// app/Web3Providers.client.tsx
"use client"

import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { WagmiProvider, createConfig, http, type CreateConfigParameters } from "wagmi"
import { base, mainnet, polygon, sepolia } from "wagmi/chains"
import { injected, walletConnect } from "wagmi/connectors"
import type { Chain } from "viem"
import { BRAND } from "@/constants/brand"

const CHAINS = [mainnet, sepolia, polygon, base] as const satisfies readonly [
  Chain,
  ...Chain[],
]

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  "http://localhost:2998"

const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID

const globalForWagmi = globalThis as unknown as {
  aljamaWagmiConfig?: ReturnType<typeof createConfig>
}

function buildWagmiConfig(): CreateConfigParameters {
  const connectors = [injected()]

  if (WC_PROJECT_ID) {
    connectors.push(
      walletConnect({
        projectId: WC_PROJECT_ID,
        metadata: {
          name: BRAND.name,
          description: BRAND.description,
          url: APP_URL,
          icons: [],
        },
      }),
    )
  }

  return {
    chains: CHAINS,
    ssr: false,
    connectors,
    transports: {
      [mainnet.id]: http(),
      [sepolia.id]: http(),
      [polygon.id]: http(),
      [base.id]: http(),
    },
  }
}

const wagmiConfig =
  globalForWagmi.aljamaWagmiConfig ?? createConfig(buildWagmiConfig())

if (!globalForWagmi.aljamaWagmiConfig) {
  globalForWagmi.aljamaWagmiConfig = wagmiConfig
}

export default function Web3Providers({ children }: { children: ReactNode }) {
  // Prevent connector init during hydration, but\ still render UI.
  const [mounted, setMounted] = useState(false)

  // Create once.
  const [queryClient] = useState(() => new QueryClient())

  const config = wagmiConfig

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
