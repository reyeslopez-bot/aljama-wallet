import { CONSENT_PROMPT_VERSION, CONSENT_RECEIPT_ID_KEY } from '@/infra/consent/constants'

type ConsentChoice = {
  telemetryGranted: boolean
  locationGranted: boolean
}

export function getConsentReceiptId(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(CONSENT_RECEIPT_ID_KEY)
}

function getOrCreateReceiptId(): string {
  const existing = window.localStorage.getItem(CONSENT_RECEIPT_ID_KEY)
  if (existing) return existing

  const receiptId = globalThis.crypto.randomUUID()
  window.localStorage.setItem(CONSENT_RECEIPT_ID_KEY, receiptId)
  return receiptId
}

export async function recordConsentChoice(choice: ConsentChoice): Promise<void> {
  const response = await fetch('/api/privacy/consent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      receiptId: getOrCreateReceiptId(),
      consentVersion: CONSENT_PROMPT_VERSION,
      ...choice,
    }),
  })

  if (!response.ok) {
    throw new Error(`Consent evidence request failed with status ${response.status}`)
  }
}

export async function getConsentReceiptHistory(): Promise<Array<{
  id: string
  consentVersion: string
  telemetryGranted: boolean
  locationGranted: boolean
  changeType: 'initial' | 'changed' | 'withdrawn'
  createdAt: string
}>> {
  const receiptId = getConsentReceiptId()
  if (!receiptId) return []

  const response = await fetch('/api/privacy/consent', {
    headers: { 'x-consent-receipt-id': receiptId },
  })
  if (!response.ok) {
    throw new Error(`Consent evidence request failed with status ${response.status}`)
  }

  const body = (await response.json()) as { receipts: Array<{
    id: string
    consentVersion: string
    telemetryGranted: boolean
    locationGranted: boolean
    changeType: 'initial' | 'changed' | 'withdrawn'
    createdAt: string
  }> }
  return body.receipts
}
