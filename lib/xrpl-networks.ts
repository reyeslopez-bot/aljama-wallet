export type XrplNetworkId =
  | 'mainnet'
  | 'testnet'
  | 'devnet'
  | 'xahau-testnet'
  | 'batch-devnet'
  | 'lending-devnet'

export type XrplNetwork = {
  id: XrplNetworkId
  name: string
  isProduction: boolean
  wsUrl: string
  rpcUrl: string
  explorerUrl: string
  faucetUrl: string | null
  warning: string | null
  canResetWithoutWarning: boolean
}

export const DEFAULT_XRPL_NETWORK_ID: XrplNetworkId = 'testnet'

export const XRPL_NETWORKS: readonly XrplNetwork[] = [
  {
    id: 'mainnet',
    name: 'Mainnet',
    isProduction: true,
    wsUrl: 'wss://xrplcluster.com',
    rpcUrl: 'https://s1.ripple.com:51234',
    explorerUrl: 'https://livenet.xrpl.org',
    faucetUrl: null,
    warning: 'Real funds network. Transactions are final and use real XRP.',
    canResetWithoutWarning: false,
  },
  {
    id: 'testnet',
    name: 'Testnet',
    isProduction: false,
    wsUrl: 'wss://s.altnet.rippletest.net:51233/',
    rpcUrl: 'https://s.altnet.rippletest.net:51234/',
    explorerUrl: 'https://testnet.xrpl.org',
    faucetUrl: 'https://xrpl.org/resources/dev-tools/xrp-faucets',
    warning: null,
    canResetWithoutWarning: false,
  },
  {
    id: 'devnet',
    name: 'Devnet',
    isProduction: false,
    wsUrl: 'wss://s.devnet.rippletest.net:51233/',
    rpcUrl: 'https://s.devnet.rippletest.net:51234/',
    explorerUrl: 'https://devnet.xrpl.org',
    faucetUrl: 'https://xrpl.org/resources/dev-tools/xrp-faucets',
    warning: 'Preview network for upcoming amendments. Network behavior can change quickly.',
    canResetWithoutWarning: true,
  },
  {
    id: 'xahau-testnet',
    name: 'Xahau Testnet',
    isProduction: false,
    wsUrl: 'wss://xahau-test.net/',
    rpcUrl: 'https://xahau-test.net/',
    explorerUrl: 'https://xahau-test.net/',
    faucetUrl: null,
    warning: 'Separate Xahau test network with Hooks support (not XRPL main chain).',
    canResetWithoutWarning: true,
  },
  {
    id: 'batch-devnet',
    name: 'Batch Devnet',
    isProduction: false,
    wsUrl: 'wss://batch.nerdnest.xyz',
    rpcUrl: 'https://batch.rpc.nerdnest.xyz',
    explorerUrl: 'https://batch.nerdnest.xyz',
    faucetUrl: null,
    warning: 'Specialized network for XLS-56d batch transaction previews.',
    canResetWithoutWarning: true,
  },
  {
    id: 'lending-devnet',
    name: 'Lending Devnet',
    isProduction: false,
    wsUrl: 'wss://lend.devnet.rippletest.net:51233/',
    rpcUrl: 'https://lend.devnet.rippletest.net:51234/',
    explorerUrl: 'https://lend.devnet.rippletest.net:51234/',
    faucetUrl: null,
    warning: 'Specialized network for XLS-66d lending previews.',
    canResetWithoutWarning: true,
  },
] as const

export const XRPL_NETWORKS_BY_ID: Record<XrplNetworkId, XrplNetwork> = Object.fromEntries(
  XRPL_NETWORKS.map((network) => [network.id, network]),
) as Record<XrplNetworkId, XrplNetwork>

export function isXrplNetworkId(value: string): value is XrplNetworkId {
  return value in XRPL_NETWORKS_BY_ID
}

export function resolveXrplNetwork(id: string | null | undefined): XrplNetwork {
  if (id && isXrplNetworkId(id)) return XRPL_NETWORKS_BY_ID[id]
  return XRPL_NETWORKS_BY_ID[DEFAULT_XRPL_NETWORK_ID]
}
