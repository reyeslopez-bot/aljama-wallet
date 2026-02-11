import { describe, it, expect, vi, beforeEach } from 'vitest'

const upsertMock = vi.fn()

vi.mock('@/lib/prisma-pg', () => ({
  prismaPg: {
    signup: {
      upsert: upsertMock,
    },
  },
}))

describe('signup.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes email before upsert (trim + lowercase)', async () => {
    // NOTE: We want to guarantee that the DB key is canonical.
    // This prevents duplicates like "User@Mail.com" vs "user@mail.com".
    const { upsertSignup } = await import('@/services/signup.service')

    upsertMock.mockResolvedValue({
      id: 'signup-1',
      email: 'user@mail.com',
      region: null,
      source: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await upsertSignup({ email: '  User@Mail.com  ', region: 'eu', source: 'ui' })

    const call = upsertMock.mock.calls[0]?.[0]
    expect(call?.where?.email).toBe('user@mail.com')
    expect(call?.create?.email).toBe('user@mail.com')
  })

  it('throws on empty email input', async () => {
    // NOTE: The service should guard against empty inputs
    // so the API can return a clean 4xx error.
    const { upsertSignup } = await import('@/services/signup.service')

    await expect(
      upsertSignup({ email: '   ' }),
    ).rejects.toThrow(/email is required/)
  })
})
