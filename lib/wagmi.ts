'use client'

import { configureChains, createConfig } from 'wagmi'
import { mainnet, sepolia } from 'wagmi/chains'
import { publicProvider } from 'wagmi/providers/public'

// Configure your chains and providers
const { chains, publicClient } = configureChains(
    [mainnet, sepolia],
    [publicProvider()]
)

// Export the wagmi config for use in layout.tsx
export const wagmiConfig = createConfig({
    autoConnect: true,
    publicClient,
})

// Optional: export chains if you'll need them in wallet UI or RainbowKit
export { chains }

