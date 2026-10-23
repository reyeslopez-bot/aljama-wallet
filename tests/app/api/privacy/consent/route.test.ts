import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockFindFirst,
  mockCreate,
  mockFindMany,
  mockTransaction,
  mockIsAllowedOrigin,
  mockBuildRateLimitKey,
  mockRateLimit,
} = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockCreate: vi.fn(),
  mockFindMany: vi.fn(),
  mockTransaction: vi.fn(),
  mockIsAllowedOrigin: vi.fn(),
  mockBuildRateLimitKey: vi.fn(),
  mockRateLimit: vi.fn(),
}))

vi.mock('@/lib/prisma-pg', () => ({
  prismaPg: {
    $transaction: mockTransaction,
    consentReceipt: { findMany: mockFindMany },
  },
}))
vi.mock('@/lib/security/origin', () => ({ isAllowedOrigin: mockIsAllowedOrigin }))
vi.mock('@/lib/security/rate-limit', () => ({
  buildRateLimitKey: mockBuildRateLimitKey,
  rateLimit: mockRateLimit,
}))

function buildRequest(body: unknown) {
  return new Request('http://localhost/api/privacy/consent', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify(body),
  })
}

describe('app/api/privacy/consent route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubEnv('PG_DATABASE_URL', 'postgres://example')
    mockFindFirst.mockResolvedValue(null)
    mockCreate.mockResolvedValue({
      id: 'receipt-row-1',
      consentVersion: '2026-10',
      changeType: 'initial',
      createdAt: new Date(),
    })
    mockIsAllowedOrigin.mockReturnValue(true)
    mockBuildRateLimitKey.mockReturnValue('ip:hashed')
    mockRateLimit.mockResolvedValue({ ok: true })
    mockFindMany.mockResolvedValue([
      { id: 'r1', changeType: 'withdrawn', createdAt: new Date('2026-10-23T10:00:00Z') },
    ])
    mockTransaction.mockImplementation((work) =>
      work({ consentReceipt: { findFirst: mockFindFirst, create: mockCreate } }),
    )
  })

  it('records an initial consent choice without storing account or IP details', async () => {
    const { POST } = await import('@/app/api/privacy/consent/route')
    const response = await POST(buildRequest({
      receiptId: '1c6e59b2-f9cc-42dd-8d66-7ac41b2a3e07',
      consentVersion: '2026-10',
      telemetryGranted: true,
      locationGranted: false,
    }))

    expect(response.status).toBe(200)
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        receiptId: '1c6e59b2-f9cc-42dd-8d66-7ac41b2a3e07',
        consentVersion: '2026-10',
        telemetryGranted: true,
        locationGranted: false,
        changeType: 'initial',
        previousTelemetry: null,
        previousLocation: null,
      },
      select: expect.any(Object),
    })
  })

  it('records withdrawal of previously enabled optional services', async () => {
    mockFindFirst.mockResolvedValue({ telemetryGranted: true, locationGranted: true })
    const { POST } = await import('@/app/api/privacy/consent/route')
    const response = await POST(buildRequest({
      receiptId: '1c6e59b2-f9cc-42dd-8d66-7ac41b2a3e07',
      consentVersion: '2026-10',
      telemetryGranted: false,
      locationGranted: false,
    }))

    expect(response.status).toBe(200)
    expect(mockCreate.mock.calls[0]?.[0].data).toMatchObject({
      changeType: 'withdrawn',
      previousTelemetry: true,
      previousLocation: true,
    })
  })

  it('rejects invalid origin and malformed receipt payloads', async () => {
    mockIsAllowedOrigin.mockReturnValue(false)
    const { POST } = await import('@/app/api/privacy/consent/route')
    const originResponse = await POST(buildRequest({
      receiptId: '1c6e59b2-f9cc-42dd-8d66-7ac41b2a3e07',
      consentVersion: '2026-10',
      telemetryGranted: true,
      locationGranted: true,
    }))
    expect(originResponse.status).toBe(403)

    mockIsAllowedOrigin.mockReturnValue(true)
    const invalidResponse = await POST(buildRequest({ consentVersion: 'bad' }))
    expect(invalidResponse.status).toBe(400)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('fails explicitly when persistent consent storage is unavailable', async () => {
    vi.stubEnv('PG_DATABASE_URL', '')
    vi.stubEnv('POSTGRES_URL', '')
    const { POST } = await import('@/app/api/privacy/consent/route')
    const response = await POST(buildRequest({
      receiptId: '1c6e59b2-f9cc-42dd-8d66-7ac41b2a3e07',
      consentVersion: '2026-10',
      telemetryGranted: false,
      locationGranted: false,
    }))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ code: 'consent_evidence_unavailable' })
  })

  it('returns consent history only for the supplied random browser receipt id', async () => {
    const { GET } = await import('@/app/api/privacy/consent/route')
    const response = await GET(new Request('http://localhost/api/privacy/consent', {
      headers: {
        origin: 'http://localhost',
        'x-consent-receipt-id': '1c6e59b2-f9cc-42dd-8d66-7ac41b2a3e07',
      },
    }))

    expect(response.status).toBe(200)
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { receiptId: '1c6e59b2-f9cc-42dd-8d66-7ac41b2a3e07' },
      take: 200,
      orderBy: { createdAt: 'desc' },
    }))
  })
})
