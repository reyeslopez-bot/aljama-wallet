import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockCreateContactRequest = vi.fn()
const mockDeliverContactNotifications = vi.fn()
const mockGetSession = vi.fn()

vi.mock('@/services/contact-request.service', () => ({
  createContactRequest: mockCreateContactRequest,
}))

vi.mock('@/services/contact-notification.service', () => ({
  deliverContactNotifications: mockDeliverContactNotifications,
}))

vi.mock('@/lib/security/session', () => ({
  getSession: mockGetSession,
}))

function buildRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/contact', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
    },
    body: JSON.stringify(body),
  })
}

describe('app/api/contact route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubEnv('NEXTAUTH_URL', 'http://localhost')
    vi.stubEnv('SECURITY_STRICT_MODE', 'false')
    mockGetSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com' },
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('rejects invalid payloads', async () => {
    const { POST } = await import('@/app/api/contact/route')
    const res = await POST(
      buildRequest({
        email: 'not-an-email',
        category: 'wallet_setup',
        message: 'too short',
      }),
    )

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      code: 'invalid_payload',
    })
  })

  it('stores the request and returns reference details', async () => {
    mockCreateContactRequest.mockResolvedValue({
      id: 'contact-1',
      userId: 'user-1',
      name: 'Rafael',
      email: 'user@example.com',
      category: 'payments_transfers',
      message: 'Transfer is stuck for more than 20 minutes.',
      locale: 'en',
      source: 'support-drawer',
      pagePath: '/en',
      status: 'received',
      requestId: 'req-1',
      traceId: 'trace-1',
      createdAt: new Date('2026-03-29T09:30:00.000Z'),
      updatedAt: new Date('2026-03-29T09:30:00.000Z'),
      confirmationSentAt: null,
      internalNotifiedAt: null,
    })
    mockDeliverContactNotifications.mockResolvedValue({
      confirmationEmailSent: true,
      internalEmailSent: true,
      webhookSent: false,
    })

    const { POST } = await import('@/app/api/contact/route')
    const res = await POST(
      buildRequest({
        name: 'Rafael',
        email: 'user@example.com',
        category: 'payments_transfers',
        message: 'Transfer is stuck for more than 20 minutes.',
        locale: 'en',
        source: 'support-drawer',
        pagePath: '/en',
      }),
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      referenceId: 'contact-1',
      replyWindow: 'within 1 business day',
      confirmationEmailSent: true,
    })
    expect(mockCreateContactRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        email: 'user@example.com',
        category: 'payments_transfers',
      }),
    )
  })

  it('still succeeds when notification delivery throws', async () => {
    mockCreateContactRequest.mockResolvedValue({
      id: 'contact-2',
      userId: null,
      name: null,
      email: 'user@example.com',
      category: 'other',
      message: 'Something odd happened on the wallet screen.',
      locale: 'en',
      source: 'support-drawer',
      pagePath: '/en',
      status: 'received',
      requestId: 'req-2',
      traceId: 'trace-2',
      createdAt: new Date('2026-03-29T10:00:00.000Z'),
      updatedAt: new Date('2026-03-29T10:00:00.000Z'),
      confirmationSentAt: null,
      internalNotifiedAt: null,
    })
    mockDeliverContactNotifications.mockRejectedValue(new Error('delivery failed'))

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { POST } = await import('@/app/api/contact/route')
    const res = await POST(
      buildRequest({
        email: 'user@example.com',
        category: 'other',
        message: 'Something odd happened on the wallet screen.',
      }),
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      referenceId: 'contact-2',
      confirmationEmailSent: false,
    })
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain('[contact:notifications] delivery failed')
  })
})
