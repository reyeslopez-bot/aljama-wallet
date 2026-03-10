import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { emitSecurityAlertMock } = vi.hoisted(() => ({
  emitSecurityAlertMock: vi.fn(),
}))

vi.mock('@/services/security-alert.service', () => ({
  emitSecurityAlert: emitSecurityAlertMock,
}))

describe('app/api/market-snapshot route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    delete (globalThis as Record<string, unknown>).aljamaMarketCache
    delete (globalThis as Record<string, unknown>).aljamaLastMarketSnapshot
    delete (globalThis as Record<string, unknown>).aljamaMarketFallbackState
    emitSecurityAlertMock.mockResolvedValue({
      id: 'alert-1',
      ruleId: 'market.snapshot.fallback_mode.active',
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    delete (globalThis as Record<string, unknown>).aljamaMarketCache
    delete (globalThis as Record<string, unknown>).aljamaLastMarketSnapshot
    delete (globalThis as Record<string, unknown>).aljamaMarketFallbackState
  })

  it('returns snapshot data from upstream', async () => {
    // NOTE: This verifies we pass through upstream pricing when available.
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ prices: [[0, 1], [1, 2], [2, 3]] }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { GET } = await import('@/app/api/market-snapshot/route')
    const res = await GET()
    const body = await res.json()

    expect(body.ok).toBe(true)
    expect(body.source).toBe('coingecko')
    expect(body.assets).toHaveLength(5)
    expect(body.assets[0].series.length).toBeGreaterThan(1)
    expect(res.headers.get('x-aljama-market-source')).toBe('coingecko')
    expect(Number(res.headers.get('x-upstream-duration-ms'))).toBeGreaterThanOrEqual(0)
    expect(mockFetch).toHaveBeenCalled()
  })

  it('falls back when upstream fetch fails', async () => {
    // NOTE: The route must be resilient in CI/offline environments.
    const mockFetch = vi.fn().mockRejectedValue(new Error('nope'))
    vi.stubGlobal('fetch', mockFetch)

    const { GET } = await import('@/app/api/market-snapshot/route')
    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.source).toBe('fallback')
    expect(body.assets).toHaveLength(5)
    expect(res.headers.get('x-aljama-market-source')).toBe('fallback')
    expect(Number(res.headers.get('x-upstream-duration-ms'))).toBeGreaterThanOrEqual(0)
    expect(emitSecurityAlertMock).not.toHaveBeenCalled()
  })

  it('alerts only after fallback mode remains active past the configured threshold', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-10T00:00:00.000Z'))
    vi.stubEnv('MARKET_SNAPSHOT_FALLBACK_ALERT_AFTER_MS', '300000')
    vi.stubEnv('MARKET_SNAPSHOT_FALLBACK_ALERT_REPEAT_MS', '300000')

    const mockFetch = vi.fn().mockRejectedValue(new Error('provider down'))
    vi.stubGlobal('fetch', mockFetch)

    const { GET } = await import('@/app/api/market-snapshot/route')

    const firstRes = await GET(new Request('http://localhost/api/market-snapshot'))
    expect(firstRes.status).toBe(200)
    expect(emitSecurityAlertMock).not.toHaveBeenCalled()

    vi.setSystemTime(new Date('2026-03-10T00:06:00.000Z'))
    const secondRes = await GET(new Request('http://localhost/api/market-snapshot'))
    expect(secondRes.status).toBe(200)
    expect(emitSecurityAlertMock).toHaveBeenCalledTimes(1)
    expect(emitSecurityAlertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleId: 'market.snapshot.fallback_mode.active',
        source: 'api.market-snapshot',
        severity: 'medium',
        repetitive: true,
        runbookHint: expect.stringContaining('Check CoinGecko availability'),
        context: expect.objectContaining({
          fallbackActiveMs: 6 * 60 * 1_000,
          fallbackStrategy: 'seeded_snapshot',
          hasLastRealSnapshot: false,
        }),
      }),
    )
  })
})
