import { NextResponse } from 'next/server'
import { isAddress } from 'viem'
import { getTokensByWallet } from '@/lib/getTokensByWallet'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { errorJson } from '@/lib/security/api-response'
import { logError } from '@/lib/security/logging'
import { getErrorMessage } from '@/lib/security/errors'

export async function GET(req: Request) {
  const rateKey = buildRateLimitKey(req, null)
  const limit = rateLimit({
    bucket: 'tokens-wallet',
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

  const { searchParams } = new URL(req.url)
  const address = searchParams.get('address') ?? ''
  const network = searchParams.get('network') ?? undefined
  if (!isAddress(address)) {
    return errorJson(400, 'invalid_address', 'Invalid address')
  }
  try {
    const tokens = await getTokensByWallet(address, { network })
    return NextResponse.json({ address, network, tokens })
  } catch (error) {
    const message = getErrorMessage(error, 'Failed to load tokens')
    const status = message === 'Invalid network' || message === 'Network not allowed' ? 400 : 500
    logError('tokens-wallet', error)
    return errorJson(status, 'tokens_failed', message)
  }
}
