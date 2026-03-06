import { errorJson } from '@/lib/security/api-response'
import { sendWalletRequest } from '@/app/api/wallet/send/route'
import { withApiRoute } from '@/lib/security/api-route'

export const dynamic = 'force-dynamic'

async function postWalletSendById(
  req: Request,
  _routeContext: { requestId: string; startedAt: number; timeoutMs: number },
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const walletId = id?.trim()
  if (!walletId) {
    return errorJson(400, 'invalid_wallet_id', 'INVALID_WALLET_ID')
  }

  return sendWalletRequest(req, walletId)
}

export const POST = withApiRoute<[{ params: Promise<{ id: string }> }]>(
  { scope: 'api:wallet-send-by-id', timeoutMs: 20_000 },
  postWalletSendById,
)
