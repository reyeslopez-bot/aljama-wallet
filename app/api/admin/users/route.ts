import { z } from 'zod'
import { prismaPg } from '@/lib/prisma-pg'
import { usePgAuth } from '@/lib/auth/store'
import { errorJson, okJson } from '@/lib/security/api-response'
import { withApiRoute } from '@/lib/security/api-route'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { isAdminEmail, requireSession } from '@/lib/security/session'

const PAGE_SIZE = 100
const querySchema = z.object({
  cursor: z.string().trim().min(1).max(128).optional(),
}).strict()

async function getAdminUsers(req: Request) {
  const session = await requireSession()
  if (!session?.user?.id) return errorJson(401, 'unauthorized', 'UNAUTHORIZED')
  if (!isAdminEmail(session.user.email)) return errorJson(403, 'forbidden', 'FORBIDDEN')
  if (!usePgAuth()) {
    return errorJson(503, 'admin_users_unavailable', 'PERSISTENT_ACCOUNT_STORAGE_REQUIRED')
  }

  const limit = await rateLimit({
    bucket: 'admin-users-read',
    key: buildRateLimitKey(req, session.user.id),
    limit: 30,
    windowMs: 60_000,
  })
  if (!limit.ok) {
    return errorJson(429, 'rate_limited', 'RATE_LIMITED', { retryAfter: limit.retryAfter }, {
      headers: { 'retry-after': String(limit.retryAfter) },
    })
  }

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return errorJson(400, 'invalid_query', 'INVALID_QUERY')

  const rows = await prismaPg.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      createdAt: true,
      lastLoginAt: true,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: PAGE_SIZE + 1,
    ...(parsed.data.cursor ? { cursor: { id: parsed.data.cursor }, skip: 1 } : {}),
  })
  const hasMore = rows.length > PAGE_SIZE
  const users = rows.slice(0, PAGE_SIZE)
  return okJson({
    users,
    nextCursor: hasMore ? users[users.length - 1]?.id ?? null : null,
  })
}

export const GET = withApiRoute({ scope: 'api:admin-users', timeoutMs: 10_000 }, getAdminUsers)
