import { errorJson } from '@/lib/security/api-response'
import { sendWalletRequest } from '@/app/api/wallet/send/route'

export const dynamic = 'force-dynamic'

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const walletId = id?.trim()
  if (!walletId) {
    return errorJson(400, 'invalid_wallet_id', 'INVALID_WALLET_ID')
  }

  return sendWalletRequest(req, walletId)
}
