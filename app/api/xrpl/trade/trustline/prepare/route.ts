import { isValidClassicAddress } from 'xrpl'
import { z } from 'zod'
import { getXrplClient } from '@/infra/xrpl/client'
import { getTrustedIssuersForCurrency } from '@/lib/xrpl-trusted-issuers'
import { getErrorMessage } from '@/lib/security/errors'
import { errorJson, okJson } from '@/lib/security/api-response'
import { withApiRoute } from '@/lib/security/api-route'
import { isAllowedOrigin } from '@/lib/security/origin'
import { readJsonBody } from '@/lib/security/request-body'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { requireSession } from '@/lib/security/session'
import { isXrplNetworkId, DEFAULT_XRPL_NETWORK_ID } from '@/lib/xrpl-networks'
import { doesXrplAccountExist } from '@/lib/xrpl/quote/accountExists'
import { assessXrplActionRisk } from '@/services/xrpl-risk.service'
import { logError } from '@/lib/security/logging'

const schema = z.object({
  network: z.string().optional(),
  account: z.string().min(25).max(80),
  currency: z.string().trim().min(3).max(40),
  issuer: z.string().trim().min(25).max(80).optional(),
  limit: z.string().max(50).regex(/^\d+(?:\.\d+)?$/).refine((value) => /[1-9]/.test(value)),
  idempotencyKey: z.string().uuid(),
})

async function postXrplTradeTrustlinePrepare(req: Request) {
  try {
    const session = await requireSession()
    if (!session) return errorJson(401, 'unauthorized', 'UNAUTHORIZED')
    if (!isAllowedOrigin(req)) return errorJson(403, 'invalid_origin', 'INVALID_ORIGIN')

    const rateKey = buildRateLimitKey(req, session.user.id)
    const limitState = await rateLimit({
      bucket: 'xrpl-trustline-prepare',
      key: rateKey,
      limit: 20,
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
        'rate_limited',
        { retryAfter: limitState.retryAfter },
        { headers: { 'retry-after': String(limitState.retryAfter) } },
      )
    }

    const bodyResult = await readJsonBody(req, { maxBytes: 8_192 })
    if (!bodyResult.ok) return bodyResult.response

    const parsed = schema.safeParse(bodyResult.data)
    if (!parsed.success) {
      return errorJson(400, 'invalid_payload', 'Invalid XRPL trustline prepare payload', parsed.error.format())
    }
    if (!isValidClassicAddress(parsed.data.account)) {
      return errorJson(400, 'invalid_account', 'Invalid XRPL account')
    }

    const requestedNetwork = parsed.data.network?.trim()
    if (requestedNetwork && !isXrplNetworkId(requestedNetwork)) {
      return errorJson(400, 'invalid_network', 'Invalid XRPL network')
    }
    const networkId =
      requestedNetwork && isXrplNetworkId(requestedNetwork)
        ? requestedNetwork
        : DEFAULT_XRPL_NETWORK_ID
    const currency = parsed.data.currency.toUpperCase()
    const trustedIssuers = getTrustedIssuersForCurrency(currency).issuers.filter(isValidClassicAddress)
    if (trustedIssuers.length === 0) {
      return errorJson(400, 'no_trusted_issuer', `No trusted issuer is configured for ${currency}.`)
    }

    if (!parsed.data.issuer && trustedIssuers.length > 1) {
      return okJson({ type: 'selection-required', issuers: trustedIssuers })
    }

    const issuer = parsed.data.issuer ?? trustedIssuers[0]!
    if (!trustedIssuers.includes(issuer)) {
      return errorJson(403, 'issuer_not_trusted', 'The selected issuer is not trusted for this asset.')
    }
    if (issuer === parsed.data.account) {
      return errorJson(400, 'invalid_issuer', 'A wallet cannot create a trustline to itself.')
    }

    const client = await getXrplClient(networkId)
    if (!(await doesXrplAccountExist(client, parsed.data.account))) {
      return errorJson(400, 'account_not_activated', 'Add XRP to activate this wallet on the selected network first.')
    }

    const linesResponse = await client.request({
      command: 'account_lines',
      account: parsed.data.account,
      ledger_index: 'validated',
      limit: 400,
    })
    const lines = ((linesResponse.result as { lines?: unknown[] }).lines ?? []).filter(
      (line): line is { account?: string; currency?: string; balance?: string; limit?: string } =>
        Boolean(line) && typeof line === 'object',
    )
    const existingLine = lines.find(
      (line) => line.account === issuer && line.currency?.toUpperCase() === currency,
    )
    if (existingLine) {
      return okJson({
        type: 'already-exists',
        network: networkId,
        issuer,
        currency,
        currentLimit: existingLine.limit ?? '0',
        balance: existingLine.balance ?? '0',
      })
    }

    const risk = await assessXrplActionRisk({
      walletId: parsed.data.account,
      userId: session.user.id,
      amountUnits: parsed.data.limit,
      idempotencyKey: parsed.data.idempotencyKey,
      destinationAddress: issuer,
    })
    if (risk.decision !== 'allow') {
      return errorJson(
        403,
        risk.decision === 'deny' ? 'risk_denied' : 'risk_review',
        risk.decision === 'deny' ? 'RISK_DENIED' : 'RISK_REVIEW',
        { score: risk.score, reasons: risk.reasons },
      )
    }

    return okJson({
      type: 'ready',
      network: networkId,
      account: parsed.data.account,
      issuer,
      currency,
      limit: parsed.data.limit,
      transaction: {
        TransactionType: 'TrustSet',
        Account: parsed.data.account,
        LimitAmount: {
          currency,
          issuer,
          value: parsed.data.limit,
        },
      },
    })
  } catch (error) {
    logError('xrpl-trade-trustline-prepare', error)
    return errorJson(500, 'trustline_prepare_failed', getErrorMessage(error, 'Unable to prepare XRPL trustline'))
  }
}

export const POST = withApiRoute(
  { scope: 'api:xrpl-trade-trustline-prepare', timeoutMs: 20_000 },
  postXrplTradeTrustlinePrepare,
)
