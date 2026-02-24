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
})
