// app/api/xrpl/dev-account/route.ts
import { getDevXrplAccount } from '@/lib/xrpl'
import { hasValidInternalToken } from '@/lib/security/internal-token'
import { isStrictMode } from '@/lib/security/runtime'
import { errorJson, okJson } from '@/lib/security/api-response'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { logError } from '@/lib/security/logging'
import { getErrorMessage } from '@/lib/security/errors'
import { isXrplNetworkId, DEFAULT_XRPL_NETWORK_ID } from '@/lib/xrpl-networks'

export async function GET(req: Request) {
  const rateKey = buildRateLimitKey(req, null)
  const limitState = await rateLimit({
    bucket: 'xrpl-dev-account',
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

  if (isStrictMode) {
    const expected = process.env.INTERNAL_API_TOKEN?.trim()
    if (!expected) {
      return errorJson(404, 'disabled', 'DISABLED')
    }
    if (!hasValidInternalToken(req, expected)) {
      return errorJson(401, 'unauthorized', 'UNAUTHORIZED')
    }
  }

  try {
    const { searchParams } = new URL(req.url)
    const requestedNetwork = searchParams.get('network')
    if (requestedNetwork && !isXrplNetworkId(requestedNetwork)) {
      return errorJson(400, 'invalid_network', 'Invalid XRPL network')
    }

    const networkId =
      requestedNetwork && isXrplNetworkId(requestedNetwork)
        ? requestedNetwork
        : DEFAULT_XRPL_NETWORK_ID
    const account = await getDevXrplAccount(networkId)
    return okJson({ account, network: networkId })
  } catch (error: unknown) {
    logError('xrpl-dev-account', error)
    return errorJson(500, 'xrpl_error', getErrorMessage(error, 'XRPL error'))
  }
}
