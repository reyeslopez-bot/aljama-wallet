import { errorJson, okJson } from '@/lib/security/api-response'
import { withApiRoute } from '@/lib/security/api-route'
import { isAdminEmail, requireSession } from '@/lib/security/session'
import { getWalletSigningIntent } from '@/services/signing-intent.service'
import { userOwnsWallet } from '@/services/wallet-ownership.service'

async function getWalletSigningIntentStatus(
  _req: Request,
  _routeContext: { requestId: string; startedAt: number; timeoutMs: number },
  context: { params: Promise<{ intentId: string }> },
) {
  const session = await requireSession()
  if (!session) {
    return errorJson(401, 'unauthorized', 'UNAUTHORIZED')
  }

  const { intentId } = await context.params
  const normalizedIntentId = intentId?.trim()
  if (!normalizedIntentId) {
    return errorJson(400, 'invalid_intent_id', 'INVALID_INTENT_ID')
  }

  const intent = await getWalletSigningIntent(normalizedIntentId)
  if (!intent) {
    return errorJson(404, 'intent_not_found', 'INTENT_NOT_FOUND')
  }

  const isAdmin = isAdminEmail(session.user?.email ?? null)
  if (!isAdmin) {
    const owns = await userOwnsWallet(session.user.id, intent.walletId)
    if (!owns) {
      return errorJson(403, 'forbidden', 'FORBIDDEN')
    }
  }

  return okJson({
    intentId: intent.id,
    status: intent.status,
    walletId: intent.walletId,
    chainId: intent.chainId,
    idempotencyKey: intent.idempotencyKey,
    correlationId: intent.correlationId,
    transferLogId: intent.transferLogId,
    txHash: intent.txHash,
    errorCode: intent.errorCode,
    createdAt: new Date(intent.createdAt).toISOString(),
    updatedAt: new Date(intent.updatedAt).toISOString(),
  })
}

export const GET = withApiRoute<[{ params: Promise<{ intentId: string }> }]>(
  { scope: 'api:wallet-signing-intent', timeoutMs: 15_000 },
  getWalletSigningIntentStatus,
)
