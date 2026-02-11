import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('app/api/market-snapshot route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    delete (globalThis as Record<string, unknown>).aljamaMarketCache
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    delete (globalThis as Record<string, unknown>).aljamaMarketCache
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
    expect(mockFetch).toHaveBeenCalled()
  })

  it('falls back when upstream fetch fails', async () => {
    // NOTE: The route must be resilient in CI/offline environments.
    const mockFetch = vi.fn().mockRejectedValue(new Error('nope'))
    vi.stubGlobal('fetch', mockFetch)

    const { GET } = await import('@/app/api/market-snapshot/route')
    const res = await GET()
    const body = await res.json()

    expect(body.ok).toBe(true)
    expect(body.source).toBe('fallback')
    expect(body.assets).toHaveLength(5)
  })
})
