// infra/wagmi/wagmi.ts
'use client'

import { createConfig, http } from 'wagmi'
import { mainnet, sepolia } from 'wagmi/chains'               // <= not viem/chains
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors'

const ALCHEMY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY
const WC_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID

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
    ...(WC_ID ? [walletConnect({ projectId: WC_ID })] : []),
    coinbaseWallet({ appName: 'Aljama Wallet' }),
  ],
  ssr: true,
})
