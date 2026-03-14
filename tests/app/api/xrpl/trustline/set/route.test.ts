import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockRequireSession,
  mockIsAllowedOrigin,
  mockBuildRateLimitKey,
  mockRateLimit,
  mockGetAllowedIssuerSet,
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
  mockGetAllowedIssuerSet: vi.fn(),
  mockGetXrplSignerAddress: vi.fn(),
  mockGetXrplSignerAccount: vi.fn(),
  mockCreateXrplAction: vi.fn(),
  mockUpdateXrplAction: vi.fn(),
  mockAssessXrplActionRisk: vi.fn(),
  mockSubmitXrplTx: vi.fn(),
}))

vi.mock('@/lib/security/session', () => ({
  requireSession: mockRequireSession,
}))

vi.mock('@/lib/security/origin', () => ({
  isAllowedOrigin: mockIsAllowedOrigin,
}))

vi.mock('@/lib/security/rate-limit', () => ({
  buildRateLimitKey: mockBuildRateLimitKey,
  rateLimit: mockRateLimit,
}))

vi.mock('@/lib/xrpl-issued-assets', () => ({
  getAllowedIssuerSet: mockGetAllowedIssuerSet,
}))

vi.mock('@/lib/xrpl-signer', () => ({
  getXrplSignerAddress: mockGetXrplSignerAddress,
  getXrplSignerAccount: mockGetXrplSignerAccount,
}))

vi.mock('@/services/xrpl-action-log.service', () => ({
  createXrplAction: mockCreateXrplAction,
  updateXrplAction: mockUpdateXrplAction,
}))

vi.mock('@/services/xrpl-risk.service', () => ({
  assessXrplActionRisk: mockAssessXrplActionRisk,
}))

vi.mock('@/services/xrpl-tx-submit.service', () => ({
  submitXrplTx: mockSubmitXrplTx,
}))

describe('app/api/xrpl/trustline/set route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireSession.mockResolvedValue({ user: { id: 'user-1' } })
    mockIsAllowedOrigin.mockReturnValue(true)
    mockBuildRateLimitKey.mockReturnValue('user:user-1')
    mockRateLimit.mockReturnValue({ ok: true, remaining: 10, resetAt: Date.now() + 60_000 })
    mockGetAllowedIssuerSet.mockReturnValue({ enabled: false, allowed: new Set() })
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
    mockCreateXrplAction.mockResolvedValue({ id: 'act-1', details: { issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe' } })
    mockUpdateXrplAction.mockResolvedValue({})
    mockAssessXrplActionRisk.mockResolvedValue({ decision: 'allow', score: 0, reasons: [] })
    mockSubmitXrplTx.mockResolvedValue({
      txHash: 'ABC',
      engineResult: 'tesSUCCESS',
      validated: true,
      ledgerIndex: 100,
      sequence: 5,
    })
  })

  it('returns 401 when no session', async () => {
    mockRequireSession.mockResolvedValue(null)
    const { POST } = await import('@/app/api/xrpl/trustline/set/route')
    const res = await POST(new Request('http://localhost/api/xrpl/trustline/set', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    }))

    expect(res.status).toBe(401)
  })

  it('returns 403 when issuer is not allowed', async () => {
    mockGetAllowedIssuerSet.mockReturnValue({ enabled: true, allowed: new Set(['rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe']) })
    const { POST } = await import('@/app/api/xrpl/trustline/set/route')
    const res = await POST(new Request('http://localhost/api/xrpl/trustline/set', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ issuer: 'rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv', currency: 'USD', limit: '1', idempotencyKey: '11111111-1111-4111-8111-111111111111' }),
    }))
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.code).toBe('issuer_not_allowed')
    expect(mockSubmitXrplTx).not.toHaveBeenCalled()
  })

  it('submits trustline transaction on success', async () => {
    const traceId = 'trace-xrpl-trustset-1'
    const { POST } = await import('@/app/api/xrpl/trustline/set/route')
    const res = await POST(new Request('http://localhost/api/xrpl/trustline/set', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-trace-id': traceId },
      body: JSON.stringify({ issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', currency: 'USD', limit: '25', idempotencyKey: '11111111-1111-4111-8111-111111111111' }),
    }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.traceId).toBe(traceId)
    expect(res.headers.get('x-trace-id')).toBe(traceId)
    expect(mockCreateXrplAction).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId,
      }),
    )
    expect(mockSubmitXrplTx).toHaveBeenCalled()
  })
})
