// app/api/create-wallet/route.ts
import { NextResponse } from 'next/server'
import { createEncryptedWallet } from '@/lib/wallet'
import { createWalletRecord, deleteWalletRecord } from '@/services/wallet.service'
import { requireSession } from '@/lib/security/session'
import { isAllowedOrigin } from '@/lib/security/origin'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { isStrictMode } from '@/lib/security/runtime'
import { linkWalletToUser } from '@/services/wallet-ownership.service'
import { errorJson } from '@/lib/security/api-response'
import { readJsonBody } from '@/lib/security/request-body'
import { logError } from '@/lib/security/logging'
import { getErrorMessage } from '@/lib/security/errors'

const MIN_PASSWORD_LENGTH = 16
const UPPERCASE_PATTERN = /[A-Z]/
const LOWERCASE_PATTERN = /[a-z]/
const NUMBER_PATTERN = /[0-9]/
const SPECIAL_PATTERN = /[!@#$%^&*]/
const COMMON_WORD_PATTERN = /(password|wallet|crypto|qwerty|letmein|admin|secret)/i
const REPEATED_PATTERN = /(.)\1{2,}/
const SEQUENCE_PATTERN = /(0123|1234|2345|3456|4567|5678|6789|7890|abcd|bcde|cdef|defg|qwer|asdf|zxcv)/i

function validatePassphrase(value: string): { code: string; message: string } | null {
  const passphrase = value.trim()
  if (passphrase.length < MIN_PASSWORD_LENGTH) {
    return {
      code: 'password_too_short',
      message: `Passphrase must be at least ${MIN_PASSWORD_LENGTH} characters`,
    }
  }
  if (!UPPERCASE_PATTERN.test(passphrase)) {
    return { code: 'password_missing_uppercase', message: 'Passphrase must include an uppercase letter' }
  }
  if (!LOWERCASE_PATTERN.test(passphrase)) {
    return { code: 'password_missing_lowercase', message: 'Passphrase must include a lowercase letter' }
  }
  if (!NUMBER_PATTERN.test(passphrase)) {
    return { code: 'password_missing_number', message: 'Passphrase must include a number' }
  }
  if (!SPECIAL_PATTERN.test(passphrase)) {
    return { code: 'password_missing_special', message: 'Passphrase must include a special character (!@#$%^&*)' }
  }
  if (COMMON_WORD_PATTERN.test(passphrase) || REPEATED_PATTERN.test(passphrase) || SEQUENCE_PATTERN.test(passphrase)) {
    return { code: 'password_predictable_pattern', message: 'Passphrase contains predictable patterns' }
  }
  return null
}

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
      return errorJson(401, 'unauthorized', 'UNAUTHORIZED')
    }

    if (!isAllowedOrigin(req)) {
      return errorJson(403, 'invalid_origin', 'INVALID_ORIGIN')
    }

    const rateKey = buildRateLimitKey(req, session.user?.id ?? null)
    const limit = await rateLimit({
      bucket: 'create-wallet',
      key: rateKey,
      limit: 10,
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

    const bodyResult = await readJsonBody<{ password?: unknown }>(req, { maxBytes: 4_096 })
    if (!bodyResult.ok) {
      return bodyResult.response
    }

    const { password } = bodyResult.data

    if (!password || typeof password !== 'string' || !password.trim()) {
      return errorJson(400, 'password_required', 'Password is required')
    }

    const validationError = validatePassphrase(password)
    if (validationError) {
      return errorJson(400, validationError.code, validationError.message)
    }

    const missing = missingCreateWalletConfig()
    if (missing.length > 0 && isStrictMode) {
      return errorJson(503, 'server_misconfigured', 'SERVER_MISCONFIGURED')
    }

    const passphrase = password.trim()
    const { encrypted, wallet } = await createEncryptedWallet(passphrase)

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
        const reason = getErrorMessage(dbError, 'DB write failed')
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
      logError('create-wallet:ownership', linkError)
      try {
        await deleteWalletRecord(record.id)
      } catch (cleanupError) {
        logError('create-wallet:cleanup', cleanupError)
      }

      return errorJson(500, 'ownership_link_failed', 'Failed to link wallet ownership')
    }

    return NextResponse.json({
      walletId: record.id,
      address: wallet.address,
      encrypted, // canonical thing the client stores
      mode: 'custody',
      // no privateKey / mnemonic over the wire
    })
  } catch (error) {
    logError('create-wallet', error)
    const message =
      process.env.NODE_ENV === 'production'
        ? 'Failed to create wallet'
        : getErrorMessage(error, 'Failed to create wallet')
    return errorJson(500, 'create_wallet_failed', message)
  }
}
