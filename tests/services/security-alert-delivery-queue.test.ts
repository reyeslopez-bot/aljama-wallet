import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSecurityAlertDeliveryQueueFromEnv,
  getSecurityAlertDeliveryQueueAdapterHealth,
  InMemorySecurityAlertDeliveryQueueAdapter,
  RedisSecurityAlertDeliveryQueueAdapter,
  resetSecurityAlertDeliveryQueueAdapterHealthForTests,
  type SecurityAlertDeliveryJob,
} from '@/services/security-alert-delivery-queue'
import type { SecurityAlertRecord } from '@/services/security-alert.service'

type FakeStreamEntry = {
  id: string
  fields: Record<string, string>
}

class FakeRedisStreamsClient {
  private stream: FakeStreamEntry[] = []
  private pending = new Map<string, { consumer: string; deliveredAt: number }>()
  private idCounter = 0

  async sendCommand(args: string[]): Promise<unknown> {
    const command = args[0]?.toUpperCase()
    if (!command) return null

    switch (command) {
      case 'XGROUP':
        return 'OK'
      case 'XLEN':
        return this.stream.length
      case 'XADD':
        return this.handleXAdd(args)
      case 'XREADGROUP':
        return this.handleXReadGroup(args)
      case 'XAUTOCLAIM':
        return this.handleXAutoClaim(args)
      case 'XACK':
        return this.handleXAck(args)
      case 'XINFO':
        return this.handleXInfoGroups(args)
      case 'XRANGE':
        return this.handleXRange()
      case 'XREVRANGE':
        return this.handleXRevRange()
      case 'DEL':
        this.stream = []
        this.pending.clear()
        return 1
      default:
        throw new Error(`Unsupported command in fake redis client: ${command}`)
    }
  }

  private nextId(): string {
    this.idCounter += 1
    return `${Date.now()}-${this.idCounter}`
  }

  private parseFieldPairs(values: string[]): Record<string, string> {
    const fields: Record<string, string> = {}
    for (let index = 0; index < values.length; index += 2) {
      const key = values[index]
      const value = values[index + 1]
      if (!key || value === undefined) continue
      fields[key] = value
    }
    return fields
  }

  private handleXAdd(args: string[]) {
    const starIndex = args.findIndex((item) => item === '*')
    if (starIndex === -1) {
      throw new Error('Missing * in XADD')
    }

    const id = this.nextId()
    const fields = this.parseFieldPairs(args.slice(starIndex + 1))
    this.stream.push({ id, fields })
    return id
  }

  private handleXReadGroup(args: string[]) {
    const consumer = args[3]
    const countIndex = args.findIndex((item) => item.toUpperCase() === 'COUNT')
    const requested = countIndex === -1 ? 1 : Math.max(1, Number(args[countIndex + 1]) || 1)

    const messages: Array<[string, string[]]> = []
    for (const entry of this.stream) {
      if (this.pending.has(entry.id)) continue
      this.pending.set(entry.id, {
        consumer,
        deliveredAt: Date.now(),
      })

      const flatFields = Object.entries(entry.fields).flatMap(([key, value]) => [key, value])
      messages.push([entry.id, flatFields])
      if (messages.length >= requested) break
    }

    if (messages.length === 0) return []
    return [['security:alert-delivery', messages]]
  }

  private handleXAutoClaim(args: string[]) {
    const consumer = args[3]
    const minIdle = Math.max(0, Number(args[4]) || 0)
    const countIndex = args.findIndex((item) => item.toUpperCase() === 'COUNT')
    const requested = countIndex === -1 ? 1 : Math.max(1, Number(args[countIndex + 1]) || 1)

    const now = Date.now()
    const entries: Array<[string, string[]]> = []

    for (const [id, pending] of this.pending.entries()) {
      if (now - pending.deliveredAt < minIdle) continue

      const streamEntry = this.stream.find((item) => item.id === id)
      if (!streamEntry) continue

      this.pending.set(id, {
        consumer,
        deliveredAt: now,
      })

      const flatFields = Object.entries(streamEntry.fields).flatMap(([key, value]) => [key, value])
      entries.push([id, flatFields])
      if (entries.length >= requested) break
    }

    return ['0-0', entries, []]
  }

  private handleXAck(args: string[]) {
    const ids = args.slice(3)
    let acked = 0
    for (const id of ids) {
      if (this.pending.delete(id)) acked += 1
    }
    return acked
  }

  private handleXInfoGroups(args: string[]) {
    const group = args[3] ?? 'deliveryGroup'
    const lag = this.stream.filter((entry) => !this.pending.has(entry.id)).length
    return [['name', group, 'consumers', 1, 'pending', this.pending.size, 'lag', lag]]
  }

  private handleXRange() {
    const first = this.stream[0]
    if (!first) return []
    return [[first.id, Object.entries(first.fields).flatMap(([key, value]) => [key, value])]]
  }

  private handleXRevRange() {
    const last = this.stream[this.stream.length - 1]
    if (!last) return []
    return [[last.id, Object.entries(last.fields).flatMap(([key, value]) => [key, value])]]
  }
}

function sampleAlertRecord(): SecurityAlertRecord {
  return {
    id: 'alert-1',
    ruleId: 'failure.burst',
    source: 'auth.register',
    severity: 'high',
    baseSeverity: 'high',
    priority: 'p2',
    repetitive: true,
    deduped: false,
    fingerprint: 'ip-1',
    title: 'Failure burst',
    description: 'Multiple failures detected',
    runbookHint: null,
    context: { tenantId: 'tenant-1' },
    runbook: {
      id: 'RB-AUTH-001',
      title: 'Investigate authentication failure burst',
      url: 'https://runbooks.example.test/auth-failure-burst',
    },
    dedup: {
      key: 'failure.burst:auth.register:ip-1',
      duplicateCount: 0,
      windowMs: 60_000,
      ttlMs: 60_000,
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
      escalated: false,
    },
    delivered: {
      log: true,
      webhook: false,
      siem: false,
      soar: false,
      containment: false,
    },
    createdAt: Date.now(),
  }
}

function sampleJob(): SecurityAlertDeliveryJob {
  return {
    alertId: 'alert-1',
    record: sampleAlertRecord(),
    socPayload: {
      type: 'security.alert',
      alertId: 'alert-1',
    },
    containmentActions: ['throttle_source'],
  }
}

describe('security-alert-delivery-queue', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
    resetSecurityAlertDeliveryQueueAdapterHealthForTests()
  })

  it('supports enqueue -> dequeue -> ack on the in-memory adapter', async () => {
    const adapter = new InMemorySecurityAlertDeliveryQueueAdapter()

    const enqueue = await adapter.enqueue(sampleJob())
    expect(enqueue.message.id).toBeTruthy()

    const dequeued = await adapter.dequeue(5)
    expect(dequeued).toHaveLength(1)
    expect(dequeued[0]?.job.alertId).toBe('alert-1')

    await adapter.ack(dequeued[0]!)

    const stats = await adapter.getStats()
    expect(stats.depth).toBe(0)
    expect(stats.pending).toBe(0)
  })

  it('supports enqueue -> dequeue -> ack on the redis adapter', async () => {
    const client = new FakeRedisStreamsClient()
    const adapter = RedisSecurityAlertDeliveryQueueAdapter.fromClient(client)

    await adapter.enqueue(sampleJob(), { retryCount: 2 })

    const dequeued = await adapter.dequeue(5)
    expect(dequeued).toHaveLength(1)
    expect(dequeued[0]?.job.record.ruleId).toBe('failure.burst')
    expect(dequeued[0]?.retryCount).toBe(2)

    await adapter.ack(dequeued[0]!)

    const stats = await adapter.getStats()
    expect(stats.pending).toBe(0)
  })

  it('fails closed in production when redis is not configured as the delivery queue backend', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SECURITY_ALERT_DELIVERY_QUEUE_BACKEND', 'in_memory')
    vi.stubEnv('SECURITY_ALERT_DELIVERY_QUEUE_REQUIRE_DURABLE', '')

    await expect(createSecurityAlertDeliveryQueueFromEnv()).rejects.toThrow('durable_queue_required')

    const health = getSecurityAlertDeliveryQueueAdapterHealth()
    expect(health.requestedBackend).toBe('in_memory')
    expect(health.activeBackend).toBe('in_memory')
    expect(health.degraded).toBe(true)
    expect(health.requireDurable).toBe(true)
  })
})
