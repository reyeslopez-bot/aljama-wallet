import { JsonRpcProvider } from 'ethers'

const globalForEvmRpc = globalThis as unknown as {
  evmRpcProvidersByUrl?: Map<string, JsonRpcProvider>
  evmRpcChainIdsByUrl?: Map<string, Promise<number>>
}

const providersByUrl = globalForEvmRpc.evmRpcProvidersByUrl ?? new Map<string, JsonRpcProvider>()
const chainIdsByUrl = globalForEvmRpc.evmRpcChainIdsByUrl ?? new Map<string, Promise<number>>()

if (!globalForEvmRpc.evmRpcProvidersByUrl) {
  globalForEvmRpc.evmRpcProvidersByUrl = providersByUrl
}
if (!globalForEvmRpc.evmRpcChainIdsByUrl) {
  globalForEvmRpc.evmRpcChainIdsByUrl = chainIdsByUrl
}

export class EvmRpcChainUnavailableError extends Error {
  readonly code = 'EVM_RPC_CHAIN_UNAVAILABLE'
  readonly requestedChainId: number

  constructor(requestedChainId: number) {
    super(`No EVM RPC provider is configured for chain ${requestedChainId}`)
    this.name = 'EvmRpcChainUnavailableError'
    this.requestedChainId = requestedChainId
  }
}

export class EvmRpcChainMismatchError extends Error {
  readonly code = 'EVM_RPC_CHAIN_MISMATCH'
  readonly requestedChainId: number
  readonly actualChainId: number

  constructor(requestedChainId: number, actualChainId: number) {
    super(`Configured EVM RPC for chain ${requestedChainId} resolved chain ${actualChainId}`)
    this.name = 'EvmRpcChainMismatchError'
    this.requestedChainId = requestedChainId
    this.actualChainId = actualChainId
  }
}

function normalizeRpcUrl(rawValue: string | null | undefined, envName: string): string | null {
  const rpcUrl = rawValue?.trim()
  if (!rpcUrl) return null
  if (process.env.NODE_ENV === 'production' && !rpcUrl.startsWith('https://')) {
    throw new Error(`${envName} must use https in production`)
  }
  return rpcUrl
}

function parseConfiguredRpcUrls(rawValue = process.env.EVM_RPC_URLS): Map<number, string> {
  const raw = rawValue?.trim()
  if (!raw) return new Map<number, string>()

  const entries = new Map<number, string>()

  for (const pair of raw.split(',')) {
    const trimmed = pair.trim()
    if (!trimmed) continue

    const separatorIndex = trimmed.indexOf(':')
    if (separatorIndex <= 0) continue

    const chainId = Number(trimmed.slice(0, separatorIndex).trim())
    const rpcUrl = normalizeRpcUrl(trimmed.slice(separatorIndex + 1), 'EVM_RPC_URLS')
    if (!Number.isInteger(chainId) || chainId <= 0 || !rpcUrl) continue

    entries.set(chainId, rpcUrl)
  }

  return entries
}

function getSingleRpcUrl(): string | null {
  return normalizeRpcUrl(process.env.EVM_RPC_URL, 'EVM_RPC_URL')
}

function getProviderForUrl(rpcUrl: string): JsonRpcProvider {
  const existing = providersByUrl.get(rpcUrl)
  if (existing) return existing

  const provider = new JsonRpcProvider(rpcUrl)
  providersByUrl.set(rpcUrl, provider)
  return provider
}

async function getChainIdForUrl(rpcUrl: string): Promise<number> {
  let pending = chainIdsByUrl.get(rpcUrl)
  if (!pending) {
    pending = getProviderForUrl(rpcUrl)
      .getNetwork()
      .then((network) => Number(network.chainId))
    chainIdsByUrl.set(rpcUrl, pending)
    pending.catch(() => {
      chainIdsByUrl.delete(rpcUrl)
    })
  }
  return pending
}

export function hasConfiguredEvmRpcMap(): boolean {
  return parseConfiguredRpcUrls().size > 0
}

export async function getAvailableEvmRpcChainIds(): Promise<number[]> {
  const configured = parseConfiguredRpcUrls()
  if (configured.size > 0) {
    const available = await Promise.all(
      Array.from(configured.entries()).map(async ([chainId, rpcUrl]) => {
        try {
          const actualChainId = await getChainIdForUrl(rpcUrl)
          return actualChainId === chainId ? chainId : null
        } catch {
          return null
        }
      }),
    )

    return available.filter((value): value is number => value !== null)
  }

  const fallbackRpcUrl = getSingleRpcUrl()
  if (!fallbackRpcUrl) return []

  try {
    return [await getChainIdForUrl(fallbackRpcUrl)]
  } catch {
    return []
  }
}

export async function getEvmProviderForChain(chainId: number): Promise<JsonRpcProvider> {
  const configured = parseConfiguredRpcUrls()
  const mappedRpcUrl = configured.get(chainId)

  if (configured.size > 0) {
    if (!mappedRpcUrl) {
      throw new EvmRpcChainUnavailableError(chainId)
    }

    const actualChainId = await getChainIdForUrl(mappedRpcUrl)
    if (actualChainId !== chainId) {
      throw new EvmRpcChainMismatchError(chainId, actualChainId)
    }

    return getProviderForUrl(mappedRpcUrl)
  }

  const fallbackRpcUrl = getSingleRpcUrl()
  if (!fallbackRpcUrl) {
    throw new EvmRpcChainUnavailableError(chainId)
  }

  const actualChainId = await getChainIdForUrl(fallbackRpcUrl)
  if (actualChainId !== chainId) {
    throw new EvmRpcChainMismatchError(chainId, actualChainId)
  }

  return getProviderForUrl(fallbackRpcUrl)
}

export function isEvmRpcChainUnavailableError(error: unknown): error is EvmRpcChainUnavailableError {
  return error instanceof EvmRpcChainUnavailableError
}

export function isEvmRpcChainMismatchError(error: unknown): error is EvmRpcChainMismatchError {
  return error instanceof EvmRpcChainMismatchError
}

export function resetEvmRpcState() {
  providersByUrl.clear()
  chainIdsByUrl.clear()
}
