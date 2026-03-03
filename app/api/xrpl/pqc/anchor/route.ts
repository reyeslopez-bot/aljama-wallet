import { errorJson } from '@/lib/security/api-response'

export const dynamic = 'force-dynamic'

export async function POST() {
  return errorJson(
    501,
    'XRPL_PQC_ANCHOR_UNAVAILABLE',
    'XRPL PQC anchoring requires managed XRPL custody with a stored pqcBinding.',
  )
}
