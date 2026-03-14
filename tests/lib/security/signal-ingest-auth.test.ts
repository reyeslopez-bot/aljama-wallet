import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  authenticateSecuritySignalProducer,
  createSecuritySignalIngestSignature,
  getSecuritySignalProducerRegistry,
} from '@/lib/security/signal-ingest-auth'

const PRODUCER_ID = 'event-bus'
const PRODUCER_SECRET = 'top-secret'

describe('signal-ingest-auth', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  it('parses configured HMAC producers from env', () => {
    vi.stubEnv(
      'SECURITY_SIGNAL_INGEST_HMAC_PRODUCERS',
      JSON.stringify({
        [PRODUCER_ID]: {
          secret: PRODUCER_SECRET,
          type: 'event_bus',
        },
      }),
    )

    const registry = getSecuritySignalProducerRegistry()
    expect(registry.ok).toBe(true)
    if (!registry.ok) return

    expect(registry.producers.get(PRODUCER_ID)).toEqual({
      secret: PRODUCER_SECRET,
      type: 'event_bus',
    })
  })

  it('authenticates a signed request body', () => {
    const rawBody = JSON.stringify({ source: 'auth.register', outcome: 'failure' })
    const signature = createSecuritySignalIngestSignature(rawBody, PRODUCER_SECRET)
    const req = new Request('https://example.com/api/security/signals', {
      method: 'POST',
      headers: {
        'x-security-producer-id': PRODUCER_ID,
        'x-security-signature': `sha256=${signature}`,
      },
      body: rawBody,
    })

    const result = authenticateSecuritySignalProducer(
      req,
      rawBody,
      new Map([[PRODUCER_ID, { secret: PRODUCER_SECRET, type: 'event_bus' }]]),
    )

    expect(result).toEqual({
      ok: true,
      producer: {
        producerId: PRODUCER_ID,
        producerType: 'event_bus',
        signatureVerified: true,
        ingestVersion: 'hmac-sha256-v1',
      },
    })
  })

  it('rejects missing producer identifiers', () => {
    const rawBody = JSON.stringify({ source: 'auth.register', outcome: 'failure' })
    const req = new Request('https://example.com/api/security/signals', {
      method: 'POST',
      headers: {
        'x-security-signature': createSecuritySignalIngestSignature(rawBody, PRODUCER_SECRET),
      },
      body: rawBody,
    })

    const result = authenticateSecuritySignalProducer(
      req,
      rawBody,
      new Map([[PRODUCER_ID, { secret: PRODUCER_SECRET, type: 'event_bus' }]]),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.reason).toBe('missing_producer_id')
    expect(result.audit.signatureVerified).toBe(false)
  })

  it('rejects invalid signatures', () => {
    const rawBody = JSON.stringify({ source: 'auth.register', outcome: 'failure' })
    const req = new Request('https://example.com/api/security/signals', {
      method: 'POST',
      headers: {
        'x-security-producer-id': PRODUCER_ID,
        'x-security-signature': '0'.repeat(64),
      },
      body: rawBody,
    })

    const result = authenticateSecuritySignalProducer(
      req,
      rawBody,
      new Map([[PRODUCER_ID, { secret: PRODUCER_SECRET, type: 'event_bus' }]]),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.reason).toBe('invalid_signature')
    expect(result.audit.producerId).toBe(PRODUCER_ID)
    expect(result.audit.producerType).toBe('event_bus')
  })
})
