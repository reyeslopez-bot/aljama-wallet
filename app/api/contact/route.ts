import { z } from 'zod'
import { createContactRequest } from '@/services/contact-request.service'
import { deliverContactNotifications } from '@/services/contact-notification.service'
import { CONTACT_CATEGORY_VALUES, getSupportReplyWindow } from '@/lib/support/contact'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { errorJson, okJson } from '@/lib/security/api-response'
import { readJsonBody } from '@/lib/security/request-body'
import { isAllowedOrigin } from '@/lib/security/origin'
import { logError } from '@/lib/security/logging'
import { getErrorMessage } from '@/lib/security/errors'
import { withApiRoute, type ApiRouteContext } from '@/lib/security/api-route'
import { getSession } from '@/lib/security/session'

const contactSchema = z.object({
  name: z.string().trim().min(1).max(120).optional().nullable(),
  email: z.string().email().max(256),
  category: z.enum(CONTACT_CATEGORY_VALUES),
  message: z.string().trim().min(10).max(4_000),
  locale: z.string().trim().min(2).max(16).optional().nullable(),
  source: z.string().trim().max(64).optional().nullable(),
  pagePath: z.string().trim().max(256).optional().nullable(),
})

async function postContact(
  req: Request,
  routeContext: Pick<ApiRouteContext, 'requestId' | 'traceId'>,
) {
  try {
    if (!isAllowedOrigin(req)) {
      return errorJson(403, 'invalid_origin', 'INVALID_ORIGIN')
    }

    const session = await getSession().catch((error) => {
      logError('contact:session', error, {
        requestId: routeContext.requestId,
        traceId: routeContext.traceId,
      })
      return null
    })

    const rateKey = buildRateLimitKey(req, session?.user?.id ?? null)
    const limit = await rateLimit({
      bucket: 'contact',
      key: rateKey,
      limit: 10,
      windowMs: 60_000,
      ...(process.env.NODE_ENV === 'production' ? { requireDistributed: true as const } : {}),
    })
    if (!limit.ok) {
      if (limit.failureKind === 'backend_unavailable') {
        return errorJson(
          503,
          'rate_limit_backend_unavailable',
          'RATE_LIMIT_BACKEND_UNAVAILABLE',
          { retryAfter: limit.retryAfter },
          { headers: { 'retry-after': String(limit.retryAfter) } },
        )
      }

      return errorJson(
        429,
        'rate_limited',
        'RATE_LIMITED',
        { retryAfter: limit.retryAfter },
        { headers: { 'retry-after': String(limit.retryAfter) } },
      )
    }

    const bodyResult = await readJsonBody(req, { maxBytes: 8_192 })
    if (!bodyResult.ok) {
      return bodyResult.response
    }

    const parsed = contactSchema.safeParse(bodyResult.data)
    if (!parsed.success) {
      return errorJson(400, 'invalid_payload', 'Invalid contact payload', parsed.error.format())
    }

    const record = await createContactRequest({
      userId: session?.user?.id ?? null,
      name: parsed.data.name ?? null,
      email: parsed.data.email,
      category: parsed.data.category,
      message: parsed.data.message,
      locale: parsed.data.locale ?? null,
      source: parsed.data.source ?? null,
      pagePath: parsed.data.pagePath ?? null,
      requestId: routeContext.requestId,
      traceId: routeContext.traceId,
    })

    let confirmationEmailSent = false
    try {
      const notifications = await deliverContactNotifications(record)
      confirmationEmailSent = notifications.confirmationEmailSent
    } catch (error) {
      logError('contact:notifications', error, {
        referenceId: record.id,
        requestId: routeContext.requestId,
        traceId: routeContext.traceId,
      })
    }

    return okJson({
      referenceId: record.id,
      replyWindow: getSupportReplyWindow(),
      receivedAt: record.createdAt.toISOString(),
      confirmationEmailSent,
    })
  } catch (error) {
    logError('contact', error, {
      requestId: routeContext.requestId,
      traceId: routeContext.traceId,
    })
    return errorJson(500, 'contact_failed', getErrorMessage(error, 'Failed to save contact request'))
  }
}

export const POST = withApiRoute({ scope: 'api:contact', timeoutMs: 10_000 }, postContact)
