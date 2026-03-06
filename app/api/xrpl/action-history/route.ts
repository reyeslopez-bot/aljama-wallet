import { requireSession } from '@/lib/security/session'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { errorJson, okJson } from '@/lib/security/api-response'
import { withApiRoute } from '@/lib/security/api-route'
import { DEFAULT_XRPL_NETWORK_ID, isXrplNetworkId } from '@/lib/xrpl-networks'
import { listXrplActions } from '@/services/xrpl-action-log.service'

async function getXrplActionHistory(req: Request) {
  const session = await requireSession()
  if (!session) {
    return errorJson(401, 'unauthorized', 'UNAUTHORIZED')
  }

  const rateKey = buildRateLimitKey(req, session.user.id)
  const limitState = await rateLimit({
    bucket: 'xrpl-action-history',
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

  const { searchParams } = new URL(req.url)
  const requestedNetwork = searchParams.get('network')
  if (requestedNetwork && !isXrplNetworkId(requestedNetwork)) {
    return errorJson(400, 'invalid_network', 'Invalid XRPL network')
  }

  const rawLimit = Number(searchParams.get('limit') ?? 20)
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 20
  const records = await listXrplActions({
    limit,
    networkId: requestedNetwork ?? DEFAULT_XRPL_NETWORK_ID,
  })

  return okJson({
    actions: records,
    network: requestedNetwork ?? DEFAULT_XRPL_NETWORK_ID,
  })
}

export const GET = withApiRoute(
  { scope: 'api:xrpl-action-history', timeoutMs: 10_000 },
  getXrplActionHistory,
)
