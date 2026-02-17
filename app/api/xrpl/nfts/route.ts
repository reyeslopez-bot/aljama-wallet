import { isValidClassicAddress } from 'xrpl'
import { z } from 'zod'
import { requireSession } from '@/lib/security/session'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { errorJson, okJson } from '@/lib/security/api-response'
import { getErrorMessage } from '@/lib/security/errors'
import { logError } from '@/lib/security/logging'
import { getXrplClient } from '@/infra/xrpl/client'
import { DEFAULT_XRPL_NETWORK_ID, isXrplNetworkId } from '@/lib/xrpl-networks'
import { decodeHexUri, fetchNftMetadata } from '@/lib/xrpl-nft-metadata'
import { getXrplSignerAddress } from '@/lib/xrpl-signer'

const querySchema = z.object({
  network: z.string().optional(),
  account: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  marker: z.string().optional(),
})

export async function GET(req: Request) {
  try {
    const session = await requireSession()
    if (!session) {
      return errorJson(401, 'unauthorized', 'UNAUTHORIZED')
    }

    const rateKey = buildRateLimitKey(req, session.user.id)
    const limitState = rateLimit({
      bucket: 'xrpl-nfts',
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

    const rawParams = Object.fromEntries(new URL(req.url).searchParams.entries())
    const parsed = querySchema.safeParse(rawParams)
    if (!parsed.success) {
      return errorJson(400, 'invalid_query', 'Invalid NFT query', parsed.error.format())
    }

    const requestedNetwork = parsed.data.network?.trim()
    if (requestedNetwork && !isXrplNetworkId(requestedNetwork)) {
      return errorJson(400, 'invalid_network', 'Invalid XRPL network')
    }
    const networkId = requestedNetwork && isXrplNetworkId(requestedNetwork)
      ? requestedNetwork
      : DEFAULT_XRPL_NETWORK_ID

    const account = parsed.data.account?.trim() || getXrplSignerAddress()
    if (!isValidClassicAddress(account)) {
      return errorJson(400, 'invalid_account', 'Invalid XRPL account')
    }

    const client = await getXrplClient(networkId)
    const response = await client.request({
      command: 'account_nfts',
      account,
      limit: parsed.data.limit ?? 20,
      ...(parsed.data.marker ? { marker: parsed.data.marker } : {}),
    })

    const result = response.result as {
      account_nfts?: Array<{
        NFTokenID?: string
        URI?: string
        Flags?: number
        Issuer?: string
        NFTokenTaxon?: number
        TransferFee?: number
      }>
      marker?: unknown
    }

    const nfts = await Promise.all(
      (result.account_nfts ?? []).map(async (item) => {
        const uri = decodeHexUri(item.URI)
        const metadata = await fetchNftMetadata(uri)
        return {
          nftokenId: item.NFTokenID ?? null,
          uri,
          issuer: item.Issuer ?? null,
          taxon: item.NFTokenTaxon ?? null,
          transferFee: item.TransferFee ?? null,
          flags: item.Flags ?? null,
          metadata,
        }
      }),
    )

    return okJson({
      network: networkId,
      account,
      marker: result.marker ?? null,
      nfts,
    })
  } catch (error) {
    logError('xrpl-nfts', error)
    return errorJson(500, 'xrpl_nfts_failed', getErrorMessage(error, 'Failed to load XRPL NFTs'))
  }
}
