import { z } from 'zod'
import { prismaPg } from '@/lib/prisma-pg'
import { usePgAuth } from '@/lib/auth/store'
import { errorJson, okJson } from '@/lib/security/api-response'
import { withApiRoute } from '@/lib/security/api-route'
import { isAllowedOrigin } from '@/lib/security/origin'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { readJsonBody } from '@/lib/security/request-body'
import { isAdminEmail, requireSession } from '@/lib/security/session'

const STATUS_TRANSITIONS: Record<string, string[]> = {
  received: ['under_review', 'rejected'],
  under_review: ['fulfilled', 'rejected'],
  fulfilled: [],
  rejected: [],
}

const createRequestSchema = z.object({
  type: z.enum(['access', 'rectification', 'erasure']),
  description: z.string().trim().max(2_000).optional(),
}).strict()

const updateRequestSchema = z.object({
  id: z.string().trim().min(1).max(128),
  status: z.enum(['under_review', 'fulfilled', 'rejected']),
  resolution: z.string().trim().min(10).max(2_000).optional(),
}).strict()

async function getPrivacyRequests(req: Request) {
  const session = await requireSession()
  if (!session?.user?.id) return errorJson(401, 'unauthorized', 'UNAUTHORIZED')
  if (!usePgAuth()) {
    return errorJson(503, 'privacy_requests_unavailable', 'PERSISTENT_ACCOUNT_STORAGE_REQUIRED')
  }

  const admin = isAdminEmail(session.user.email)
  const limit = await rateLimit({
    bucket: 'privacy-requests-read',
    key: buildRateLimitKey(req, session.user.id),
    limit: admin ? 60 : 20,
    windowMs: 60_000,
  })
  if (!limit.ok) {
    return errorJson(429, 'rate_limited', 'RATE_LIMITED', { retryAfter: limit.retryAfter }, {
      headers: { 'retry-after': String(limit.retryAfter) },
    })
  }

  const requests = await prismaPg.privacyRequest.findMany({
    where: admin ? undefined : { userId: session.user.id },
    select: {
      id: true,
      userId: true,
      type: true,
      description: true,
      status: true,
      resolution: true,
      resolvedAt: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  if (!admin || requests.length === 0) return okJson({ requests, isAdmin: admin })

  const events = await prismaPg.privacyRequestEvent.findMany({
    where: { requestId: { in: requests.map(({ id }) => id) } },
    select: {
      id: true,
      requestId: true,
      changedByUserId: true,
      fromStatus: true,
      toStatus: true,
      resolution: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })
  return okJson({ requests, statusEvents: events, isAdmin: true })
}

async function createPrivacyRequest(req: Request) {
  const session = await requireSession()
  if (!session?.user?.id) return errorJson(401, 'unauthorized', 'UNAUTHORIZED')
  if (!usePgAuth()) {
    return errorJson(503, 'privacy_requests_unavailable', 'PERSISTENT_ACCOUNT_STORAGE_REQUIRED')
  }
  if (!isAllowedOrigin(req)) return errorJson(403, 'invalid_origin', 'INVALID_ORIGIN')

  const limit = await rateLimit({
    bucket: 'privacy-requests-create',
    key: buildRateLimitKey(req, session.user.id),
    limit: 5,
    windowMs: 60 * 60_000,
  })
  if (!limit.ok) {
    return errorJson(429, 'rate_limited', 'RATE_LIMITED', { retryAfter: limit.retryAfter }, {
      headers: { 'retry-after': String(limit.retryAfter) },
    })
  }

  const bodyResult = await readJsonBody(req, { maxBytes: 4_096 })
  if (!bodyResult.ok) return bodyResult.response
  const parsed = createRequestSchema.safeParse(bodyResult.data)
  if (!parsed.success) {
    return errorJson(400, 'invalid_privacy_request', 'INVALID_PRIVACY_REQUEST', parsed.error.format())
  }

  const created = await prismaPg.$transaction(async (tx) => {
    const request = await tx.privacyRequest.create({
      data: {
        userId: session.user.id,
        type: parsed.data.type,
        description: parsed.data.description || null,
      },
      select: {
        id: true,
        type: true,
        description: true,
        status: true,
        createdAt: true,
      },
    })
    await tx.privacyRequestEvent.create({
      data: {
        requestId: request.id,
        changedByUserId: session.user.id,
        fromStatus: null,
        toStatus: 'received',
      },
    })
    return request
  })
  return okJson({ request: created }, { status: 201 })
}

async function updatePrivacyRequest(req: Request) {
  const session = await requireSession()
  if (!session?.user?.id) return errorJson(401, 'unauthorized', 'UNAUTHORIZED')
  if (!isAdminEmail(session.user.email)) return errorJson(403, 'forbidden', 'FORBIDDEN')
  if (!usePgAuth()) {
    return errorJson(503, 'privacy_requests_unavailable', 'PERSISTENT_ACCOUNT_STORAGE_REQUIRED')
  }
  if (!isAllowedOrigin(req)) return errorJson(403, 'invalid_origin', 'INVALID_ORIGIN')

  const limit = await rateLimit({
    bucket: 'privacy-requests-update',
    key: buildRateLimitKey(req, session.user.id),
    limit: 30,
    windowMs: 60_000,
  })
  if (!limit.ok) {
    return errorJson(429, 'rate_limited', 'RATE_LIMITED', { retryAfter: limit.retryAfter }, {
      headers: { 'retry-after': String(limit.retryAfter) },
    })
  }

  const bodyResult = await readJsonBody(req, { maxBytes: 4_096 })
  if (!bodyResult.ok) return bodyResult.response
  const parsed = updateRequestSchema.safeParse(bodyResult.data)
  if (!parsed.success) {
    return errorJson(400, 'invalid_privacy_request_update', 'INVALID_PRIVACY_REQUEST_UPDATE', parsed.error.format())
  }
  if (
    (parsed.data.status === 'fulfilled' || parsed.data.status === 'rejected') &&
    !parsed.data.resolution
  ) {
    return errorJson(400, 'resolution_required', 'RESOLUTION_REQUIRED')
  }

  const result = await prismaPg.$transaction(async (tx) => {
    const current = await tx.privacyRequest.findUnique({
      where: { id: parsed.data.id },
      select: { id: true, status: true },
    })
    if (!current) return { kind: 'not_found' as const }
    if (!STATUS_TRANSITIONS[current.status]?.includes(parsed.data.status)) {
      return { kind: 'invalid_transition' as const }
    }

    const changed = await tx.privacyRequest.updateMany({
      where: { id: current.id, status: current.status },
      data: {
        status: parsed.data.status,
        resolution: parsed.data.resolution ?? null,
        resolvedAt: ['fulfilled', 'rejected'].includes(parsed.data.status) ? new Date() : null,
      },
    })
    if (changed.count !== 1) return { kind: 'conflict' as const }

    await tx.privacyRequestEvent.create({
      data: {
        requestId: current.id,
        changedByUserId: session.user.id,
        fromStatus: current.status,
        toStatus: parsed.data.status,
        resolution: parsed.data.resolution ?? null,
      },
    })
    return { kind: 'updated' as const }
  })

  if (result.kind === 'not_found') return errorJson(404, 'privacy_request_not_found', 'PRIVACY_REQUEST_NOT_FOUND')
  if (result.kind === 'conflict') return errorJson(409, 'privacy_request_conflict', 'PRIVACY_REQUEST_CONFLICT')
  if (result.kind === 'invalid_transition') {
    return errorJson(409, 'invalid_status_transition', 'INVALID_STATUS_TRANSITION')
  }
  return okJson({ ok: true })
}

export const GET = withApiRoute({ scope: 'api:privacy-requests', timeoutMs: 10_000 }, getPrivacyRequests)
export const POST = withApiRoute({ scope: 'api:privacy-requests:create', timeoutMs: 10_000 }, createPrivacyRequest)
export const PATCH = withApiRoute({ scope: 'api:privacy-requests:update', timeoutMs: 10_000 }, updatePrivacyRequest)
