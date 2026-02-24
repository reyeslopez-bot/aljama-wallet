import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockHasValidInternalToken,
  mockBuildRateLimitKey,
  mockRateLimit,
  mockGetRateLimitBackendHealth,
  mockGetClientIp,
  mockGetRecentSecuritySignalsForensics,
  mockGetRecentSecurityAnomaliesForensics,
  mockGetSecuritySignalQueueState,
  mockListSecurityAnomalyRules,
  mockGetSecurityAlertsForensics,
  mockRecordSecuritySignal,
} = vi.hoisted(() => ({
  mockHasValidInternalToken: vi.fn(),
  mockBuildRateLimitKey: vi.fn(),
  mockRateLimit: vi.fn(),
  mockGetRateLimitBackendHealth: vi.fn(),
  mockGetClientIp: vi.fn(),
  mockGetRecentSecuritySignalsForensics: vi.fn(),
  mockGetRecentSecurityAnomaliesForensics: vi.fn(),
  mockGetSecuritySignalQueueState: vi.fn(),
  mockListSecurityAnomalyRules: vi.fn(),
  mockGetSecurityAlertsForensics: vi.fn(),
  mockRecordSecuritySignal: vi.fn(),
}))

vi.mock('@/lib/security/internal-token', () => ({
  hasValidInternalToken: mockHasValidInternalToken,
}))

vi.mock('@/lib/security/rate-limit', () => ({
  buildRateLimitKey: mockBuildRateLimitKey,
  rateLimit: mockRateLimit,
  getRateLimitBackendHealth: mockGetRateLimitBackendHealth,
  getClientIp: mockGetClientIp,
}))

vi.mock('@/services/security-alert.service', () => ({
  getSecurityAlertsForensics: mockGetSecurityAlertsForensics,
}))

vi.mock('@/services/security-anomaly.service', () => ({
  getRecentSecuritySignalsForensics: mockGetRecentSecuritySignalsForensics,
  getRecentSecurityAnomaliesForensics: mockGetRecentSecurityAnomaliesForensics,
  getSecuritySignalQueueState: mockGetSecuritySignalQueueState,
  listSecurityAnomalyRules: mockListSecurityAnomalyRules,
  recordSecuritySignal: mockRecordSecuritySignal,
}))

describe('app/api/security/anomalies route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    vi.stubEnv('SECURITY_ALERTS_API_TOKEN', 'alert-token')
    mockHasValidInternalToken.mockReturnValue(true)
    mockGetClientIp.mockReturnValue('127.0.0.1')
    mockBuildRateLimitKey.mockReturnValue('ip:127.0.0.1')
    mockRateLimit.mockReturnValue({ ok: true, remaining: 29, resetAt: Date.now() + 60_000 })
    mockGetRateLimitBackendHealth.mockReturnValue({
      requestedBackend: 'memory',
      activeBackend: 'memory',
      degraded: false,
      reason: null,
      lastFailureAt: null,
      requireDistributed: false,
    })
    mockGetRecentSecuritySignalsForensics.mockResolvedValue([{ id: 'sig-1' }])
    mockGetRecentSecurityAnomaliesForensics.mockResolvedValue([{ id: 'anomaly-1' }])
    mockGetSecuritySignalQueueState.mockReturnValue({ depth: 0, draining: false, stats: {} })
    mockListSecurityAnomalyRules.mockReturnValue([{ id: 'rule-1' }])
    mockGetSecurityAlertsForensics.mockResolvedValue([{ id: 'alert-1' }])
    mockRecordSecuritySignal.mockResolvedValue({ signal: {}, anomalies: [] })
  })

  it('returns 404 when no internal token is configured', async () => {
    vi.stubEnv('SECURITY_ALERTS_API_TOKEN', '')
    vi.stubEnv('INTERNAL_API_TOKEN', '')
    const { GET } = await import('@/app/api/security/anomalies/route')

    const res = await GET(new Request('http://localhost/api/security/anomalies'))
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.code).toBe('disabled')
  })

  it('returns 401 when token validation fails', async () => {
    mockHasValidInternalToken.mockReturnValue(false)
    const { GET } = await import('@/app/api/security/anomalies/route')

    const res = await GET(new Request('http://localhost/api/security/anomalies'))
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.code).toBe('unauthorized')
  })

  it('returns signals, anomalies, and alerts when authorized', async () => {
    const { GET } = await import('@/app/api/security/anomalies/route')

    const res = await GET(
      new Request(
        'http://localhost/api/security/anomalies?signals=5&anomalies=5&alerts=5',
        {
          headers: { authorization: 'Bearer alert-token' },
        },
      ),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.signals).toEqual([{ id: 'sig-1' }])
    expect(body.anomalies).toEqual([{ id: 'anomaly-1' }])
    expect(body.alerts).toEqual([{ id: 'alert-1' }])
    expect(body.queue).toEqual({ depth: 0, draining: false, stats: {} })
    expect(body.rateLimit).toEqual({
      requestedBackend: 'memory',
      activeBackend: 'memory',
      degraded: false,
      reason: null,
      lastFailureAt: null,
      requireDistributed: false,
    })
    expect(body.rules).toEqual([{ id: 'rule-1' }])
  })
})
