import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearSecurityAlertsForTests,
  emitSecurityAlert,
} from '@/services/security-alert.service'

describe('security-alert.service', () => {
  beforeEach(() => {
    clearSecurityAlertsForTests()
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('deduplicates by rule + source + fingerprint within dedup window', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    vi.stubEnv('SECURITY_ALERT_DEDUP_WINDOW_MS', '1000')
    vi.stubEnv('SECURITY_ALERT_DEDUP_TTL_MS', '1000')

    const first = await emitSecurityAlert({
      ruleId: 'failure.burst',
      source: 'auth.register',
      severity: 'high',
      repetitive: true,
      title: 'First',
      description: 'first',
      fingerprint: 'ip-a',
    })

    vi.setSystemTime(new Date('2026-01-01T00:00:00.500Z'))
    const second = await emitSecurityAlert({
      ruleId: 'failure.burst',
      source: 'auth.register',
      severity: 'high',
      repetitive: true,
      title: 'Second',
      description: 'second',
      fingerprint: 'ip-a',
    })

    vi.setSystemTime(new Date('2026-01-01T00:00:00.500Z'))
    const thirdDifferentSource = await emitSecurityAlert({
      ruleId: 'failure.burst',
      source: 'wallet.send',
      severity: 'high',
      repetitive: true,
      title: 'Third',
      description: 'third',
      fingerprint: 'ip-a',
    })

    expect(first.deduped).toBe(false)
    expect(second.deduped).toBe(true)
    expect(second.dedup.duplicateCount).toBe(1)
    expect(thirdDifferentSource.deduped).toBe(false)

    vi.setSystemTime(new Date('2026-01-01T00:00:02.000Z'))
    const fourthAfterWindow = await emitSecurityAlert({
      ruleId: 'failure.burst',
      source: 'auth.register',
      severity: 'high',
      repetitive: true,
      title: 'Fourth',
      description: 'fourth',
      fingerprint: 'ip-a',
    })

    expect(fourthAfterWindow.deduped).toBe(false)
  })

  it('escalates duplicate alerts after threshold and delivers webhook on escalation', async () => {
    vi.stubEnv('SECURITY_ALERT_WEBHOOK_URL', 'https://alerts.example.test/security')
    vi.stubEnv('SECURITY_ALERT_WEBHOOK_MIN_SEVERITY', 'low')
    vi.stubEnv('SECURITY_ALERT_DEDUP_WINDOW_MS', '60000')
    vi.stubEnv('SECURITY_ALERT_DUPLICATE_ESCALATE_AFTER', '2')
    vi.stubEnv('SECURITY_ALERT_DUPLICATE_ESCALATE_EVERY', '2')

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const first = await emitSecurityAlert({
      ruleId: 'probe.internal_route',
      source: 'internal.test-db',
      severity: 'medium',
      repetitive: false,
      title: 'first',
      description: 'first',
      fingerprint: 'probe-a',
    })
    const second = await emitSecurityAlert({
      ruleId: 'probe.internal_route',
      source: 'internal.test-db',
      severity: 'medium',
      repetitive: false,
      title: 'second',
      description: 'second',
      fingerprint: 'probe-a',
    })
    const third = await emitSecurityAlert({
      ruleId: 'probe.internal_route',
      source: 'internal.test-db',
      severity: 'medium',
      repetitive: false,
      title: 'third',
      description: 'third',
      fingerprint: 'probe-a',
    })

    expect(first.deduped).toBe(false)
    expect(second.deduped).toBe(true)
    expect(second.dedup.escalated).toBe(false)

    expect(third.deduped).toBe(true)
    expect(third.dedup.duplicateCount).toBe(2)
    expect(third.dedup.escalated).toBe(true)
    expect(third.baseSeverity).toBe('medium')
    expect(third.severity).toBe('high')

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('logs only first and escalated duplicates by default', async () => {
    vi.stubEnv('SECURITY_ALERT_DEDUP_WINDOW_MS', '60000')
    vi.stubEnv('SECURITY_ALERT_DUPLICATE_ESCALATE_AFTER', '2')
    vi.stubEnv('SECURITY_ALERT_DUPLICATE_ESCALATE_EVERY', '2')

    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    await emitSecurityAlert({
      ruleId: 'failure.burst',
      source: 'auth.register',
      severity: 'high',
      repetitive: true,
      title: 'first',
      description: 'first',
      fingerprint: 'ip-log',
    })
    await emitSecurityAlert({
      ruleId: 'failure.burst',
      source: 'auth.register',
      severity: 'high',
      repetitive: true,
      title: 'second',
      description: 'second',
      fingerprint: 'ip-log',
    })
    await emitSecurityAlert({
      ruleId: 'failure.burst',
      source: 'auth.register',
      severity: 'high',
      repetitive: true,
      title: 'third',
      description: 'third',
      fingerprint: 'ip-log',
    })

    expect(infoSpy).toHaveBeenCalledTimes(2)
    expect(String(infoSpy.mock.calls[0]?.[0])).toContain('[security-alert] first')
    expect(String(infoSpy.mock.calls[1]?.[0])).toContain('[security-alert] third')
  })

  it('delivers structured events to SIEM and SOAR with priority and runbook metadata', async () => {
    vi.stubEnv('SECURITY_ALERT_SIEM_URL', 'https://siem.example.test/ingest')
    vi.stubEnv('SECURITY_ALERT_SOAR_URL', 'https://soar.example.test/events')
    vi.stubEnv('SECURITY_ALERT_SIEM_MIN_SEVERITY', 'medium')
    vi.stubEnv('SECURITY_ALERT_SOAR_MIN_SEVERITY', 'high')
    vi.stubEnv('SECURITY_ALERT_RUNBOOK_BASE_URL', 'https://runbooks.example.test/security')

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await emitSecurityAlert({
      ruleId: 'failure.burst',
      source: 'auth.register',
      severity: 'high',
      repetitive: true,
      title: 'Failure burst detected',
      description: 'Multiple failures detected',
      fingerprint: 'ip-xyz',
      runbookHint: 'Check auth logs, rate limits, and recent source IP concentration before containment.',
      context: { tenantId: 'tenant-1' },
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)

    const siemPayload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    const soarPayload = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))

    expect(siemPayload.type).toBe('security.alert')
    expect(siemPayload.priority).toBe('p2')
    expect(siemPayload.runbook?.id).toBe('RB-AUTH-001')
    expect(siemPayload.runbook?.url).toContain('auth-failure-burst')
    expect(siemPayload.runbookHint).toContain('Check auth logs')

    expect(soarPayload.type).toBe('security.alert')
    expect(soarPayload.priority).toBe('p2')
    expect(soarPayload.source).toBe('auth.register')
    expect(soarPayload.runbookHint).toContain('Check auth logs')
  })

  it('sends containment requests to SOAR when containment policy matches', async () => {
    vi.stubEnv('SECURITY_ALERT_SOAR_URL', 'https://soar.example.test/events')
    vi.stubEnv('SECURITY_ALERT_AUTO_CONTAIN_ENABLED', 'true')
    vi.stubEnv('SECURITY_ALERT_AUTO_CONTAIN_RULES', 'probe.internal_route')
    vi.stubEnv('SECURITY_ALERT_CONTAINMENT_MIN_SEVERITY', 'critical')

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await emitSecurityAlert({
      ruleId: 'probe.internal_route',
      source: 'internal.test-db',
      severity: 'critical',
      repetitive: false,
      title: 'Internal route probe',
      description: 'Unauthorized attempt',
      fingerprint: 'ip-probe',
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)

    const firstPayload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    const secondPayload = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))

    expect(firstPayload.type).toBe('security.alert')
    expect(secondPayload.type).toBe('security.containment.request')
    expect(secondPayload.actions).toContain('block_source')
  })
})
