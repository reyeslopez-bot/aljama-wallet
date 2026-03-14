import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRecordSecuritySignal } = vi.hoisted(() => ({
  mockRecordSecuritySignal: vi.fn(),
}))

vi.mock('@/services/security-anomaly.service', () => ({
  recordSecuritySignal: mockRecordSecuritySignal,
}))

vi.mock('@/lib/security/logging', () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
}))

describe('app/api/_debug/env route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    mockRecordSecuritySignal.mockResolvedValue(undefined)
  })

  it('returns 404 in production before exposing environment details', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    const { GET } = await import('@/app/api/_debug/env/route')
    const res = await GET(new Request('http://localhost/api/_debug/env'))

    expect(res.status).toBe(404)
    await expect(res.text()).resolves.toBe('Not found')
  })
})
