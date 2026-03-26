import { JsonRpcProvider } from 'ethers'

const globalForWalletSendConfig = globalThis as unknown as {
  walletSendRpcChainIdByUrl?: Map<string, Promise<number>>
}

const rpcChainIdByUrl = globalForWalletSendConfig.walletSendRpcChainIdByUrl ?? new Map<string, Promise<number>>()
if (!globalForWalletSendConfig.walletSendRpcChainIdByUrl) {
  globalForWalletSendConfig.walletSendRpcChainIdByUrl = rpcChainIdByUrl
}

function normalizeRpcUrl(rawValue: string | null | undefined): string | null {
  const rpcUrl = rawValue?.trim()
  if (!rpcUrl) return null
  if (process.env.NODE_ENV === 'production' && !rpcUrl.startsWith('https://')) {
    throw new Error('EVM_RPC_URL must use https in production')
  }
  return rpcUrl
}

async function readRpcChainId(rpcUrl: string): Promise<number> {
  let pending = rpcChainIdByUrl.get(rpcUrl)
  if (!pending) {
    pending = new JsonRpcProvider(rpcUrl)
      .getNetwork()
      .then((network) => Number(network.chainId))
    rpcChainIdByUrl.set(rpcUrl, pending)
    pending.catch(() => {
      rpcChainIdByUrl.delete(rpcUrl)
    })
  }
  return pending
}

export function parseWalletAllowedChainIds(rawValue = process.env.WALLET_ALLOWED_CHAIN_IDS): number[] {
  if (!rawValue?.trim()) return []

  return Array.from(
    new Set(
      rawValue
        .split(',')
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  )
}

export function getOptionalEvmRpcUrl(): string | null {
  try {
    return normalizeRpcUrl(process.env.EVM_RPC_URL)
  } catch {
    return null
  }
}

export function requireEvmRpcUrl(): string {
  const rpcUrl = normalizeRpcUrl(process.env.EVM_RPC_URL)
  if (!rpcUrl) throw new Error('Missing EVM_RPC_URL')
  return rpcUrl
}

export async function resolveWalletSendSupportedChainIds(): Promise<number[]> {
  const rpcUrl = getOptionalEvmRpcUrl()
  if (!rpcUrl) return []

  let rpcChainId: number
  try {
    rpcChainId = await readRpcChainId(rpcUrl)
  } catch {
    return []
  }

  const allowedChainIds = parseWalletAllowedChainIds()
  if (allowedChainIds.length === 0) {
    return [rpcChainId]
  }

  return allowedChainIds.includes(rpcChainId) ? [rpcChainId] : []
}
