import { isValidClassicAddress } from 'xrpl'
import { z } from 'zod'
import { getXrplClient } from '@/infra/xrpl/client'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { errorJson, okJson } from '@/lib/security/api-response'
import { withApiRoute } from '@/lib/security/api-route'
import { logError } from '@/lib/security/logging'
import { getErrorMessage } from '@/lib/security/errors'
import { DEFAULT_XRPL_NETWORK_ID, isXrplNetworkId } from '@/lib/xrpl-networks'
import { isXrplAccountNotFoundError } from '@/lib/xrpl-errors'
import { doesXrplAccountExist } from '@/lib/xrpl/quote/accountExists'
import { getPublicXrplSwapQuote } from '@/lib/xrpl/quote/publicQuote'
import { getXrplSignerAccount } from '@/lib/xrpl-signer'
import { quoteXrplSwap } from '@/services/xrpl-swap.service'

const MAX_SLIPPAGE_BPS = 5_000

const querySchema = z.object({
  network: z.string().optional(),
  account: z.string().optional(),
  sourceCurrency: z.string().min(3).max(40),
  sourceIssuer: z.string().min(25).max(80).optional(),
  sourceValue: z.string().regex(/^\d+(\.\d+)?$/),
  destinationCurrency: z.string().min(3).max(40),
  destinationIssuer: z.string().min(25).max(80).optional(),
  slippageBps: z.coerce.number().int().min(0).max(MAX_SLIPPAGE_BPS).optional(),
})

function resolveRouteStatus(message: string): number {
  if (
    message === 'Invalid swap slippage bps' ||
    message === 'Source and destination assets must differ' ||
    message === 'No XRPL swap path found' ||
    message === 'Invalid XRPL swap amount' ||
    message === 'Currency is required' ||
    message.startsWith('Issuer required for non-XRP') ||
    message.startsWith('No trusted ')
  ) {
    return 400
  }
  if (/Missing XRPL signer seed/i.test(message)) {
    return 503
  }
  return 500
}

function isMissingSignerConfigError(error: unknown): boolean {
  return /Missing XRPL signer/i.test(getErrorMessage(error, ''))
}

function shouldFallbackToPublicQuote(error: unknown): boolean {
  const message = getErrorMessage(error, '')
  return (
    isXrplAccountNotFoundError(error) ||
    isMissingSignerConfigError(error) ||
    /^No trusted .* balance is available in this wallet/i.test(message) ||
    /^No trusted .* trustline is configured in this wallet/i.test(message) ||
    /^No trusted swap path found/i.test(message) ||
    message === 'No XRPL swap path found'
  )
}

async function getXrplTradeSwapQuote(req: Request) {
  let networkId = DEFAULT_XRPL_NETWORK_ID
  let accountAddress: string | null = null
  let accountExists = false
  let sourceCurrency: string | null = null
  let sourceIssuer: string | null = null
  let sourceValue: string | null = null
  let destinationCurrency: string | null = null
  let destinationIssuer: string | null = null

  try {
    const rateKey = buildRateLimitKey(req)
    const limitState = await rateLimit({
      bucket: 'xrpl-swap-quote',
      key: rateKey,
      limit: 60,
      windowMs: 60_000,
      ...(process.env.NODE_ENV === 'production' ? { requireDistributed: true as const } : {}),
    })
    if (!limitState.ok) {
      if (limitState.failureKind === 'backend_unavailable') {
        return errorJson(
          503,
          'rate_limit_backend_unavailable',
          'RATE_LIMIT_BACKEND_UNAVAILABLE',
          { retryAfter: limitState.retryAfter },
          { headers: { 'retry-after': String(limitState.retryAfter) } },
        )
      }
      return errorJson(
        429,
        'rate_limited',
        'RATE_LIMITED',
        { retryAfter: limitState.retryAfter },
        { headers: { 'retry-after': String(limitState.retryAfter) } },
      )
    }

    const { searchParams } = new URL(req.url)
    const parsed = querySchema.safeParse({
      network: searchParams.get('network') ?? undefined,
      account: searchParams.get('account') ?? undefined,
      sourceCurrency: searchParams.get('sourceCurrency') ?? '',
      sourceIssuer: searchParams.get('sourceIssuer') ?? undefined,
      sourceValue: searchParams.get('sourceValue') ?? '',
      destinationCurrency: searchParams.get('destinationCurrency') ?? '',
      destinationIssuer: searchParams.get('destinationIssuer') ?? undefined,
      slippageBps: searchParams.get('slippageBps') ?? undefined,
    })
    if (!parsed.success) {
      return errorJson(400, 'invalid_query', 'Invalid XRPL swap quote query', parsed.error.format())
    }

    const requestedNetwork = parsed.data.network?.trim()
    if (requestedNetwork && !isXrplNetworkId(requestedNetwork)) {
      return errorJson(400, 'invalid_network', 'Invalid XRPL network')
    }
    networkId =
      requestedNetwork && isXrplNetworkId(requestedNetwork)
        ? requestedNetwork
        : DEFAULT_XRPL_NETWORK_ID
    sourceCurrency = parsed.data.sourceCurrency
    sourceIssuer = parsed.data.sourceIssuer ?? null
    sourceValue = parsed.data.sourceValue
    destinationCurrency = parsed.data.destinationCurrency
    destinationIssuer = parsed.data.destinationIssuer ?? null

    const requestedAccount = parsed.data.account?.trim() ?? ''
    if (requestedAccount) {
      if (!isValidClassicAddress(requestedAccount)) {
        return errorJson(400, 'invalid_account', 'Invalid XRPL account')
      }
      accountAddress = requestedAccount
    } else {
      try {
        accountAddress = getXrplSignerAccount().address
      } catch (error) {
        if (!isMissingSignerConfigError(error)) {
          throw error
        }
      }
    }

    const client = await getXrplClient(networkId)
    accountExists = accountAddress ? await doesXrplAccountExist(client, accountAddress) : false

    const publicQuoteInput = {
      client,
      networkId,
      sourceAmount: {
        currency: parsed.data.sourceCurrency,
        issuer: parsed.data.sourceIssuer,
        value: parsed.data.sourceValue,
      },
      destinationAsset: {
        currency: parsed.data.destinationCurrency,
        issuer: parsed.data.destinationIssuer,
      },
      slippageBps: parsed.data.slippageBps,
    }

    const quote =
      accountAddress && accountExists
        ? await quoteXrplSwap({
          networkId,
          account: accountAddress,
          sourceAmount: publicQuoteInput.sourceAmount,
          destinationAsset: publicQuoteInput.destinationAsset,
          slippageBps: parsed.data.slippageBps,
        }).catch(async (error) => {
          if (!shouldFallbackToPublicQuote(error)) {
            throw error
          }
          return getPublicXrplSwapQuote(publicQuoteInput)
        })
        : await getPublicXrplSwapQuote(publicQuoteInput)

    const quoteMode = 'quoteMode' in quote ? quote.quoteMode : 'account'
    const liquiditySource = 'liquiditySource' in quote ? quote.liquiditySource : 'path_find'
    const routeKind = 'routeKind' in quote ? quote.routeKind : 'direct'
    const hops = 'hops' in quote ? quote.hops : []

    return okJson({
      network: networkId,
      account: accountAddress,
      accountExists,
      quoteMode,
      quote: {
        sourceAmount: quote.sourceAmount,
        quotedSourceAmount: quote.quotedSourceAmount,
        destinationAmount: quote.destinationAmount,
        deliverMin: quote.deliverMin,
        pathCount: quote.pathCount,
        alternativeCount: quote.alternativeCount,
        fullReply: quote.fullReply,
        slippageBps: quote.slippageBps,
        sourceSelection: quote.sourceSelection,
        destinationSelection: quote.destinationSelection,
        liquiditySource,
        quoteMode,
        routeKind,
        hops,
      },
    })
  } catch (error) {
    const errorDetails = {
      account: accountAddress,
      accountExists,
      network: networkId,
      sourceCurrency,
      sourceIssuer,
      sourceValue,
      destinationCurrency,
      destinationIssuer,
    }

    if (isXrplAccountNotFoundError(error)) {
      return errorJson(
        400,
        'account_not_funded',
        `XRPL account must be funded on ${networkId} before requesting a swap quote.`,
        {
          ...errorDetails,
          needsFunding: true,
        },
      )
    }

    const message = getErrorMessage(error, 'Failed to quote XRPL swap')
    const status = resolveRouteStatus(message)
    if (status >= 500) {
      logError('xrpl-trade-swap-quote', error, errorDetails)
    }
    return errorJson(status, 'xrpl_swap_quote_failed', message)
  }
}

export const GET = withApiRoute(
  { scope: 'api:xrpl-trade-swap-quote', timeoutMs: 10_000 },
  getXrplTradeSwapQuote,
)
