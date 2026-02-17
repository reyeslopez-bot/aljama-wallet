import { isValidClassicAddress } from 'xrpl'
import { requireSession } from '@/lib/security/session'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { errorJson, okJson } from '@/lib/security/api-response'
import { getErrorMessage } from '@/lib/security/errors'
import { logError } from '@/lib/security/logging'
import { DEFAULT_XRPL_NETWORK_ID, isXrplNetworkId } from '@/lib/xrpl-networks'
import { getXrplSignerAddress } from '@/lib/xrpl-signer'
import { getXrplAccountAssets } from '@/lib/xrpl-issued-assets'

export async function GET(req: Request) {
  try {
    const session = await requireSession()
    if (!session) {
      return errorJson(401, 'unauthorized', 'UNAUTHORIZED')
    }

    const rateKey = buildRateLimitKey(req, session.user.id)
    const limit = rateLimit({
      bucket: 'xrpl-account-assets',
      key: rateKey,
      limit: 60,
      windowMs: 60_000,
    })
    if (!limit.ok) {
      return errorJson(
        429,
        'rate_limited',
        'RATE_LIMITED',
        { retryAfter: limit.retryAfter },
        { headers: { 'retry-after': String(limit.retryAfter) } },
      )
    }

    const { searchParams } = new URL(req.url)
    const requestedNetwork = searchParams.get('network')
    if (requestedNetwork && !isXrplNetworkId(requestedNetwork)) {
      return errorJson(400, 'invalid_network', 'Invalid XRPL network')
    }

    const accountParam = searchParams.get('account')
    const account = accountParam?.trim() ? accountParam.trim() : getXrplSignerAddress()
    if (!isValidClassicAddress(account)) {
      return errorJson(400, 'invalid_account', 'Invalid XRPL account')
    }

    const networkId = requestedNetwork && isXrplNetworkId(requestedNetwork)
      ? requestedNetwork
      : DEFAULT_XRPL_NETWORK_ID

    const assets = await getXrplAccountAssets({
      networkId,
      account,
    })

    return okJson(assets)
  } catch (error) {
    logError('xrpl-account-assets', error)
    return errorJson(500, 'xrpl_assets_failed', getErrorMessage(error, 'Failed to load XRPL assets'))
  }
}
