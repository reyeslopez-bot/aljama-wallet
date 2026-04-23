// tests/app/api/test-db/route.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type WalletMock = { id: string }
type SummaryMock = { date: string }

const { mockRecordSecuritySignal } = vi.hoisted(() => ({
  mockRecordSecuritySignal: vi.fn(),
}))

const { mockGetWallets, mockGetDailySummaries } = vi.hoisted(() => ({
  mockGetWallets: vi.fn<() => Promise<WalletMock[]>>(),
  mockGetDailySummaries: vi.fn<() => Promise<SummaryMock[]>>(),
}))

vi.mock('@/services/security-anomaly.service', () => ({
  recordSecuritySignal: mockRecordSecuritySignal,
}))

vi.mock('@/services/wallet.service', () => ({
  getWallets: mockGetWallets,
}))

vi.mock('@/services/summary.service', () => ({
  getDailySummaries: mockGetDailySummaries,
}))

vi.mock('@/lib/security/logging', () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
}))

describe('app/api/test-db route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockRecordSecuritySignal.mockResolvedValue(undefined)

    // Route disables in CI=true or NODE_ENV=production.
    // Force the enabled branch in tests.
    vi.stubEnv('CI', 'false')
    vi.stubEnv('NODE_ENV', 'test')

    mockGetWallets.mockResolvedValue([{ id: 'wallet-1' }])
    mockGetDailySummaries.mockResolvedValue([{ date: '2024-01-01' }])
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns wallets and summaries when enabled', async () => {
    const { GET } = await import('@/app/api/test-db/route')
    const res = await GET()
    expect(await res.json()).toEqual({
      wallets: [{ id: 'wallet-1' }],
      summaries: [{ date: '2024-01-01' }],
    })
  })

  it('returns 404 in production before exposing the debug route', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    const { GET } = await import('@/app/api/test-db/route')
    const res = await GET(new Request('http://localhost/api/test-db'))

    expect(res.status).toBe(404)
    await expect(res.text()).resolves.toBe('Not found')
  })
})
