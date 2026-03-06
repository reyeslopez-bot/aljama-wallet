import { errorJson } from '@/lib/security/api-response'
import { withApiRoute } from '@/lib/security/api-route'

export const dynamic = 'force-dynamic'

async function postUnavailablePqcAnchor() {
  return errorJson(
    501,
    'XRPL_PQC_ANCHOR_UNAVAILABLE',
    'XRPL PQC anchoring requires managed XRPL custody with a stored pqcBinding.',
  )
}

export const POST = withApiRoute(
  { scope: 'api:xrpl-pqc-anchor-unavailable', timeoutMs: 2_000 },
  postUnavailablePqcAnchor,
)
