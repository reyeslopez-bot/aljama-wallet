import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockPrepareManagedWalletProvisioning = vi.fn()
const mockPersistPreparedWallet = vi.fn()
const mockDeleteWalletRecord = vi.fn()
const mockLinkWalletToUser = vi.fn()
const mockGetServerSession = vi.fn()
const mockIsAllowedOrigin = vi.fn()
const mockBuildRateLimitKey = vi.fn()
const mockRateLimit = vi.fn()

vi.mock('@/services/signer.service', () => ({
  prepareManagedWalletProvisioning: mockPrepareManagedWalletProvisioning,
}))

vi.mock('@/services/wallet.service', () => ({
  deleteWalletRecord: mockDeleteWalletRecord,
}))

vi.mock('@/services/wallet-ownership.service', () => ({
  linkWalletToUser: mockLinkWalletToUser,
}))

vi.mock('next-auth/next', () => ({
  getServerSession: mockGetServerSession,
}))

vi.mock('@/lib/security/origin', () => ({
  isAllowedOrigin: mockIsAllowedOrigin,
}))

vi.mock('@/lib/security/rate-limit', () => ({
  buildRateLimitKey: mockBuildRateLimitKey,
  rateLimit: mockRateLimit,
}))

function buildRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/create-wallet', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('app/api/create-wallet route', () => {
  const strongPassphrase = 'T7!qL2@rP5#tV8$mN3&xH4'

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockIsAllowedOrigin.mockReturnValue(true)
    mockBuildRateLimitKey.mockReturnValue('ip:127.0.0.1')
    mockRateLimit.mockResolvedValue({ ok: true, remaining: 9, resetAt: Date.now() + 60_000 })
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1', email: 'user@example.com' } })
    mockLinkWalletToUser.mockResolvedValue(undefined)
    mockPrepareManagedWalletProvisioning.mockResolvedValue({
      encrypted: 'enc',
      address: '0xabc',
      derivationPath: "m/44'/60'/0'/0/0",
      wordCount: 24,
      persist: mockPersistPreparedWallet,
    })
    mockPersistPreparedWallet.mockResolvedValue({
      id: 'wallet-1',
      address: '0xabc',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns 400 when password is missing', async () => {
    const { POST } = await import('@/app/api/create-wallet/route')

    const res = await POST(buildRequest({}))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: 'Password is required',
      code: 'password_required',
    })
    expect(mockPrepareManagedWalletProvisioning).not.toHaveBeenCalled()
  })

  it('returns session-only when required server config is missing', async () => {
    vi.stubEnv('WALLET_ENCRYPTION_KEY_ACTIVE_VERSION', '1')
    vi.stubEnv('WALLET_ENCRYPTION_KEY_V1', '')
    vi.stubEnv('WALLET_ENCRYPTION_KEY_FINGERPRINT_V1', '')
    vi.stubEnv('CRDB_DATABASE_URL', '')
    vi.stubEnv('COCKROACH_URL', '')

    const { POST } = await import('@/app/api/create-wallet/route')
    const res = await POST(buildRequest({ password: strongPassphrase }))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      walletId: null,
      address: '0xabc',
      encrypted: 'enc',
      mode: 'session-only',
    })
  })

  it('returns custody payload when persistence succeeds', async () => {
    vi.stubEnv('WALLET_ENCRYPTION_KEY_ACTIVE_VERSION', '1')
    vi.stubEnv('WALLET_ENCRYPTION_KEY_V1', 'ff')
    vi.stubEnv('WALLET_ENCRYPTION_KEY_FINGERPRINT_V1', 'ff')
    vi.stubEnv('CRDB_DATABASE_URL', 'postgresql://example')

    const { POST } = await import('@/app/api/create-wallet/route')
    const res = await POST(buildRequest({ password: strongPassphrase }))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      walletId: 'wallet-1',
      address: '0xabc',
      encrypted: 'enc',
      mode: 'custody',
    })
    expect(res.headers.get('x-request-id')).toBeTruthy()
    expect(res.headers.get('x-response-time-ms')).toBeTruthy()
  })

  it('returns session-only when DB write fails in non-production', async () => {
    vi.stubEnv('WALLET_ENCRYPTION_KEY_ACTIVE_VERSION', '1')
    vi.stubEnv('WALLET_ENCRYPTION_KEY_V1', 'ff')
    vi.stubEnv('WALLET_ENCRYPTION_KEY_FINGERPRINT_V1', 'ff')
    vi.stubEnv('CRDB_DATABASE_URL', 'postgresql://example')

    mockPersistPreparedWallet.mockRejectedValue(new Error('db down'))

    const { POST } = await import('@/app/api/create-wallet/route')
    const res = await POST(buildRequest({ password: strongPassphrase }))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      walletId: null,
      address: '0xabc',
      encrypted: 'enc',
      mode: 'session-only',
    })
  })

  it('returns 500 when DB write fails in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXTAUTH_SECRET', 'test-nextauth-secret')
    vi.stubEnv('NEXTAUTH_URL', 'http://localhost:3000')
    vi.stubEnv('WALLET_ENCRYPTION_KEY_ACTIVE_VERSION', '1')
    vi.stubEnv('WALLET_ENCRYPTION_KEY_V1', 'ff')
    vi.stubEnv('WALLET_ENCRYPTION_KEY_FINGERPRINT_V1', 'ff')
    vi.stubEnv('CRDB_DATABASE_URL', 'postgresql://example')

    mockPersistPreparedWallet.mockRejectedValue(new Error('db down'))

    const { POST } = await import('@/app/api/create-wallet/route')
    const res = await POST(buildRequest({ password: strongPassphrase }))

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      code: 'create_wallet_failed',
      error: 'Failed to create wallet',
    })
  })

  it('returns 400 for weak passphrase', async () => {
    const { POST } = await import('@/app/api/create-wallet/route')

    const res = await POST(buildRequest({ password: 'Password123' }))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      code: 'password_too_short',
    })
    expect(mockPrepareManagedWalletProvisioning).not.toHaveBeenCalled()
  })
})
