import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockFindMany,
  mockRequireSession,
  mockIsAdminEmail,
  mockUsePgAuth,
  mockBuildRateLimitKey,
  mockRateLimit,
} = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockRequireSession: vi.fn(),
  mockIsAdminEmail: vi.fn(),
  mockUsePgAuth: vi.fn(),
  mockBuildRateLimitKey: vi.fn(),
  mockRateLimit: vi.fn(),
}))

vi.mock('@/lib/prisma-pg', () => ({
  prismaPg: { user: { findMany: mockFindMany } },
}))
vi.mock('@/lib/auth/store', () => ({ usePgAuth: mockUsePgAuth }))
vi.mock('@/lib/security/session', () => ({
  requireSession: mockRequireSession,
  isAdminEmail: mockIsAdminEmail,
}))
vi.mock('@/lib/security/rate-limit', () => ({
  buildRateLimitKey: mockBuildRateLimitKey,
  rateLimit: mockRateLimit,
}))

function buildRequest(url = 'http://localhost/api/admin/users') {
  return new Request(url)
}

describe('app/api/admin/users route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockRequireSession.mockResolvedValue({ user: { id: 'admin-1', email: 'admin@example.com' } })
    mockIsAdminEmail.mockReturnValue(true)
    mockUsePgAuth.mockReturnValue(true)
    mockBuildRateLimitKey.mockReturnValue('user:admin-1')
    mockRateLimit.mockResolvedValue({ ok: true })
    mockFindMany.mockResolvedValue([])
  })

  it('requires a signed-in configured admin', async () => {
    const { GET } = await import('@/app/api/admin/users/route')

    mockRequireSession.mockResolvedValue(null)
    const unauthenticated = await GET(buildRequest())
    expect(unauthenticated.status).toBe(401)

    mockRequireSession.mockResolvedValue({ user: { id: 'user-1', email: 'user@example.com' } })
    mockIsAdminEmail.mockReturnValue(false)
    const forbidden = await GET(buildRequest())
    expect(forbidden.status).toBe(403)
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  it('returns only registration and login metadata with a page cursor', async () => {
    mockFindMany.mockResolvedValue(
      Array.from({ length: 101 }, (_, index) => ({
        id: `user-${index}`,
        name: `user${index}`,
        email: `user${index}@example.com`,
        image: null,
        createdAt: new Date('2026-10-01T00:00:00Z'),
        lastLoginAt: null,
      })),
    )
    const { GET } = await import('@/app/api/admin/users/route')
    const response = await GET(buildRequest())

    expect(response.status).toBe(200)
    const result = await response.json()
    expect(result.users).toHaveLength(100)
    expect(result.nextCursor).toBe('user-99')
    expect(result.users[0]).not.toHaveProperty('passwordHash')
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 101,
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
        lastLoginAt: true,
      },
    }))
  })

  it('requires persistent account storage', async () => {
    mockUsePgAuth.mockReturnValue(false)
    const { GET } = await import('@/app/api/admin/users/route')
    const response = await GET(buildRequest())

    expect(response.status).toBe(503)
    expect(mockFindMany).not.toHaveBeenCalled()
  })
})
