import { errorJson, okJson } from '@/lib/security/api-response'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { isAllowedOrigin } from '@/lib/security/origin'
import { isAdminEmail, requireSession } from '@/lib/security/session'
import { WalletBoundaryError, getWalletSnapshotForUser } from '@/services/wallet-boundary.service'

export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
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
  const limit = await rateLimit({
    bucket: 'wallet-snapshot',
    key: rateKey,
    limit: 60,
    windowMs: 60_000,
  })
  if (!limit.ok) {
    return errorJson(
      429,
      'rate_limited',
      'RATE_LIMITED',
      { retryAfter: limit.retryAfter },
      { headers: { 'retry-after': String(limit.retryAfter) } },
    )
  }

  const { id } = await context.params
  const walletId = id?.trim()
  if (!walletId) {
    return errorJson(400, 'invalid_wallet_id', 'INVALID_WALLET_ID')
  }

  try {
    const snapshot = await getWalletSnapshotForUser({
      walletId,
      userId: session.user.id,
      isAdmin: isAdminEmail(session.user?.email ?? null),
    })
    return okJson({ wallet: snapshot })
  } catch (error) {
    if (error instanceof WalletBoundaryError) {
      if (error.code === 'FORBIDDEN') {
        return errorJson(403, 'forbidden', 'FORBIDDEN')
      }
      if (error.code === 'NOT_FOUND') {
        return errorJson(404, 'wallet_not_found', 'WALLET_NOT_FOUND')
      }
    }
    return errorJson(500, 'wallet_snapshot_failed', 'WALLET_SNAPSHOT_FAILED')
  }
}
