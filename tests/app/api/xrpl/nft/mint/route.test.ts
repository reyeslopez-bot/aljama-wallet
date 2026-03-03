import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockRequireSession,
  mockIsAllowedOrigin,
  mockBuildRateLimitKey,
  mockRateLimit,
  mockIsAllowedNftUri,
  mockGetXrplSignerAddress,
  mockGetXrplSignerAccount,
  mockCreateXrplAction,
  mockUpdateXrplAction,
  mockAssessXrplActionRisk,
  mockSubmitXrplTx,
} = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockIsAllowedOrigin: vi.fn(),
  mockBuildRateLimitKey: vi.fn(),
  mockRateLimit: vi.fn(),
  mockIsAllowedNftUri: vi.fn(),
  mockGetXrplSignerAddress: vi.fn(),
  mockGetXrplSignerAccount: vi.fn(),
  mockCreateXrplAction: vi.fn(),
  mockUpdateXrplAction: vi.fn(),
  mockAssessXrplActionRisk: vi.fn(),
  mockSubmitXrplTx: vi.fn(),
}))

vi.mock('@/lib/security/session', () => ({ requireSession: mockRequireSession }))
vi.mock('@/lib/security/origin', () => ({ isAllowedOrigin: mockIsAllowedOrigin }))
vi.mock('@/lib/security/rate-limit', () => ({ buildRateLimitKey: mockBuildRateLimitKey, rateLimit: mockRateLimit }))
vi.mock('@/lib/xrpl-nft-metadata', () => ({ isAllowedNftUri: mockIsAllowedNftUri, utf8ToHex: vi.fn(() => 'ABCD') }))
vi.mock('@/lib/xrpl-signer', () => ({
  getXrplSignerAddress: mockGetXrplSignerAddress,
  getXrplSignerAccount: mockGetXrplSignerAccount,
}))
vi.mock('@/services/xrpl-action-log.service', () => ({ createXrplAction: mockCreateXrplAction, updateXrplAction: mockUpdateXrplAction }))
vi.mock('@/services/xrpl-risk.service', () => ({ assessXrplActionRisk: mockAssessXrplActionRisk }))
vi.mock('@/services/xrpl-tx-submit.service', () => ({ submitXrplTx: mockSubmitXrplTx }))

describe('app/api/xrpl/nft/mint route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireSession.mockResolvedValue({ user: { id: 'user-1' } })
    mockIsAllowedOrigin.mockReturnValue(true)
    mockBuildRateLimitKey.mockReturnValue('user:user-1')
    mockRateLimit.mockReturnValue({ ok: true, remaining: 10, resetAt: Date.now() + 60_000 })
    mockIsAllowedNftUri.mockReturnValue(true)
    const address = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'
    mockGetXrplSignerAddress.mockReturnValue(address)
    mockGetXrplSignerAccount.mockReturnValue({
      id: 'xrpl-env',
      accountRef: 'XRPL:ed25519:pubkey',
      chain: 'XRPL',
      address,
      pubKey: 'EDPUBKEY',
      keyType: 'ed25519',
      signerBackend: 'local',
      vaultId: 'public',
      derivationPath: null,
      policy: { requiresSecondFactor: false, requiresPQAttestation: false },
      pqcBinding: null,
      createdAt: new Date(0),
    })
    mockCreateXrplAction.mockResolvedValue({ id: 'act-1', details: {} })
    mockUpdateXrplAction.mockResolvedValue({})
    mockAssessXrplActionRisk.mockResolvedValue({ decision: 'allow', score: 0, reasons: [] })
    mockSubmitXrplTx.mockResolvedValue({ txHash: 'ABC', engineResult: 'tesSUCCESS', validated: true, ledgerIndex: 1, sequence: 1 })
  })

  it('rejects unsupported URI scheme', async () => {
    mockIsAllowedNftUri.mockReturnValue(false)
    const { POST } = await import('@/app/api/xrpl/nft/mint/route')
    const res = await POST(new Request('http://localhost/api/xrpl/nft/mint', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ uri: 'ftp://bad', idempotencyKey: '11111111-1111-4111-8111-111111111111' }),
    }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.code).toBe('invalid_uri')
  })

  it('submits NFT mint transaction', async () => {
    const { POST } = await import('@/app/api/xrpl/nft/mint/route')
    const res = await POST(new Request('http://localhost/api/xrpl/nft/mint', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ uri: 'https://example.com/meta.json', idempotencyKey: '11111111-1111-4111-8111-111111111111' }),
    }))

    expect(res.status).toBe(200)
    expect(mockSubmitXrplTx).toHaveBeenCalled()
  })
})
