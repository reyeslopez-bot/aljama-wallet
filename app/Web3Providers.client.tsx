// app/Web3Providers.client.tsx
"use client"

import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  WagmiProvider,
  createConfig,
  http,
  type CreateConfigParameters,
} from "wagmi"
import { base, mainnet, polygon, sepolia } from "wagmi/chains"
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
type WagmiConnectorsModule = typeof import("wagmi/connectors")
type WagmiConfig = ReturnType<typeof createConfig>

const globalForWagmi = globalThis as unknown as {
  aljamaWagmiConfig?: WagmiConfig
  aljamaWagmiConfigWithConnectors?: WagmiConfig
}

function buildConnectors(module: WagmiConnectorsModule): CreateConfigParameters["connectors"] {
  const { injected, walletConnect } = module
  if (!WC_PROJECT_ID) return [injected()]
  return [
    injected(),
    walletConnect({
      projectId: WC_PROJECT_ID,
      metadata: {
        name: BRAND.name,
        description: BRAND.description,
        url: APP_URL,
        icons: [`${APP_URL}/favicon.png`],
      },
      showQrModal: true,
      qrModalOptions: {
        themeMode: "dark",
      },
    }),
  ]
}

function buildWagmiConfig(connectors: CreateConfigParameters["connectors"]): CreateConfigParameters {
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

function getWagmiConfig() {
  if (!globalForWagmi.aljamaWagmiConfig) {
    globalForWagmi.aljamaWagmiConfig = createConfig(buildWagmiConfig([]))
  }
  return globalForWagmi.aljamaWagmiConfig
}

function getWagmiConfigWithConnectors(connectors: CreateConfigParameters["connectors"]) {
  if (!globalForWagmi.aljamaWagmiConfigWithConnectors) {
    globalForWagmi.aljamaWagmiConfigWithConnectors = createConfig(buildWagmiConfig(connectors))
  }
  return globalForWagmi.aljamaWagmiConfigWithConnectors
}

export default function Web3Providers({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<WagmiConfig>(() => getWagmiConfig())
  const [queryClient] = useState(() => new QueryClient())

  useEffect(() => {
    let cancelled = false

    const loadWalletConnect = async () => {
      try {
        const connectorsModule = await import("wagmi/connectors")
        if (cancelled) return
        const connectors = buildConnectors(connectorsModule)
        setConfig(getWagmiConfigWithConnectors(connectors))
      } catch (error) {
        console.warn("walletconnect connector load failed", error)
      }
    }

    void loadWalletConnect()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <WagmiProvider config={config} reconnectOnMount={false}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}
