import { logError } from '@/lib/security/logging'
import { getContactCategoryLabel, getSupportReplyWindow, type ContactCategory } from '@/lib/support/contact'
import {
  markContactNotificationDelivery,
  summarizeContactMessage,
  type ContactRequestRecord,
} from '@/services/contact-request.service'

type DeliveryResult = {
  confirmationEmailSent: boolean
  internalEmailSent: boolean
  webhookSent: boolean
}

type SendEmailPayload = {
  to: string
  subject: string
  text: string
}

type SupportEmailProvider = 'resend' | 'gmail' | 'none'

function env(name: string): string {
  return process.env[name]?.trim() ?? ''
}

function envInt(name: string, fallback: number): number {
  const parsed = Number(env(name))
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function subjectPrefix(): string {
  return env('SUPPORT_EMAIL_SUBJECT_PREFIX') || 'Aljama Wallet'
}

function supportGmailUser(): string {
  return env('SUPPORT_EMAIL_GMAIL_USER')
}

function supportGmailAppPassword(): string {
  return env('SUPPORT_EMAIL_GMAIL_APP_PASSWORD')
}

function supportFromEmail(provider: SupportEmailProvider = supportEmailProvider()): string {
  return env('SUPPORT_EMAIL_FROM') || (provider === 'gmail' ? supportGmailUser() : '')
}

function supportInternalTo(): string {
  return env('SUPPORT_EMAIL_INTERNAL_TO')
}

function supportWebhookUrl(): string {
  return env('SUPPORT_WEBHOOK_URL')
}

function supportSiteUrl(): string {
  return env('NEXT_PUBLIC_SITE_URL') || env('NEXTAUTH_URL') || 'http://localhost:2998'
}

function supportEmailProvider(): SupportEmailProvider {
  const configured = env('SUPPORT_EMAIL_PROVIDER').toLowerCase()
  if (configured === 'resend') return 'resend'
  if (configured === 'gmail') return 'gmail'
  return 'none'
}

function asCategory(value: string): ContactCategory {
  return value as ContactCategory
}

function formatMessageBlock(message: string): string {
  return message.trim().replace(/\r\n/g, '\n')
}

function buildConfirmationEmail(record: ContactRequestRecord): SendEmailPayload {
  const categoryLabel = getContactCategoryLabel(asCategory(record.category))
  const replyWindow = getSupportReplyWindow()
  const summary = summarizeContactMessage(record.message)

  return {
    to: record.email,
    subject: `[${subjectPrefix()}] We received your request (${record.id})`,
    text: [
      `We received your request and logged it under reference ${record.id}.`,
      '',
      `Category: ${categoryLabel}`,
      `Summary: ${summary}`,
      `Received at: ${new Date(record.createdAt).toISOString()}`,
      `Expected reply window: ${replyWindow}`,
      '',
      'Submitted message:',
      formatMessageBlock(record.message),
      '',
      `You can reply to this message or contact the team from ${supportSiteUrl()}.`,
    ].join('\n'),
  }
}

function buildInternalEmail(record: ContactRequestRecord): SendEmailPayload {
  const categoryLabel = getContactCategoryLabel(asCategory(record.category))

  return {
    to: supportInternalTo(),
    subject: `[${subjectPrefix()}] New support request ${record.id}`,
    text: [
      `Reference: ${record.id}`,
      `Category: ${categoryLabel}`,
      `Email: ${record.email}`,
      `Name: ${record.name ?? 'Not provided'}`,
      `Locale: ${record.locale ?? 'Unknown'}`,
      `Source: ${record.source ?? 'Unknown'}`,
      `Page: ${record.pagePath ?? 'Unknown'}`,
      `User ID: ${record.userId ?? 'Anonymous'}`,
      `Request ID: ${record.requestId ?? 'Unknown'}`,
      `Trace ID: ${record.traceId ?? 'Unknown'}`,
      `Received at: ${new Date(record.createdAt).toISOString()}`,
      '',
      'Message:',
      formatMessageBlock(record.message),
    ].join('\n'),
  }
}

async function sendEmailViaResend(payload: SendEmailPayload): Promise<boolean> {
  const apiKey = env('SUPPORT_EMAIL_API_KEY')
  const from = supportFromEmail('resend')
  if (!apiKey || !from) return false

  const controller = new AbortController()
  const timeoutMs = envInt('SUPPORT_EMAIL_TIMEOUT_MS', 4_000)
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [payload.to],
        subject: payload.subject,
        text: payload.text,
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new Error(`resend returned ${res.status}`)
    }

    return true
  } catch (error) {
    logError('support:email', error, { to: payload.to, subject: payload.subject })
    return false
  } finally {
    clearTimeout(timer)
  }
}

async function sendEmailViaGmail(payload: SendEmailPayload): Promise<boolean> {
  const user = supportGmailUser()
  const pass = supportGmailAppPassword()
  const from = supportFromEmail('gmail')
  if (!user || !pass || !from) return false

  let transport:
    | {
        sendMail: (input: { from: string; to: string; subject: string; text: string }) => Promise<unknown>
        close?: () => void
      }
    | null = null

  try {
    const nodemailerModule = await import('nodemailer')
    const createTransport =
      nodemailerModule.default?.createTransport ?? nodemailerModule.createTransport
    const timeoutMs = envInt('SUPPORT_EMAIL_TIMEOUT_MS', 4_000)

    const gmailTransport = createTransport({
      service: 'gmail',
      auth: {
        user,
        pass,
      },
      connectionTimeout: timeoutMs,
      greetingTimeout: timeoutMs,
      socketTimeout: timeoutMs,
    })
    transport = gmailTransport

    await gmailTransport.sendMail({
      from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
    })

    return true
  } catch (error) {
    logError('support:email', error, { to: payload.to, subject: payload.subject, provider: 'gmail' })
    return false
  } finally {
    transport?.close?.()
  }
}

async function sendSupportEmail(payload: SendEmailPayload): Promise<boolean> {
  const provider = supportEmailProvider()
  if (provider === 'resend') return sendEmailViaResend(payload)
  if (provider === 'gmail') return sendEmailViaGmail(payload)
  return false
}

async function postSupportWebhook(record: ContactRequestRecord): Promise<boolean> {
  const endpoint = supportWebhookUrl()
  if (!endpoint) return false

  const controller = new AbortController()
  const timeoutMs = envInt('SUPPORT_WEBHOOK_TIMEOUT_MS', 2_000)
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'support.contact_request',
        schemaVersion: '1',
        referenceId: record.id,
        category: record.category,
        categoryLabel: getContactCategoryLabel(asCategory(record.category)),
        email: record.email,
        name: record.name ?? null,
        locale: record.locale ?? null,
        source: record.source ?? null,
        pagePath: record.pagePath ?? null,
        userId: record.userId ?? null,
        requestId: record.requestId ?? null,
        traceId: record.traceId ?? null,
        createdAt: new Date(record.createdAt).toISOString(),
        summary: summarizeContactMessage(record.message),
        message: record.message,
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new Error(`support webhook returned ${res.status}`)
    }

    return true
  } catch (error) {
    logError('support:webhook', error, { referenceId: record.id })
    return false
  } finally {
    clearTimeout(timer)
  }
}

export async function deliverContactNotifications(record: ContactRequestRecord): Promise<DeliveryResult> {
  const confirmationEmailSent = await sendSupportEmail(buildConfirmationEmail(record))
  const internalEmailSent = supportInternalTo()
    ? await sendSupportEmail(buildInternalEmail(record))
    : false
  const webhookSent = await postSupportWebhook(record)

  try {
    await markContactNotificationDelivery(record.id, {
      confirmationSentAt: confirmationEmailSent ? new Date() : null,
      internalNotifiedAt: internalEmailSent || webhookSent ? new Date() : null,
    })
  } catch (error) {
    logError('support:notification-state', error, {
      referenceId: record.id,
      confirmationEmailSent,
      internalEmailSent,
      webhookSent,
    })
  }

  return {
    confirmationEmailSent,
    internalEmailSent,
    webhookSent,
  }
}
