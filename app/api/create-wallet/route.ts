// app/api/create-wallet/route.ts
import { NextResponse } from 'next/server'
import { createEncryptedWallet } from '@/lib/wallet'
import { createWalletRecord, deleteWalletRecord } from '@/services/wallet.service'
import { requireSession } from '@/lib/security/session'
import { isAllowedOrigin } from '@/lib/security/origin'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { isStrictMode } from '@/lib/security/runtime'
import { linkWalletToUser } from '@/services/wallet-ownership.service'

const MIN_PASSWORD_LENGTH = 12

function missingCreateWalletConfig(): string[] {
  const missing: string[] = []
  const versionRaw = process.env.WALLET_ENCRYPTION_KEY_ACTIVE_VERSION ?? '1'
  const version = Number(versionRaw)
  const keyVar = `WALLET_ENCRYPTION_KEY_V${version}`
  const fingerprintVar = `WALLET_ENCRYPTION_KEY_FINGERPRINT_V${version}`

  if (!Number.isInteger(version) || version <= 0) {
    missing.push('WALLET_ENCRYPTION_KEY_ACTIVE_VERSION')
  } else {
    if (!process.env[keyVar]) missing.push(keyVar)
    if (!process.env[fingerprintVar]) missing.push(fingerprintVar)
  }

  if (!process.env.CRDB_DATABASE_URL && !process.env.COCKROACH_URL) {
    missing.push('CRDB_DATABASE_URL/COCKROACH_URL')
  }

  return missing
}

export async function POST(req: Request) {
  try {
    const session = await requireSession()
    if (!session) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
    }

    if (!isAllowedOrigin(req)) {
      return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 })
    }

    const rateKey = buildRateLimitKey(req, session.user?.id ?? null)
    const limit = rateLimit({
      bucket: 'create-wallet',
      key: rateKey,
      limit: 10,
      windowMs: 60_000,
    })
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'RATE_LIMITED', retryAfter: limit.retryAfter },
        { status: 429, headers: { 'retry-after': String(limit.retryAfter) } },
      )
    }

    const { password } = await req.json()

    if (!password || typeof password !== 'string' || !password.trim()) {
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400 },
      )
    }

    if (password.trim().length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 },
      )
    }

    const missing = missingCreateWalletConfig()
    if (missing.length > 0 && isStrictMode) {
      return NextResponse.json(
        { error: 'SERVER_MISCONFIGURED' },
        { status: 503 },
      )
    }

    const { encrypted, wallet } = await createEncryptedWallet(password)

    if (missing.length > 0) {
      return NextResponse.json({
        walletId: null,
        address: wallet.address,
        encrypted,
        mode: 'session-only',
        warning: `Missing server config: ${missing.join(', ')}`,
      })
    }

    let record: Awaited<ReturnType<typeof createWalletRecord>>
    try {
      record = await createWalletRecord({
        address: wallet.address,
        privateKey: wallet.privateKey,
      })
    } catch (dbError) {
      if (process.env.NODE_ENV !== 'production') {
        const reason = dbError instanceof Error ? dbError.message : 'DB write failed'
        return NextResponse.json({
          walletId: null,
          address: wallet.address,
          encrypted,
          mode: 'session-only',
          warning: `Custody write failed: ${reason}`,
        })
      }
      throw dbError
    }

    try {
      await linkWalletToUser(session.user.id, record.id)
    } catch (linkError) {
      console.error('wallet ownership link failed', linkError)
      try {
        await deleteWalletRecord(record.id)
      } catch (cleanupError) {
        console.error('wallet cleanup failed', cleanupError)
      }

      return NextResponse.json(
        { error: 'Failed to link wallet ownership' },
        { status: 500 },
      )
    }

    return NextResponse.json({
      walletId: record.id,
      address: wallet.address,
      encrypted, // canonical thing the client stores
      mode: 'custody',
      // no privateKey / mnemonic over the wire
    })
  } catch (error) {
    console.error('create-wallet error', error)
    const message =
      process.env.NODE_ENV === 'production'
        ? 'Failed to create wallet'
        : error instanceof Error
          ? error.message
          : 'Failed to create wallet'
    return NextResponse.json(
      { error: message },
      { status: 500 },
    )
  }
}
