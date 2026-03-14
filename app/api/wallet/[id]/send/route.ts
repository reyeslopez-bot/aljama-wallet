import { errorJson } from '@/lib/security/api-response'
import { sendWalletRequest } from '@/app/api/wallet/send/route'
import { withApiRoute, type ApiRouteContext } from '@/lib/security/api-route'

export const dynamic = 'force-dynamic'

async function postWalletSendById(
  req: Request,
  routeContext: Pick<ApiRouteContext, 'requestId' | 'traceId' | 'correlationId'>,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const walletId = id?.trim()
  if (!walletId) {
    return errorJson(400, 'invalid_wallet_id', 'INVALID_WALLET_ID')
  }

  return sendWalletRequest(req, walletId, {
    ...routeContext,
    routePath: '/api/wallet/[id]/send',
  })
}

export const POST = withApiRoute<[{ params: Promise<{ id: string }> }]>(
  { scope: 'api:wallet-send-by-id', timeoutMs: 20_000 },
  postWalletSendById,
)
