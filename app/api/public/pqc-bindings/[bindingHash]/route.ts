import { errorJson, okJson } from '@/lib/security/api-response'
import { withApiRoute } from '@/lib/security/api-route'
import { getWalletByPqcBindingHash } from '@/services/wallet.service'

export const dynamic = 'force-dynamic'

async function getPublicPqcBinding(
  _req: Request,
  _routeContext: { requestId: string; startedAt: number; timeoutMs: number },
  context: { params: Promise<{ bindingHash: string }> },
) {
  const { bindingHash } = await context.params
  const normalizedBindingHash = bindingHash?.trim()

  if (!normalizedBindingHash) {
    return errorJson(400, 'invalid_binding_hash', 'INVALID_BINDING_HASH')
  }

  const wallet = await getWalletByPqcBindingHash(normalizedBindingHash)
  if (!wallet?.pqcBinding) {
    return errorJson(404, 'binding_not_found', 'BINDING_NOT_FOUND')
  }

  return okJson({
    bindingHash: normalizedBindingHash,
    binding: wallet.pqcBinding,
  })
}

export const GET = withApiRoute<[{ params: Promise<{ bindingHash: string }> }]>(
  { scope: 'api:public-pqc-binding', timeoutMs: 5_000 },
  getPublicPqcBinding,
)
