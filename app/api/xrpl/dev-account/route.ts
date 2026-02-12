// app/api/xrpl/dev-account/route.ts
import { getDevXrplAccount } from '@/lib/xrpl'
import { hasValidInternalToken } from '@/lib/security/internal-token'
import { isStrictMode } from '@/lib/security/runtime'
import { errorJson, okJson } from '@/lib/security/api-response'
import { logError } from '@/lib/security/logging'
import { getErrorMessage } from '@/lib/security/errors'

export async function GET(req: Request) {
  if (isStrictMode) {
    const expected = process.env.INTERNAL_API_TOKEN?.trim()
    if (!expected) {
      return errorJson(404, 'disabled', 'DISABLED')
    }
    if (!hasValidInternalToken(req, expected)) {
      return errorJson(401, 'unauthorized', 'UNAUTHORIZED')
    }
  }

  try {
    const account = await getDevXrplAccount()
    return okJson({ account })
  } catch (error: unknown) {
    logError('xrpl-dev-account', error)
    return errorJson(500, 'xrpl_error', getErrorMessage(error, 'XRPL error'))
  }
}
