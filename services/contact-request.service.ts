import { prismaPg } from '@/lib/prisma-pg'
import type { ContactCategory } from '@/lib/support/contact'

export type ContactRequestInput = {
  userId?: string | null
  name?: string | null
  email: string
  category: ContactCategory
  message: string
  locale?: string | null
  source?: string | null
  pagePath?: string | null
  requestId?: string | null
  traceId?: string | null
}

function normalizeOptionalField(value: string | null | undefined, maxLength: number): string | null {
  const normalized = value?.trim() ?? ''
  if (!normalized) return null
  return normalized.slice(0, maxLength)
}

function normalizeRequiredField(value: string, maxLength: number, fieldName: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${fieldName} is required`)
  return normalized.slice(0, maxLength)
}

export function summarizeContactMessage(message: string, maxLength = 180): string {
  const compact = message.replace(/\s+/g, ' ').trim()
  if (compact.length <= maxLength) return compact
  return `${compact.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

export async function createContactRequest(input: ContactRequestInput) {
  const email = normalizeRequiredField(input.email.toLowerCase(), 256, 'email')
  const category = normalizeRequiredField(input.category, 64, 'category')
  const message = normalizeRequiredField(input.message, 4_000, 'message')

  return prismaPg.contactRequest.create({
    data: {
      userId: input.userId ?? null,
      name: normalizeOptionalField(input.name, 120),
      email,
      category,
      message,
      locale: normalizeOptionalField(input.locale, 16),
      source: normalizeOptionalField(input.source, 64),
      pagePath: normalizeOptionalField(input.pagePath, 256),
      requestId: normalizeOptionalField(input.requestId, 64),
      traceId: normalizeOptionalField(input.traceId, 64),
    },
    select: {
      id: true,
      userId: true,
      name: true,
      email: true,
      category: true,
      message: true,
      locale: true,
      source: true,
      pagePath: true,
      status: true,
      requestId: true,
      traceId: true,
      createdAt: true,
      updatedAt: true,
      confirmationSentAt: true,
      internalNotifiedAt: true,
    },
  })
}

export type ContactRequestRecord = Awaited<ReturnType<typeof createContactRequest>>

export async function markContactNotificationDelivery(
  id: string,
  input: {
    confirmationSentAt?: Date | null
    internalNotifiedAt?: Date | null
  },
) {
  if (!input.confirmationSentAt && !input.internalNotifiedAt) return null

  return prismaPg.contactRequest.update({
    where: { id },
    data: {
      ...(input.confirmationSentAt ? { confirmationSentAt: input.confirmationSentAt } : {}),
      ...(input.internalNotifiedAt ? { internalNotifiedAt: input.internalNotifiedAt } : {}),
    },
    select: {
      id: true,
      confirmationSentAt: true,
      internalNotifiedAt: true,
    },
  })
}
