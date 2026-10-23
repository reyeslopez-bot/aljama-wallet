import { z } from 'zod'
import { prismaPg } from '@/lib/prisma-pg'
import { errorJson, okJson } from '@/lib/security/api-response'
import { withApiRoute } from '@/lib/security/api-route'
import { isAllowedOrigin } from '@/lib/security/origin'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { readJsonBody } from '@/lib/security/request-body'

const consentSchema = z.object({
  receiptId: z.string().uuid(),
  consentVersion: z.string().regex(/^\d{4}-\d{2}$/),
  telemetryGranted: z.boolean(),
  locationGranted: z.boolean(),
}).strict()

async function getConsentReceipts(req: Request) {
  if (!process.env.PG_DATABASE_URL && !process.env.POSTGRES_URL) {
    return errorJson(503, 'consent_evidence_unavailable', 'PERSISTENT_CONSENT_STORAGE_REQUIRED')
  }
  if (!isAllowedOrigin(req)) return errorJson(403, 'invalid_origin', 'INVALID_ORIGIN')

  const receiptId = z.string().uuid().safeParse(req.headers.get('x-consent-receipt-id'))
  if (!receiptId.success) return errorJson(400, 'invalid_consent_receipt_id', 'INVALID_CONSENT_RECEIPT_ID')
  const limit = await rateLimit({
    bucket: 'privacy-consent-evidence-read',
    key: buildRateLimitKey(req, receiptId.data),
    limit: 30,
    windowMs: 10 * 60_000,
  })
  if (!limit.ok) {
    return errorJson(429, 'rate_limited', 'RATE_LIMITED', { retryAfter: limit.retryAfter }, {
      headers: { 'retry-after': String(limit.retryAfter) },
    })
  }

  const receipts = await prismaPg.consentReceipt.findMany({
    where: { receiptId: receiptId.data },
    select: {
      id: true,
      consentVersion: true,
      telemetryGranted: true,
      locationGranted: true,
      changeType: true,
      previousTelemetry: true,
      previousLocation: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return okJson({ receipts: receipts.reverse() })
}

async function postConsentReceipt(req: Request) {
  if (!process.env.PG_DATABASE_URL && !process.env.POSTGRES_URL) {
    return errorJson(503, 'consent_evidence_unavailable', 'PERSISTENT_CONSENT_STORAGE_REQUIRED')
  }
  if (!isAllowedOrigin(req)) return errorJson(403, 'invalid_origin', 'INVALID_ORIGIN')

  const limit = await rateLimit({
    bucket: 'privacy-consent-evidence',
    key: buildRateLimitKey(req, null),
    limit: 30,
    windowMs: 10 * 60_000,
  })
  if (!limit.ok) {
    return errorJson(429, 'rate_limited', 'RATE_LIMITED', { retryAfter: limit.retryAfter }, {
      headers: { 'retry-after': String(limit.retryAfter) },
    })
  }

  const bodyResult = await readJsonBody(req, { maxBytes: 1_024 })
  if (!bodyResult.ok) return bodyResult.response
  const parsed = consentSchema.safeParse(bodyResult.data)
  if (!parsed.success) {
    return errorJson(400, 'invalid_consent_receipt', 'INVALID_CONSENT_RECEIPT', parsed.error.format())
  }

  const { receiptId, consentVersion, telemetryGranted, locationGranted } = parsed.data
  const receipt = await prismaPg.$transaction(async (tx) => {
    const previous = await tx.consentReceipt.findFirst({
      where: { receiptId },
      select: { telemetryGranted: true, locationGranted: true },
      orderBy: { createdAt: 'desc' },
    })
    const revoked =
      Boolean(previous?.telemetryGranted && !telemetryGranted) ||
      Boolean(previous?.locationGranted && !locationGranted)
    const changeType = previous ? (revoked ? 'withdrawn' : 'changed') : 'initial'

    return tx.consentReceipt.create({
      data: {
        receiptId,
        consentVersion,
        telemetryGranted,
        locationGranted,
        changeType,
        previousTelemetry: previous?.telemetryGranted ?? null,
        previousLocation: previous?.locationGranted ?? null,
      },
      select: { id: true, consentVersion: true, changeType: true, createdAt: true },
    })
  })
  return okJson({ receipt })
}

export const POST = withApiRoute(
  { scope: 'api:privacy-consent', timeoutMs: 5_000 },
  postConsentReceipt,
)
export const GET = withApiRoute(
  { scope: 'api:privacy-consent-read', timeoutMs: 5_000 },
  getConsentReceipts,
)
