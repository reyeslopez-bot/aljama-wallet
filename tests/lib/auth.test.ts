import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockVerifyPassword,
  mockFindUserByIdentifier,
  mockUsePgAuth,
  mockRateLimit,
} = vi.hoisted(() => ({
  mockVerifyPassword: vi.fn(),
  mockFindUserByIdentifier: vi.fn(),
  mockUsePgAuth: vi.fn(),
  mockRateLimit: vi.fn(),
}))

vi.mock('@/lib/auth/password', () => ({
  verifyPassword: mockVerifyPassword,
}))

vi.mock('@/lib/auth/store', () => ({
  findUserByIdentifier: mockFindUserByIdentifier,
  usePgAuth: mockUsePgAuth,
}))

vi.mock('@/lib/security/rate-limit', () => ({
  rateLimit: mockRateLimit,
}))

vi.mock('@/lib/security/runtime', () => ({
  isStrictMode: false,
}))

vi.mock('@/lib/security/logging', () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
}))

vi.mock('@next-auth/prisma-adapter', () => ({
  PrismaAdapter: vi.fn(() => ({ name: 'mock-prisma-adapter' })),
}))

vi.mock('@/lib/prisma-pg', () => ({
  prismaPg: {},
}))

async function loadAuthOptions() {
  const { authOptions } = await import('@/lib/auth')
  return authOptions
}

type CredentialsProviderLike = {
  options: {
    authorize: (
      credentials?: Record<string, string>,
      req?: { headers?: Headers | Record<string, string | string[] | undefined> },
    ) => unknown
  }
}

describe('lib/auth credentials provider', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    mockUsePgAuth.mockReturnValue(false)
    mockRateLimit.mockResolvedValue({ ok: true, remaining: 7, resetAt: Date.now() + 60_000 })
    mockFindUserByIdentifier.mockResolvedValue(null)
    mockVerifyPassword.mockResolvedValue(false)
  })

  it('returns null when identifier or password is missing', async () => {
    const authOptions = await loadAuthOptions()
    const provider = authOptions.providers[0] as unknown as CredentialsProviderLike

    await expect(provider.options.authorize({ identifier: '', password: 'abc' }, { headers: {} })).resolves.toBeNull()
    await expect(
      provider.options.authorize({ identifier: 'user@example.com', password: '' }, { headers: {} }),
    ).resolves.toBeNull()

    expect(mockRateLimit).not.toHaveBeenCalled()
    expect(mockFindUserByIdentifier).not.toHaveBeenCalled()
  })

  it('applies login rate limiting before looking up the user', async () => {
    mockRateLimit.mockResolvedValue({ ok: false, retryAfter: 60, resetAt: Date.now() + 60_000 })
    const authOptions = await loadAuthOptions()
    const provider = authOptions.providers[0] as unknown as CredentialsProviderLike

    const result = await provider.options.authorize(
      { identifier: 'User@example.com', password: 'StrongPassphrase1!' },
      { headers: { 'x-forwarded-for': '203.0.113.10, 10.0.0.1' } },
    )

    expect(result).toBeNull()
    expect(mockRateLimit).toHaveBeenCalledWith({
      bucket: 'auth-login',
      key: 'principal:user@example.com:ip:203.0.113.10',
      limit: 8,
      windowMs: 60_000,
    })
    expect(mockFindUserByIdentifier).not.toHaveBeenCalled()
    expect(mockVerifyPassword).not.toHaveBeenCalled()
  })

  it('returns null when the user record is missing or has no password hash', async () => {
    const authOptions = await loadAuthOptions()
    const provider = authOptions.providers[0] as unknown as CredentialsProviderLike

    mockFindUserByIdentifier.mockResolvedValueOnce(null)
    await expect(
      provider.options.authorize(
        { identifier: 'missing@example.com', password: 'StrongPassphrase1!' },
        { headers: {} },
      ),
    ).resolves.toBeNull()

    mockFindUserByIdentifier.mockResolvedValueOnce({ id: 'user-1', email: 'user@example.com', passwordHash: null })
    await expect(
      provider.options.authorize(
        { identifier: 'user@example.com', password: 'StrongPassphrase1!' },
        { headers: {} },
      ),
    ).resolves.toBeNull()

    expect(mockVerifyPassword).not.toHaveBeenCalled()
  })

  it('returns null when the password does not verify', async () => {
    mockFindUserByIdentifier.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'User',
      passwordHash: 'stored-hash',
    })
    mockVerifyPassword.mockResolvedValue(false)

    const authOptions = await loadAuthOptions()
    const provider = authOptions.providers[0] as unknown as CredentialsProviderLike

    await expect(
      provider.options.authorize(
        { identifier: 'user@example.com', password: 'WrongPassword123!' },
        { headers: {} },
      ),
    ).resolves.toBeNull()

    expect(mockVerifyPassword).toHaveBeenCalledWith('WrongPassword123!', 'stored-hash')
  })

  it('returns the normalized user payload when credentials are valid', async () => {
    mockFindUserByIdentifier.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'Desk User',
      passwordHash: 'stored-hash',
    })
    mockVerifyPassword.mockResolvedValue(true)

    const authOptions = await loadAuthOptions()
    const provider = authOptions.providers[0] as unknown as CredentialsProviderLike

    const result = await provider.options.authorize(
      { identifier: ' USER@example.com ', password: 'StrongPassphrase1!' },
      { headers: new Headers({ 'x-real-ip': '198.51.100.2' }) },
    )

    expect(mockRateLimit).toHaveBeenCalledWith({
      bucket: 'auth-login',
      key: 'principal:user@example.com:ip:198.51.100.2',
      limit: 8,
      windowMs: 60_000,
    })
    expect(mockFindUserByIdentifier).toHaveBeenCalledWith('user@example.com')
    expect(result).toEqual({
      id: 'user-1',
      email: 'user@example.com',
      name: 'Desk User',
    })
  })

  it('hydrates the session user id from the user object or token subject', async () => {
    const authOptions = await loadAuthOptions()
    const sessionCallback = authOptions.callbacks?.session as any

    const fromUser = await sessionCallback?.({
      session: { user: { email: 'desk@example.com', id: '' } } as any,
      user: { id: 'user-1' } as any,
      token: {} as any,
      newSession: null,
      trigger: 'update',
    })
    const fromToken = await sessionCallback?.({
      session: { user: { email: 'desk@example.com', id: '' } } as any,
      user: undefined as any,
      token: { sub: 'token-user-2' } as any,
      newSession: null,
      trigger: 'update',
    })

    expect((fromUser as any)?.user.id).toBe('user-1')
    expect((fromToken as any)?.user.id).toBe('token-user-2')
  })

  it('keeps JWT sessions enabled when PG auth is active', async () => {
    mockUsePgAuth.mockReturnValue(true)

    const authOptions = await loadAuthOptions()

    expect(authOptions.adapter).toEqual({ name: 'mock-prisma-adapter' })
    expect(authOptions.session?.strategy).toBe('jwt')
  })
})
