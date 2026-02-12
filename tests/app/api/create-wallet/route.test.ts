import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockCreateEncryptedWallet = vi.fn()
const mockCreateWalletRecord = vi.fn()
const mockDeleteWalletRecord = vi.fn()
const mockLinkWalletToUser = vi.fn()
const mockGetServerSession = vi.fn()

vi.mock('@/lib/wallet', () => ({
  createEncryptedWallet: mockCreateEncryptedWallet,
}))

vi.mock('@/services/wallet.service', () => ({
  createWalletRecord: mockCreateWalletRecord,
  deleteWalletRecord: mockDeleteWalletRecord,
}))

vi.mock('@/services/wallet-ownership.service', () => ({
  linkWalletToUser: mockLinkWalletToUser,
}))

vi.mock('next-auth/next', () => ({
  getServerSession: mockGetServerSession,
}))

function buildRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/create-wallet', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('app/api/create-wallet route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1', email: 'user@example.com' } })
    mockLinkWalletToUser.mockResolvedValue(undefined)
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
    expect(mockCreateEncryptedWallet).not.toHaveBeenCalled()
  })

  it('returns session-only when required server config is missing', async () => {
    vi.stubEnv('WALLET_ENCRYPTION_KEY_ACTIVE_VERSION', '1')
    vi.stubEnv('WALLET_ENCRYPTION_KEY_V1', '')
    vi.stubEnv('WALLET_ENCRYPTION_KEY_FINGERPRINT_V1', '')
    vi.stubEnv('CRDB_DATABASE_URL', '')
    vi.stubEnv('COCKROACH_URL', '')

    mockCreateEncryptedWallet.mockResolvedValue({
      encrypted: 'enc',
      wallet: { address: '0xabc', privateKey: '0x123' },
    })

    const { POST } = await import('@/app/api/create-wallet/route')
    const res = await POST(buildRequest({ password: 'passphrase-123' }))

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

    mockCreateEncryptedWallet.mockResolvedValue({
      encrypted: 'enc',
      wallet: { address: '0xabc', privateKey: '0x123' },
    })
    mockCreateWalletRecord.mockResolvedValue({
      id: 'wallet-1',
      address: '0xabc',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    })

    const { POST } = await import('@/app/api/create-wallet/route')
    const res = await POST(buildRequest({ password: 'passphrase-123' }))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      walletId: 'wallet-1',
      address: '0xabc',
      encrypted: 'enc',
      mode: 'custody',
    })
  })

  it('returns session-only when DB write fails in non-production', async () => {
    vi.stubEnv('WALLET_ENCRYPTION_KEY_ACTIVE_VERSION', '1')
    vi.stubEnv('WALLET_ENCRYPTION_KEY_V1', 'ff')
    vi.stubEnv('WALLET_ENCRYPTION_KEY_FINGERPRINT_V1', 'ff')
    vi.stubEnv('CRDB_DATABASE_URL', 'postgresql://example')

    mockCreateEncryptedWallet.mockResolvedValue({
      encrypted: 'enc',
      wallet: { address: '0xabc', privateKey: '0x123' },
    })
    mockCreateWalletRecord.mockRejectedValue(new Error('db down'))

    const { POST } = await import('@/app/api/create-wallet/route')
    const res = await POST(buildRequest({ password: 'passphrase-123' }))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      walletId: null,
      address: '0xabc',
      encrypted: 'enc',
      mode: 'session-only',
    })
  })
})
