import { z } from 'zod'
import { requireSession } from '@/lib/security/session'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { errorJson, okJson } from '@/lib/security/api-response'
import { logError } from '@/lib/security/logging'
import { getErrorMessage } from '@/lib/security/errors'
import { getXrplClient } from '@/infra/xrpl/client'
import { DEFAULT_XRPL_NETWORK_ID, isXrplNetworkId } from '@/lib/xrpl-networks'

const currencySchema = z.object({
  currency: z.string().min(3).max(40),
  issuer: z.string().min(25).max(80).optional(),
})

function toBookCurrency(input: z.infer<typeof currencySchema>) {
  const currency = input.currency.trim().toUpperCase()
  if (currency === 'XRP') {
    return { currency: 'XRP' }
  }
  return {
    currency,
    issuer: input.issuer?.trim() ?? '',
  }
}

function parseRequest(url: string) {
  const { searchParams } = new URL(url)
  const limitRaw = Number(searchParams.get('limit') ?? 20)
  const takeLimit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 20

  const takerGets = currencySchema.parse({
    currency: searchParams.get('takerGetsCurrency') ?? '',
    issuer: searchParams.get('takerGetsIssuer') ?? undefined,
  })
  const takerPays = currencySchema.parse({
    currency: searchParams.get('takerPaysCurrency') ?? '',
    issuer: searchParams.get('takerPaysIssuer') ?? undefined,
  })

  if (takerGets.currency.trim().toUpperCase() !== 'XRP' && !takerGets.issuer?.trim()) {
    throw new Error('Issuer required for non-XRP takerGets')
  }
  if (takerPays.currency.trim().toUpperCase() !== 'XRP' && !takerPays.issuer?.trim()) {
    throw new Error('Issuer required for non-XRP takerPays')
  }

  const network = searchParams.get('network')
  if (network && !isXrplNetworkId(network)) {
    throw new Error('Invalid XRPL network')
  }

  return {
    limit: takeLimit,
    takerGets,
    takerPays,
    networkId: network && isXrplNetworkId(network) ? network : DEFAULT_XRPL_NETWORK_ID,
  }
}

export async function GET(req: Request) {
  try {
    const session = await requireSession()
    if (!session) {
      return errorJson(401, 'unauthorized', 'UNAUTHORIZED')
    }

    const rateKey = buildRateLimitKey(req, session.user.id)
    const limitState = await rateLimit({
      bucket: 'xrpl-orderbook',
      key: rateKey,
      limit: 60,
      windowMs: 60_000,
    })
    if (!limitState.ok) {
      return errorJson(
        429,
        'rate_limited',
        'RATE_LIMITED',
        { retryAfter: limitState.retryAfter },
        { headers: { 'retry-after': String(limitState.retryAfter) } },
      )
    }

    const parsed = parseRequest(req.url)
    const client = await getXrplClient(parsed.networkId)
    const response = await client.request({
      command: 'book_offers',
      taker_gets: toBookCurrency(parsed.takerGets),
      taker_pays: toBookCurrency(parsed.takerPays),
      limit: parsed.limit,
    })

    const offers = ((response.result as { offers?: unknown[] }).offers ?? []) as Array<{
      Account?: string
      Sequence?: number
      TakerGets?: unknown
      TakerPays?: unknown
      quality?: string
      owner_funds?: string
    }>

    return okJson({
      network: parsed.networkId,
      pair: {
        takerGets: toBookCurrency(parsed.takerGets),
        takerPays: toBookCurrency(parsed.takerPays),
      },
      offers: offers.map((offer) => ({
        account: offer.Account ?? null,
        sequence: offer.Sequence ?? null,
        takerGets: offer.TakerGets ?? null,
        takerPays: offer.TakerPays ?? null,
        quality: offer.quality ?? null,
        ownerFunds: offer.owner_funds ?? null,
      })),
    })
  } catch (error) {
    const message = getErrorMessage(error, 'Failed to load XRPL order book')
    const status =
      message === 'Invalid XRPL network' ||
      message === 'Issuer required for non-XRP takerGets' ||
      message === 'Issuer required for non-XRP takerPays'
        ? 400
        : 500
    if (status === 500) {
      logError('xrpl-orderbook', error)
    }
    return errorJson(status, 'xrpl_orderbook_failed', message)
  }
}
