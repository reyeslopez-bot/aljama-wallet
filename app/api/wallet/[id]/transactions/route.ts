import { errorJson, okJson } from '@/lib/security/api-response'
import { withApiRoute } from '@/lib/security/api-route'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { isAllowedOrigin } from '@/lib/security/origin'
import { isAdminEmail, requireSession } from '@/lib/security/session'
import { WalletBoundaryError, getWalletTransactionsForUser } from '@/services/wallet-boundary.service'

export const dynamic = 'force-dynamic'

const DEFAULT_LIMIT = 25

function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_LIMIT
  return parsed
}

function parseCursor(raw: string | null): Date | null {
  if (!raw) return null
  const cursor = new Date(raw)
  if (Number.isNaN(cursor.getTime())) return null
  return cursor
}

async function getWalletTransactions(
  req: Request,
  _routeContext: { requestId: string; startedAt: number; timeoutMs: number },
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireSession()
  if (!session) {
    return errorJson(401, 'unauthorized', 'UNAUTHORIZED')
  }
  if (!isAllowedOrigin(req)) {
    return errorJson(403, 'invalid_origin', 'INVALID_ORIGIN')
  }

  const rateKey = buildRateLimitKey(req, session.user.id)
  const limitResult = await rateLimit({
    bucket: 'wallet-transactions',
    key: rateKey,
    limit: 120,
    windowMs: 60_000,
  })
  if (!limitResult.ok) {
    return errorJson(
      429,
      'rate_limited',
      'RATE_LIMITED',
      { retryAfter: limitResult.retryAfter },
      { headers: { 'retry-after': String(limitResult.retryAfter) } },
    )
  }

  const { id } = await context.params
  const walletId = id?.trim()
  if (!walletId) {
    return errorJson(400, 'invalid_wallet_id', 'INVALID_WALLET_ID')
  }

  const { searchParams } = new URL(req.url)
  const limit = parseLimit(searchParams.get('limit'))
  const cursorRaw = searchParams.get('cursor')
  const cursor = parseCursor(cursorRaw)
  if (cursorRaw && !cursor) {
    return errorJson(400, 'invalid_cursor', 'INVALID_CURSOR')
  }

  try {
    const page = await getWalletTransactionsForUser({
      walletId,
      userId: session.user.id,
      isAdmin: isAdminEmail(session.user?.email ?? null),
      limit,
      cursor,
    })
    return okJson(page)
  } catch (error) {
    if (error instanceof WalletBoundaryError) {
      if (error.code === 'FORBIDDEN') {
        return errorJson(403, 'forbidden', 'FORBIDDEN')
      }
      if (error.code === 'NOT_FOUND') {
        return errorJson(404, 'wallet_not_found', 'WALLET_NOT_FOUND')
      }
    }
    return errorJson(500, 'wallet_transactions_failed', 'WALLET_TRANSACTIONS_FAILED')
  }
}

export const GET = withApiRoute<[{ params: Promise<{ id: string }> }]>(
  { scope: 'api:wallet-transactions', timeoutMs: 10_000 },
  getWalletTransactions,
)
