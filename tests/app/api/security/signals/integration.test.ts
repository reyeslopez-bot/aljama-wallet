import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/security/signals/route'
import {
  clearSecurityAnomalyStateForTests,
  getRecentSecurityAnomalies,
} from '@/services/security-anomaly.service'
import {
  clearSecurityAlertsForTests,
  getSecurityAlerts,
} from '@/services/security-alert.service'

describe('app/api/security/signals integration', () => {
  beforeEach(() => {
    clearSecurityAnomalyStateForTests()
    clearSecurityAlertsForTests()
    vi.unstubAllEnvs()

    vi.stubEnv('SECURITY_SIGNAL_INGEST_TOKEN', 'ingest-token')
    vi.stubEnv('SECURITY_ANOMALY_FAILURE_BURST_THRESHOLD', '2')
    vi.stubEnv('SECURITY_ANOMALY_VELOCITY_THRESHOLD', '999')
    vi.stubEnv('SECURITY_SIGNAL_QUEUE_HIGH_WATER', '1000')
    vi.stubEnv('SECURITY_SIGNAL_QUEUE_LOW_WATER', '500')
  })

  it('processes ingested signals through queue, anomaly detection, and alert emission', async () => {
    const res = await POST(
      new Request('http://localhost/api/security/signals', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer ingest-token',
        },
        body: JSON.stringify({
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
      }),
    )

    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.accepted).toBe(2)

    const anomalies = getRecentSecurityAnomalies(20)
    expect(anomalies.some((item) => item.ruleId === 'failure.burst')).toBe(true)

    const alerts = getSecurityAlerts(20)
    expect(alerts.some((item) => item.ruleId === 'failure.burst')).toBe(true)
  })
})
