import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/security/signals/route'
import { createSecuritySignalIngestSignature } from '@/lib/security/signal-ingest-auth'
import {
  clearSecurityAnomalyStateForTests,
  getRecentSecurityAnomalies,
  getRecentSecuritySignals,
} from '@/services/security-anomaly.service'
import {
  clearSecurityAlertsForTests,
  getSecurityAlerts,
} from '@/services/security-alert.service'

const PRODUCER_ID = 'event-bus'
const PRODUCER_SECRET = 'ingest-secret'

function createSignedRequest(body: unknown) {
  const rawBody = JSON.stringify(body)

  return new Request('http://localhost/api/security/signals', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-security-producer-id': PRODUCER_ID,
      'x-security-signature': createSecuritySignalIngestSignature(rawBody, PRODUCER_SECRET),
    },
    body: rawBody,
  })
}

describe('app/api/security/signals integration', () => {
  beforeEach(() => {
    clearSecurityAnomalyStateForTests()
    clearSecurityAlertsForTests()
    vi.unstubAllEnvs()

    vi.stubEnv(
      'SECURITY_SIGNAL_INGEST_HMAC_PRODUCERS',
      JSON.stringify({
        [PRODUCER_ID]: {
          secret: PRODUCER_SECRET,
          type: 'event_bus',
        },
      }),
    )
    vi.stubEnv('SECURITY_ANOMALY_FAILURE_BURST_THRESHOLD', '2')
    vi.stubEnv('SECURITY_ANOMALY_VELOCITY_THRESHOLD', '999')
    vi.stubEnv('SECURITY_SIGNAL_QUEUE_HIGH_WATER', '1000')
    vi.stubEnv('SECURITY_SIGNAL_QUEUE_LOW_WATER', '500')
  })

  it('processes ingested signals through queue, anomaly detection, alert emission, and producer audit fields', async () => {
    const res = await POST(
      createSignedRequest({
        transport: 'event_bus',
        enqueue: true,
        signals: [
          {
            source: 'auth.register',
            status: 401,
            ip: '198.51.100.42',
            principal: 'a@example.com',
          },
          {
            source: 'auth.register',
            status: 401,
            ip: '198.51.100.42',
            principal: 'b@example.com',
          },
        ],
      }),
    )

    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.accepted).toBe(2)
    expect(body.producerId).toBe(PRODUCER_ID)

    const anomalies = getRecentSecurityAnomalies(20)
    expect(anomalies.some((item) => item.ruleId === 'failure.burst')).toBe(true)

    const alerts = getSecurityAlerts(20)
    expect(alerts.some((item) => item.ruleId === 'failure.burst')).toBe(true)

    const authSignal = getRecentSecuritySignals(10).find((item) => item.source === 'auth.register')
    expect(authSignal).toMatchObject({
      producerId: PRODUCER_ID,
      producerType: 'event_bus',
      signatureVerified: true,
      ingestVersion: 'hmac-sha256-v1',
    })
  })
})
