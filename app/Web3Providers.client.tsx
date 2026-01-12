// app/Web3Providers.client.tsx
"use client"

import "@rainbow-me/rainbowkit/styles.css"
import type { ReactNode } from "react"
import { useMemo, useState } from "react"
import { usePathname } from "next/navigation"

import { WagmiProvider, createConfig, http } from "wagmi"
import { mainnet, sepolia } from "wagmi/chains"
import { injected } from "wagmi/connectors"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { getDefaultConfig, RainbowKitProvider } from "@rainbow-me/rainbowkit"
import { BRAND } from "@/constants/brand"

const CHAINS = [mainnet, sepolia] as const

const LIGHT_CONFIG = createConfig({
  chains: CHAINS,
  ssr: false,
  connectors: [injected()],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
})

const PROJECT_ID = (process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "").trim()

const FULL_CONFIG = PROJECT_ID
  ? getDefaultConfig({
      appName: BRAND.name,
      projectId: PROJECT_ID,
      chains: CHAINS,
      ssr: false,
    })
  : LIGHT_CONFIG

export default function Web3Providers({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [queryClient] = useState(() => new QueryClient())

  const needsWalletBoot =
    pathname === "/" ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/wallet") ||
    pathname.startsWith("/swap") ||
    pathname.startsWith("/send")

  const config = needsWalletBoot ? FULL_CONFIG : LIGHT_CONFIG

  const content = useMemo(() => {
    if (!needsWalletBoot) return children
    return <RainbowKitProvider>{children}</RainbowKitProvider>
  }, [needsWalletBoot, children])


  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{content}</QueryClientProvider>
    </WagmiProvider>
  )
}
