// infra/wagmi/wagmi.ts
'use client'

import { http } from 'viem'
import { mainnet, sepolia } from 'viem/chains'
import { createConfig } from 'wagmi'
import { injected, coinbaseWallet } from 'wagmi/connectors'

const ALCHEMY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY

const mainnetTransport = ALCHEMY
  ? http(`https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY}`)
  : http()

const sepoliaTransport = ALCHEMY
  ? http(`https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY}`)
  : http()

export const config = createConfig({
  chains: [mainnet, sepolia],
  transports: {
    [mainnet.id]: mainnetTransport,
    [sepolia.id]: sepoliaTransport,
  },
  connectors: [
    injected(),
    coinbaseWallet({ appName: 'Aljama Wallet' }),
  ],
  ssr: false,
})
