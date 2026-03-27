import { getAvailableEvmRpcChainIds } from '@/lib/evm-rpc'

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

export async function resolveWalletSendSupportedChainIds(): Promise<number[]> {
  const rpcChainIds = await getAvailableEvmRpcChainIds()
  if (rpcChainIds.length === 0) return []
  const allowedChainIds = parseWalletAllowedChainIds()
  if (allowedChainIds.length === 0) return rpcChainIds

  return rpcChainIds.filter((chainId) => allowedChainIds.includes(chainId))
}
