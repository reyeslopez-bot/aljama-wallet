import { NextResponse } from 'next/server'
import { isAddress } from 'viem'
import { getTokensByWallet } from '@/lib/getTokensByWallet'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'

export async function GET(req: Request) {
  const rateKey = buildRateLimitKey(req, null)
  const limit = rateLimit({
    bucket: 'tokens-wallet',
    key: rateKey,
    limit: 60,
    windowMs: 60_000,
  })
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', retryAfter: limit.retryAfter },
      { status: 429, headers: { 'retry-after': String(limit.retryAfter) } },
    )
  }

  const { searchParams } = new URL(req.url)
  const address = searchParams.get('address') ?? ''
  const network = searchParams.get('network') ?? undefined
  if (!isAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }
  try {
    const tokens = await getTokensByWallet(address, { network })
    return NextResponse.json({ address, network, tokens })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load tokens'
    const status = message === 'Invalid network' || message === 'Network not allowed' ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
