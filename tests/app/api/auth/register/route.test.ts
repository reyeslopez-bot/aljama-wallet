import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockHashPassword,
  mockCreateUser,
  mockFindUserByEmail,
  mockFindUserByUsername,
  mockBuildRateLimitKey,
  mockRateLimit,
  mockGetClientIp,
  mockIsAllowedOrigin,
} = vi.hoisted(() => ({
  mockHashPassword: vi.fn(),
  mockCreateUser: vi.fn(),
  mockFindUserByEmail: vi.fn(),
  mockFindUserByUsername: vi.fn(),
  mockBuildRateLimitKey: vi.fn(),
  mockRateLimit: vi.fn(),
  mockGetClientIp: vi.fn(),
  mockIsAllowedOrigin: vi.fn(),
}))

vi.mock('@/lib/auth/password', () => ({
  hashPassword: mockHashPassword,
}))

vi.mock('@/lib/auth/store', () => ({
  createUser: mockCreateUser,
  findUserByEmail: mockFindUserByEmail,
  findUserByUsername: mockFindUserByUsername,
}))

vi.mock('@/lib/security/rate-limit', () => ({
  buildRateLimitKey: mockBuildRateLimitKey,
  rateLimit: mockRateLimit,
  getClientIp: mockGetClientIp,
}))

vi.mock('@/lib/security/origin', () => ({
  isAllowedOrigin: mockIsAllowedOrigin,
}))

vi.mock('@/lib/security/runtime', () => ({
  isStrictMode: false,
}))

function buildRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost:3000',
    },
    body: JSON.stringify(body),
  })
}

describe('app/api/auth/register route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    mockIsAllowedOrigin.mockReturnValue(true)
    mockGetClientIp.mockReturnValue('127.0.0.1')
    mockBuildRateLimitKey.mockReturnValue('ip:127.0.0.1')
    mockRateLimit.mockReturnValue({ ok: true, remaining: 9, resetAt: Date.now() + 60_000 })
    mockFindUserByEmail.mockResolvedValue(null)
    mockFindUserByUsername.mockResolvedValue(null)
    mockHashPassword.mockResolvedValue('hashed-password')
    mockCreateUser.mockResolvedValue({ id: 'user-1', name: 'new_user', email: 'new@example.com', image: null })
  })

  it('blocks registration from disallowed origins', async () => {
    mockIsAllowedOrigin.mockReturnValue(false)
    const { POST } = await import('@/app/api/auth/register/route')

    const res = await POST(
      buildRequest({
        username: 'new_user',
        email: 'new@example.com',
        password: 'StrongPassphrase1!',
      }),
    )
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.code).toBe('invalid_origin')
  })

  it('returns 429 when registration endpoint is rate limited', async () => {
    mockRateLimit.mockReturnValue({ ok: false, retryAfter: 12, resetAt: Date.now() + 12_000 })
    const { POST } = await import('@/app/api/auth/register/route')

    const res = await POST(
      buildRequest({
        username: 'new_user',
        email: 'new@example.com',
        password: 'StrongPassphrase1!',
      }),
    )
    const body = await res.json()

    expect(res.status).toBe(429)
    expect(body.code).toBe('rate_limited')
    expect(res.headers.get('retry-after')).toBe('12')
  })

  it('rejects invalid payload when username is missing', async () => {
    const { POST } = await import('@/app/api/auth/register/route')

    const res = await POST(
      buildRequest({
        email: 'new@example.com',
        password: 'StrongPassphrase1!',
      }),
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.code).toBe('invalid_payload')
    expect(mockCreateUser).not.toHaveBeenCalled()
  })

  it('returns conflict when email already exists', async () => {
    mockFindUserByEmail.mockResolvedValue({ id: 'existing-user', email: 'new@example.com' })
    const { POST } = await import('@/app/api/auth/register/route')

    const res = await POST(
      buildRequest({
        username: 'new_user',
        email: 'new@example.com',
        password: 'StrongPassphrase1!',
      }),
    )
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.code).toBe('user_exists')
    expect(mockCreateUser).not.toHaveBeenCalled()
  })

  it('returns conflict when username already exists', async () => {
    mockFindUserByUsername.mockResolvedValue({ id: 'existing-user', name: 'new_user', email: null })
    const { POST } = await import('@/app/api/auth/register/route')

    const res = await POST(
      buildRequest({
        username: 'new_user',
        email: '',
        password: 'StrongPassphrase1!',
      }),
    )
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.code).toBe('username_exists')
    expect(mockCreateUser).not.toHaveBeenCalled()
  })

  it('creates a user with normalized email on success', async () => {
    const { POST } = await import('@/app/api/auth/register/route')

    const res = await POST(
      buildRequest({
        username: 'New_User',
        email: 'NEW@Example.COM',
        password: 'StrongPassphrase1!',
      }),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({
      ok: true,
      user: { id: 'user-1', username: 'new_user', email: 'new@example.com', image: null },
    })
    expect(mockFindUserByUsername).toHaveBeenCalledWith('new_user')
    expect(mockFindUserByEmail).toHaveBeenCalledWith('new@example.com')
    expect(mockHashPassword).toHaveBeenCalledWith('StrongPassphrase1!')
    expect(mockCreateUser).toHaveBeenCalledWith({
      username: 'new_user',
      email: 'new@example.com',
      passwordHash: 'hashed-password',
      image: null,
    })
  })

  it('creates a user when email is omitted', async () => {
    mockCreateUser.mockResolvedValue({ id: 'user-1', name: 'wallet_ops', email: null, image: null })
    const { POST } = await import('@/app/api/auth/register/route')

    const res = await POST(
      buildRequest({
        username: 'wallet_ops',
        password: 'StrongPassphrase1!',
      }),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({
      ok: true,
      user: { id: 'user-1', username: 'wallet_ops', email: null, image: null },
    })
    expect(mockFindUserByEmail).not.toHaveBeenCalled()
    expect(mockCreateUser).toHaveBeenCalledWith({
      username: 'wallet_ops',
      email: null,
      passwordHash: 'hashed-password',
      image: null,
    })
  })
})
