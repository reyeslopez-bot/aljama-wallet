import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockFindMany,
  mockCreate,
  mockEventCreate,
  mockEventFindMany,
  mockFindUnique,
  mockUpdateMany,
  mockRequireSession,
  mockIsAdminEmail,
  mockUsePgAuth,
  mockIsAllowedOrigin,
  mockBuildRateLimitKey,
  mockRateLimit,
  mockTransaction,
} = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockCreate: vi.fn(),
  mockEventCreate: vi.fn(),
  mockEventFindMany: vi.fn(),
  mockFindUnique: vi.fn(),
  mockUpdateMany: vi.fn(),
  mockRequireSession: vi.fn(),
  mockIsAdminEmail: vi.fn(),
  mockUsePgAuth: vi.fn(),
  mockIsAllowedOrigin: vi.fn(),
  mockBuildRateLimitKey: vi.fn(),
  mockRateLimit: vi.fn(),
  mockTransaction: vi.fn(),
}))

vi.mock('@/lib/prisma-pg', () => ({
  prismaPg: {
    privacyRequest: { findMany: mockFindMany },
    privacyRequestEvent: { create: mockEventCreate, findMany: mockEventFindMany },
    $transaction: mockTransaction,
  },
}))

vi.mock('@/lib/auth/store', () => ({ usePgAuth: mockUsePgAuth }))
vi.mock('@/lib/security/session', () => ({
  requireSession: mockRequireSession,
  isAdminEmail: mockIsAdminEmail,
}))
vi.mock('@/lib/security/origin', () => ({ isAllowedOrigin: mockIsAllowedOrigin }))
vi.mock('@/lib/security/rate-limit', () => ({
  buildRateLimitKey: mockBuildRateLimitKey,
  rateLimit: mockRateLimit,
}))

function buildRequest(method: string, body?: unknown) {
  return new Request('http://localhost/api/privacy/requests', {
    method,
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

describe('app/api/privacy/requests route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockRequireSession.mockResolvedValue({ user: { id: 'user-1', email: 'user@example.com' } })
    mockIsAdminEmail.mockReturnValue(false)
    mockUsePgAuth.mockReturnValue(true)
    mockIsAllowedOrigin.mockReturnValue(true)
    mockBuildRateLimitKey.mockReturnValue('user:user-1')
    mockRateLimit.mockResolvedValue({ ok: true })
    mockFindMany.mockResolvedValue([])
    mockCreate.mockResolvedValue({
      id: 'request-1',
      type: 'access',
      description: null,
      status: 'received',
      createdAt: new Date('2026-10-23T10:00:00Z'),
    })
    mockEventCreate.mockResolvedValue({ id: 'event-1' })
    mockEventFindMany.mockResolvedValue([])
    mockFindUnique.mockResolvedValue({ id: 'request-1', status: 'received' })
    mockUpdateMany.mockResolvedValue({ count: 1 })
    mockTransaction.mockImplementation((work) =>
      work({
        privacyRequest: {
          create: mockCreate,
          findUnique: mockFindUnique,
          updateMany: mockUpdateMany,
        },
        privacyRequestEvent: { create: mockEventCreate },
      }),
    )
  })

  it('requires an authenticated account', async () => {
    mockRequireSession.mockResolvedValue(null)
    const { POST } = await import('@/app/api/privacy/requests/route')
    const response = await POST(buildRequest('POST', { type: 'access' }))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ code: 'unauthorized' })
  })

  it('records a request and its initial status event atomically', async () => {
    const { POST } = await import('@/app/api/privacy/requests/route')
    const response = await POST(buildRequest('POST', { type: 'access', description: 'Export my account data' }))

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      request: { id: 'request-1', status: 'received' },
    })
    expect(mockCreate).toHaveBeenCalledWith({
      data: { userId: 'user-1', type: 'access', description: 'Export my account data' },
      select: expect.any(Object),
    })
    expect(mockEventCreate).toHaveBeenCalledWith({
      data: {
        requestId: 'request-1',
        changedByUserId: 'user-1',
        fromStatus: null,
        toStatus: 'received',
      },
    })
  })

  it('limits request history to the signed-in user', async () => {
    mockFindMany.mockResolvedValue([{ id: 'mine', userId: 'user-1' }])
    const { GET } = await import('@/app/api/privacy/requests/route')
    const response = await GET(buildRequest('GET'))

    expect(response.status).toBe(200)
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-1' },
      take: 100,
    }))
    expect(mockEventFindMany).not.toHaveBeenCalled()
  })

  it('returns status history to configured admins', async () => {
    mockIsAdminEmail.mockReturnValue(true)
    mockFindMany.mockResolvedValue([{ id: 'request-1', userId: 'user-1' }])
    mockEventFindMany.mockResolvedValue([{ id: 'event-1', requestId: 'request-1', toStatus: 'received' }])
    const { GET } = await import('@/app/api/privacy/requests/route')
    const response = await GET(buildRequest('GET'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      requests: [{ id: 'request-1' }],
      statusEvents: [{ id: 'event-1', requestId: 'request-1' }],
    })
    expect(mockEventFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { requestId: { in: ['request-1'] } },
    }))
  })

  it('rejects requests from invalid origins', async () => {
    mockIsAllowedOrigin.mockReturnValue(false)
    const { POST } = await import('@/app/api/privacy/requests/route')
    const response = await POST(buildRequest('POST', { type: 'erasure' }))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ code: 'invalid_origin' })
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('does not allow non-admin users to update request status', async () => {
    const { PATCH } = await import('@/app/api/privacy/requests/route')
    const response = await PATCH(
      buildRequest('PATCH', { id: 'request-1', status: 'under_review' }),
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ code: 'forbidden' })
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('records admin status changes and requires a resolution for terminal states', async () => {
    mockIsAdminEmail.mockReturnValue(true)
    const { PATCH } = await import('@/app/api/privacy/requests/route')
    const invalid = await PATCH(buildRequest('PATCH', { id: 'request-1', status: 'fulfilled' }))
    expect(invalid.status).toBe(400)
    expect(mockTransaction).not.toHaveBeenCalled()

    const response = await PATCH(
      buildRequest('PATCH', {
        id: 'request-1',
        status: 'under_review',
      }),
    )

    expect(response.status).toBe(200)
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: 'request-1', status: 'received' },
      data: { status: 'under_review', resolution: null, resolvedAt: null },
    })
    expect(mockEventCreate).toHaveBeenCalledWith({
      data: {
        requestId: 'request-1',
        changedByUserId: 'user-1',
        fromStatus: 'received',
        toStatus: 'under_review',
        resolution: null,
      },
    })
  })

  it('rejects invalid status transitions', async () => {
    mockIsAdminEmail.mockReturnValue(true)
    mockFindUnique.mockResolvedValue({ id: 'request-1', status: 'fulfilled' })
    const { PATCH } = await import('@/app/api/privacy/requests/route')
    const response = await PATCH(
      buildRequest('PATCH', {
        id: 'request-1',
        status: 'under_review',
      }),
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ code: 'invalid_status_transition' })
    expect(mockEventCreate).not.toHaveBeenCalled()
  })
})
