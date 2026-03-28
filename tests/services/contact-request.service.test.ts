import { beforeEach, describe, expect, it, vi } from 'vitest'

const createMock = vi.fn()
const updateMock = vi.fn()

vi.mock('@/lib/prisma-pg', () => ({
  prismaPg: {
    contactRequest: {
      create: createMock,
      update: updateMock,
    },
  },
}))

describe('contact-request.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes email and trims optional fields before persisting', async () => {
    const { createContactRequest } = await import('@/services/contact-request.service')

    createMock.mockResolvedValue({
      id: 'contact-1',
      email: 'user@example.com',
      category: 'wallet_setup',
      message: 'Need help with wallet setup',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await createContactRequest({
      userId: 'user-1',
      name: '  Rafael  ',
      email: '  User@Example.com  ',
      category: 'wallet_setup',
      message: '  Need help with wallet setup  ',
      locale: ' en ',
      source: ' support-drawer ',
      pagePath: ' /en ',
      requestId: ' req-1 ',
      traceId: ' trace-1 ',
    })

    expect(createMock).toHaveBeenCalledTimes(1)
    expect(createMock.mock.calls[0]?.[0]).toMatchObject({
      data: {
        userId: 'user-1',
        name: 'Rafael',
        email: 'user@example.com',
        category: 'wallet_setup',
        message: 'Need help with wallet setup',
        locale: 'en',
        source: 'support-drawer',
        pagePath: '/en',
        requestId: 'req-1',
        traceId: 'trace-1',
      },
    })
  })

  it('builds a compact summary for notification copy', async () => {
    const { summarizeContactMessage } = await import('@/services/contact-request.service')

    expect(
      summarizeContactMessage('  Transfer is stuck\n\nfor more than 20 minutes on Base mainnet.  ', 48),
    ).toBe('Transfer is stuck for more than 20 minutes on B…')
  })
})
