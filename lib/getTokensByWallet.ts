import { formatUnits } from 'viem'

type TokenBalance = {
  contractAddress: string
  name: string
  symbol: string
  decimals: number
  balance: string
  rawBalance: string
  logo?: string | null
}

type AlchemyTokenBalance = {
  contractAddress: string
  tokenBalance: string
}

type TokenMetadata = {
  name?: string | null
  symbol?: string | null
  decimals?: number | null
  logo?: string | null
}

const MAX_TOKEN_LOOKUP = 50

function getAlchemyBaseUrl(network?: string) {
  const apiKey = process.env.ALCHEMY_API_KEY
  if (!apiKey) throw new Error('Missing ALCHEMY_API_KEY')
  const target = network ?? process.env.ALCHEMY_NETWORK ?? 'eth-mainnet'
  return `https://${target}.g.alchemy.com/v2/${apiKey}`
}

async function alchemyRpc<T>(baseUrl: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
    cache: 'no-store',
  })

  if (!res.ok) {
    throw new Error(`Alchemy request failed: ${res.status}`)
  }

  const data = (await res.json()) as { result?: T; error?: { message?: string } }
  if (!data.result) {
    throw new Error(data.error?.message ?? 'Alchemy response missing result')
  }
  return data.result
}

async function fetchTokenBalances(baseUrl: string, address: string): Promise<AlchemyTokenBalance[]> {
  const result = await alchemyRpc<{ tokenBalances: AlchemyTokenBalance[] }>(
    baseUrl,
    'alchemy_getTokenBalances',
    [address, 'erc20'],
  )
  return result.tokenBalances ?? []
}

async function fetchTokenMetadata(baseUrl: string, contractAddress: string): Promise<TokenMetadata> {
  return alchemyRpc<TokenMetadata>(baseUrl, 'alchemy_getTokenMetadata', [contractAddress])
}

export async function getTokensByWallet(
  address: string,
  options?: { network?: string },
): Promise<TokenBalance[]> {
  const baseUrl = getAlchemyBaseUrl(options?.network)
  const balances = await fetchTokenBalances(baseUrl, address)

  const nonZero = balances
    .filter((token) => {
      if (!token.tokenBalance) return false
      try {
        return BigInt(token.tokenBalance) > 0n
      } catch {
        return false
      }
    })
    .slice(0, MAX_TOKEN_LOOKUP)

  const entries = await Promise.all(
    nonZero.map(async (token) => {
      const metadata: TokenMetadata = await fetchTokenMetadata(baseUrl, token.contractAddress).catch(
        () => ({}),
      )
      const decimals = metadata.decimals ?? 18
      const rawBalance = token.tokenBalance

      let balance = '0'
      try {
        const asBigInt = BigInt(rawBalance)
        balance = formatUnits(asBigInt, decimals)
      } catch {
        balance = '0'
      }

      return {
        contractAddress: token.contractAddress,
        name: metadata.name ?? 'Unknown',
        symbol: metadata.symbol ?? 'TOKEN',
        decimals,
        balance,
        rawBalance,
        logo: metadata.logo ?? null,
      } satisfies TokenBalance
    }),
  )

  return entries.sort((a, b) => {
    try {
      const aVal = BigInt(a.rawBalance)
      const bVal = BigInt(b.rawBalance)
      if (aVal === bVal) return 0
      return bVal > aVal ? 1 : -1
    } catch {
      return 0
    }
  })
}
