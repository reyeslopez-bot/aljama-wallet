import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockHasValidInternalToken,
  mockBuildRateLimitKey,
  mockRateLimit,
  mockGetClientIp,
  mockGetRecentSecuritySignals,
  mockGetRecentSecurityAnomalies,
  mockGetSecuritySignalQueueState,
  mockListSecurityAnomalyRules,
  mockGetSecurityAlerts,
  mockRecordSecuritySignal,
} = vi.hoisted(() => ({
  mockHasValidInternalToken: vi.fn(),
  mockBuildRateLimitKey: vi.fn(),
  mockRateLimit: vi.fn(),
  mockGetClientIp: vi.fn(),
  mockGetRecentSecuritySignals: vi.fn(),
  mockGetRecentSecurityAnomalies: vi.fn(),
  mockGetSecuritySignalQueueState: vi.fn(),
  mockListSecurityAnomalyRules: vi.fn(),
  mockGetSecurityAlerts: vi.fn(),
  mockRecordSecuritySignal: vi.fn(),
}))

vi.mock('@/lib/security/internal-token', () => ({
  hasValidInternalToken: mockHasValidInternalToken,
}))

vi.mock('@/lib/security/rate-limit', () => ({
  buildRateLimitKey: mockBuildRateLimitKey,
  rateLimit: mockRateLimit,
  getClientIp: mockGetClientIp,
}))

vi.mock('@/services/security-alert.service', () => ({
  getSecurityAlerts: mockGetSecurityAlerts,
}))

vi.mock('@/services/security-anomaly.service', () => ({
  getRecentSecuritySignals: mockGetRecentSecuritySignals,
  getRecentSecurityAnomalies: mockGetRecentSecurityAnomalies,
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
    mockGetRecentSecuritySignals.mockReturnValue([{ id: 'sig-1' }])
    mockGetRecentSecurityAnomalies.mockReturnValue([{ id: 'anomaly-1' }])
    mockGetSecuritySignalQueueState.mockReturnValue({ depth: 0, draining: false, stats: {} })
    mockListSecurityAnomalyRules.mockReturnValue([{ id: 'rule-1' }])
    mockGetSecurityAlerts.mockReturnValue([{ id: 'alert-1' }])
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
    expect(body.rules).toEqual([{ id: 'rule-1' }])
  })
})
