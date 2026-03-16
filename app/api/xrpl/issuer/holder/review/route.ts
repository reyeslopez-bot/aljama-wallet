import { z } from 'zod'
import { requireSession } from '@/lib/security/session'
import { isAllowedOrigin } from '@/lib/security/origin'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { errorJson, okJson } from '@/lib/security/api-response'
import { withApiRoute } from '@/lib/security/api-route'
import { readJsonBody } from '@/lib/security/request-body'
import { getErrorMessage } from '@/lib/security/errors'
import { DEFAULT_XRPL_NETWORK_ID, isXrplNetworkId } from '@/lib/xrpl-networks'
import { normalizeIssuedCurrency, normalizeXrplClassicAddress } from '@/lib/xrpl-issuer'
import { getXrplSignerAccount } from '@/lib/xrpl-signer'
import {
  XRPL_ISSUER_REVIEWABLE_HOLDER_STATUSES,
  reviewXrplIssuerHolder,
} from '@/services/xrpl-issuer-policy.service'

const jsonRecordSchema = z.record(z.string(), z.unknown())

const schema = z.object({
  network: z.string().optional(),
  issuer: z.string().min(25).max(80).optional(),
  currency: z.string().min(3).max(40),
  holder: z.string().min(25).max(80),
  status: z.enum(XRPL_ISSUER_REVIEWABLE_HOLDER_STATUSES),
  notes: z.string().trim().max(500).optional(),
  reviewContext: jsonRecordSchema.optional(),
})

function resolveRouteStatus(message: string): number {
  if (
    message === 'Issued currency is required' ||
    message === 'Issued currency must not be XRP' ||
    message === 'Invalid issuer address' ||
    message === 'Invalid holder address'
  ) {
    return 400
  }
  if (
    message === 'Issuer asset is not registered' ||
    message === 'Issuer program is not active' ||
    message === 'Issuer asset is not active'
  ) {
    return 409
  }
  return 400
}

async function postXrplIssuerHolderReview(req: Request) {
  try {
    const session = await requireSession()
    if (!session) {
      return errorJson(401, 'unauthorized', 'UNAUTHORIZED')
    }
    if (!isAllowedOrigin(req)) {
      return errorJson(403, 'invalid_origin', 'INVALID_ORIGIN')
    }

    const rateKey = buildRateLimitKey(req, session.user.id)
    const limitState = await rateLimit({
      bucket: 'xrpl-issuer-holder-review',
      key: rateKey,
      limit: 30,
      windowMs: 60_000,
      ...(process.env.NODE_ENV === 'production' ? { requireDistributed: true as const } : {}),
    })
    if (!limitState.ok) {
      if (limitState.failureKind === 'backend_unavailable') {
        return errorJson(503, 'rate_limit_backend_unavailable', 'RATE_LIMIT_BACKEND_UNAVAILABLE')
      }
      return errorJson(429, 'rate_limited', 'RATE_LIMITED')
    }

    const bodyResult = await readJsonBody(req, { maxBytes: 16_384 })
    if (!bodyResult.ok) {
      return bodyResult.response
    }

    const parsed = schema.safeParse(bodyResult.data)
    if (!parsed.success) {
      return errorJson(400, 'invalid_payload', 'Invalid issuer holder review payload', parsed.error.format())
    }

    const requestedNetwork = parsed.data.network?.trim()
    if (requestedNetwork && !isXrplNetworkId(requestedNetwork)) {
      return errorJson(400, 'invalid_network', 'Invalid XRPL network')
    }
    const networkId =
      requestedNetwork && isXrplNetworkId(requestedNetwork)
        ? requestedNetwork
        : DEFAULT_XRPL_NETWORK_ID

    const signer = getXrplSignerAccount()
    const issuer = parsed.data.issuer?.trim()
      ? normalizeXrplClassicAddress(parsed.data.issuer, 'issuer address')
      : signer.address
    const holder = normalizeXrplClassicAddress(parsed.data.holder, 'holder address')
    const currency = normalizeIssuedCurrency(parsed.data.currency)

    const review = await reviewXrplIssuerHolder({
      networkId,
      issuerAccount: issuer,
      currency,
      holderAddress: holder,
      status: parsed.data.status,
      approvedByUserId: session.user.id,
      notes: parsed.data.notes,
      reviewContext: parsed.data.reviewContext,
    })

    return okJson({
      network: networkId,
      issuer,
      currency,
      holder: review,
    })
  } catch (error) {
    const message = getErrorMessage(error, 'Failed to review issuer holder')
    return errorJson(resolveRouteStatus(message), 'issuer_holder_review_failed', message)
  }
}

export const POST = withApiRoute(
  { scope: 'api:xrpl-issuer-holder-review', timeoutMs: 10_000 },
  postXrplIssuerHolderReview,
)
