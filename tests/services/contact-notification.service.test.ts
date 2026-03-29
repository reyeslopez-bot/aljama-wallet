import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const markContactNotificationDelivery = vi.fn()
const logError = vi.fn()
const createTransport = vi.fn()
const sendMail = vi.fn()
const closeTransport = vi.fn()

vi.mock('@/services/contact-request.service', () => ({
  markContactNotificationDelivery,
  summarizeContactMessage: (message: string) => message.replace(/\s+/g, ' ').trim(),
}))

vi.mock('@/lib/security/logging', () => ({
  logError,
}))

vi.mock('nodemailer', () => ({
  createTransport,
  default: { createTransport },
}))

const record = {
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
}

describe('contact-notification.service', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    createTransport.mockReturnValue({
      sendMail,
      close: closeTransport,
    })
    sendMail.mockResolvedValue({ messageId: 'gmail-message-1' })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('delivers confirmation and internal emails through Gmail SMTP', async () => {
    vi.stubEnv('SUPPORT_EMAIL_PROVIDER', 'gmail')
    vi.stubEnv('SUPPORT_EMAIL_GMAIL_USER', 'ops@gmail.com')
    vi.stubEnv('SUPPORT_EMAIL_GMAIL_APP_PASSWORD', 'app-password-1234')
    vi.stubEnv('SUPPORT_EMAIL_INTERNAL_TO', 'inquiries@gmail.com')
    vi.stubEnv('SUPPORT_EMAIL_FROM', '')
    vi.stubEnv('SUPPORT_EMAIL_TIMEOUT_MS', '6000')

    const { deliverContactNotifications } = await import('@/services/contact-notification.service')
    const result = await deliverContactNotifications(record)

    expect(result).toEqual({
      confirmationEmailSent: true,
      internalEmailSent: true,
      webhookSent: false,
    })
    expect(createTransport).toHaveBeenCalledTimes(2)
    expect(createTransport).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        service: 'gmail',
        auth: {
          user: 'ops@gmail.com',
          pass: 'app-password-1234',
        },
        connectionTimeout: 6000,
        greetingTimeout: 6000,
        socketTimeout: 6000,
      }),
    )
    expect(sendMail).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        from: 'ops@gmail.com',
        to: 'user@example.com',
        subject: '[Aljama Wallet] We received your request (contact-1)',
      }),
    )
    expect(sendMail).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        from: 'ops@gmail.com',
        to: 'inquiries@gmail.com',
        subject: '[Aljama Wallet] New support request contact-1',
      }),
    )
    expect(closeTransport).toHaveBeenCalledTimes(2)
    expect(markContactNotificationDelivery).toHaveBeenCalledWith(
      'contact-1',
      expect.objectContaining({
        confirmationSentAt: expect.any(Date),
        internalNotifiedAt: expect.any(Date),
      }),
    )
    expect(logError).not.toHaveBeenCalled()
  })

  it('skips Gmail delivery when credentials are missing', async () => {
    vi.stubEnv('SUPPORT_EMAIL_PROVIDER', 'gmail')
    vi.stubEnv('SUPPORT_EMAIL_GMAIL_USER', 'ops@gmail.com')
    vi.stubEnv('SUPPORT_EMAIL_GMAIL_APP_PASSWORD', '')
    vi.stubEnv('SUPPORT_EMAIL_INTERNAL_TO', 'inquiries@gmail.com')
    vi.stubEnv('SUPPORT_EMAIL_FROM', '')

    const { deliverContactNotifications } = await import('@/services/contact-notification.service')
    const result = await deliverContactNotifications(record)

    expect(result).toEqual({
      confirmationEmailSent: false,
      internalEmailSent: false,
      webhookSent: false,
    })
    expect(createTransport).not.toHaveBeenCalled()
    expect(sendMail).not.toHaveBeenCalled()
    expect(markContactNotificationDelivery).toHaveBeenCalledWith('contact-1', {
      confirmationSentAt: null,
      internalNotifiedAt: null,
    })
  })
})
