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
  XRPL_ISSUER_ASSET_STATUSES,
  XRPL_ISSUER_PROGRAM_STATUSES,
  upsertXrplIssuerAsset,
} from '@/services/xrpl-issuer-policy.service'

const jsonRecordSchema = z.record(z.string(), z.unknown())
const decimalStringSchema = z.string().regex(/^\d+(\.\d+)?$/)

const schema = z.object({
  network: z.string().optional(),
  issuer: z.string().min(25).max(80).optional(),
  currency: z.string().min(3).max(40),
  status: z.enum(XRPL_ISSUER_ASSET_STATUSES).optional(),
  displayName: z.string().trim().min(1).max(80).optional(),
  precision: z.number().int().min(0).max(18).optional(),
  trustlineLimit: decimalStringSchema.optional(),
  distributionsEnabled: z.boolean().optional(),
  requireHolderApproval: z.boolean().optional(),
  maxDistributionValue: decimalStringSchema.optional(),
  metadata: jsonRecordSchema.optional(),
  programName: z.string().trim().min(1).max(80).optional(),
  programStatus: z.enum(XRPL_ISSUER_PROGRAM_STATUSES).optional(),
  distributor: z.string().min(25).max(80).optional(),
  requiresAuthorizedTrustlines: z.boolean().optional(),
  allowDistributions: z.boolean().optional(),
})

function resolveRouteStatus(message: string): number {
  if (message === 'Issued currency is required' || message === 'Issued currency must not be XRP') {
    return 400
  }
  if (message === 'Invalid issuer address' || message === 'Invalid distributor address') {
    return 400
  }
  return 400
}

async function postXrplIssuerAsset(req: Request) {
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
      bucket: 'xrpl-issuer-asset-upsert',
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
      return errorJson(400, 'invalid_payload', 'Invalid issuer asset payload', parsed.error.format())
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
    const distributor = parsed.data.distributor?.trim()
      ? normalizeXrplClassicAddress(parsed.data.distributor, 'distributor address')
      : undefined
    const currency = normalizeIssuedCurrency(parsed.data.currency)

    const policy = await upsertXrplIssuerAsset({
      networkId,
      issuerAccount: issuer,
      currency,
      status: parsed.data.status,
      displayName: parsed.data.displayName,
      precision: parsed.data.precision,
      trustlineLimit: parsed.data.trustlineLimit,
      distributionsEnabled: parsed.data.distributionsEnabled,
      requireHolderApproval: parsed.data.requireHolderApproval,
      maxDistributionValue: parsed.data.maxDistributionValue,
      metadata: parsed.data.metadata,
      createdByUserId: session.user.id,
      program: {
        distributorAccount: distributor,
        status: parsed.data.programStatus,
        name: parsed.data.programName,
        requiresAuthorizedTrustlines: parsed.data.requiresAuthorizedTrustlines,
        allowDistributions: parsed.data.allowDistributions,
      },
    })

    return okJson({
      network: networkId,
      issuerProgram: policy.program,
      asset: policy.asset,
    })
  } catch (error) {
    const message = getErrorMessage(error, 'Failed to upsert issuer asset')
    return errorJson(resolveRouteStatus(message), 'issuer_asset_upsert_failed', message)
  }
}

export const POST = withApiRoute(
  { scope: 'api:xrpl-issuer-asset-upsert', timeoutMs: 10_000 },
  postXrplIssuerAsset,
)
