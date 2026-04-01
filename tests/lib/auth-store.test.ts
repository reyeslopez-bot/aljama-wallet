import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockUserFindUnique,
  mockUserFindFirst,
  mockUserCreate,
  mockLogWarn,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockUserFindFirst: vi.fn(),
  mockUserCreate: vi.fn(),
  mockLogWarn: vi.fn(),
}))

vi.mock('@/lib/prisma-pg', () => ({
  prismaPg: {
    user: {
      findUnique: mockUserFindUnique,
      findFirst: mockUserFindFirst,
      create: mockUserCreate,
    },
  },
}))

vi.mock('@/lib/security/logging', () => ({
  logWarn: mockLogWarn,
}))

function clearDevAuthStore() {
  delete (globalThis as { authDevUsersById?: Map<string, unknown> }).authDevUsersById
}

describe('lib/auth/store', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    clearDevAuthStore()

    mockUserFindUnique.mockResolvedValue(null)
    mockUserFindFirst.mockResolvedValue(null)
    mockUserCreate.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    clearDevAuthStore()
  })

  it('uses explicit auth mode overrides before implicit environment detection', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('PG_DATABASE_URL', 'postgresql://example')
    vi.stubEnv('AUTH_MODE', '')

    const { usePgAuth } = await import('@/lib/auth/store')

    expect(usePgAuth()).toBe(false)

    vi.stubEnv('AUTH_MODE', 'pg')
    expect(usePgAuth()).toBe(true)

    vi.stubEnv('AUTH_MODE', 'memory')
    expect(usePgAuth()).toBe(false)
  })

  it('falls back to the in-memory auth store in development when PG writes and reads fail', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('AUTH_MODE', 'pg')

    mockUserCreate.mockRejectedValueOnce(new Error('pg down'))
    mockUserFindFirst.mockRejectedValueOnce(new Error('pg read down'))

    const { createUser, findUserByIdentifier } = await import('@/lib/auth/store')

    const createdUser = await createUser({
      username: 'Desk_User',
      email: 'Desk_User@example.com',
      passwordHash: 'hashed-password',
    })

    const foundUser = await findUserByIdentifier('desk_user@example.com')

    expect(createdUser.id).toMatch(/^dev_/)
    expect(createdUser.name).toBe('desk_user')
    expect(createdUser.email).toBe('desk_user@example.com')
    expect(foundUser).toEqual(createdUser)
    expect(mockLogWarn).toHaveBeenCalledWith('auth:create', expect.any(Error))
    expect(mockLogWarn).toHaveBeenCalledWith('auth:lookup-identifier', expect.any(Error))
  })

  it('throws instead of falling back when PG writes fail in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('AUTH_MODE', 'pg')

    const dbError = new Error('pg down')
    mockUserCreate.mockRejectedValueOnce(dbError)

    const { createUser } = await import('@/lib/auth/store')

    await expect(
      createUser({
        username: 'prod_user',
        email: 'prod@example.com',
        passwordHash: 'hashed-password',
      }),
    ).rejects.toThrow('pg down')

    expect(mockLogWarn).not.toHaveBeenCalled()
  })
})
