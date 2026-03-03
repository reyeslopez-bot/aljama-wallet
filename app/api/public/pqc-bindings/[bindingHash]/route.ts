import { errorJson, okJson } from '@/lib/security/api-response'
import { getWalletByPqcBindingHash } from '@/services/wallet.service'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
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
