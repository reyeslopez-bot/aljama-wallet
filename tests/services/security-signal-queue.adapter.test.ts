import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  InMemoryQueueAdapter,
  RedisQueueAdapter,
  type QueueSignalPayload,
} from '@/services/security-signal-queue.adapter'

function sampleSignal(overrides?: Partial<QueueSignalPayload>): QueueSignalPayload {
  return {
    source: 'auth.register',
    outcome: 'failure',
    ...overrides,
  }
}

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
      case 'XPENDING':
        return [this.pending.size, '0-0', '0-0', []]
      case 'XINFO':
        return this.handleXInfoGroups(args)
      case 'XRANGE':
        return this.handleXRange(args)
      case 'XREVRANGE':
        return this.handleXRevRange(args)
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
    const maxLenIndex = args.findIndex((item) => item.toUpperCase() === 'MAXLEN')
    let maxLen: number | null = null
    if (maxLenIndex !== -1) {
      const raw = Number(args[maxLenIndex + 2])
      if (Number.isFinite(raw) && raw > 0) {
        maxLen = Math.floor(raw)
      }
    }

    const starIndex = args.findIndex((item) => item === '*')
    if (starIndex === -1) {
      throw new Error('Missing * in XADD')
    }

    const id = this.nextId()
    const fields = this.parseFieldPairs(args.slice(starIndex + 1))
    this.stream.push({ id, fields })

    if (maxLen !== null && this.stream.length > maxLen) {
      const overflow = this.stream.length - maxLen
      const removed = this.stream.splice(0, overflow)
      for (const entry of removed) {
        this.pending.delete(entry.id)
      }
    }

    return id
  }

  private handleXReadGroup(args: string[]) {
    const group = args[2]
    const consumer = args[3]
    void group

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

    if (messages.length === 0) {
      return []
    }

    return [['security:signals', messages]]
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
    const group = args[3] ?? 'detectionGroup'
    const lag = this.stream.filter((entry) => !this.pending.has(entry.id)).length
    return [['name', group, 'consumers', 1, 'pending', this.pending.size, 'lag', lag]]
  }

  private handleXRange(_args: string[]) {
    const first = this.stream[0]
    if (!first) return []
    return [[first.id, Object.entries(first.fields).flatMap(([key, value]) => [key, value])]]
  }

  private handleXRevRange(_args: string[]) {
    const last = this.stream[this.stream.length - 1]
    if (!last) return []
    return [[last.id, Object.entries(last.fields).flatMap(([key, value]) => [key, value])]]
  }
}

describe('security-signal-queue adapters', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('supports enqueue -> dequeue -> ack on in-memory adapter', async () => {
    const adapter = new InMemoryQueueAdapter()

    const enqueue = await adapter.enqueue(sampleSignal({ source: 'wallet.send' }), {
      transport: 'api',
    })
    expect(enqueue.message.id).toBeTruthy()

    const dequeued = await adapter.dequeue(5)
    expect(dequeued.length).toBe(1)
    expect(dequeued[0]?.signal.source).toBe('wallet.send')

    await adapter.ack(dequeued[0]!)

    const stats = await adapter.getStats()
    expect(stats.depth).toBe(0)
    expect(stats.pending).toBe(0)
  })

  it('redelivers unacked messages on in-memory adapter', async () => {
    vi.stubEnv('SECURITY_SIGNAL_QUEUE_ACK_TIMEOUT_MS', '1')
    const adapter = new InMemoryQueueAdapter()

    await adapter.enqueue(sampleSignal())

    const first = await adapter.dequeue(1)
    expect(first.length).toBe(1)

    await new Promise((resolve) => setTimeout(resolve, 5))

    const second = await adapter.dequeue(1)
    expect(second.length).toBe(1)
    expect(second[0]?.id).toBe(first[0]?.id)

    await adapter.ack(second[0]!)
  })

  it('supports enqueue -> dequeue -> ack on redis streams adapter', async () => {
    const client = new FakeRedisStreamsClient()
    const adapter = RedisQueueAdapter.fromClient(client)

    await adapter.enqueue(sampleSignal({ source: 'telemetry' }), {
      transport: 'event_bus',
      retryCount: 2,
    })

    const dequeued = await adapter.dequeue(10)
    expect(dequeued.length).toBe(1)
    expect(dequeued[0]?.signal.source).toBe('telemetry')
    expect(dequeued[0]?.transport).toBe('event_bus')
    expect(dequeued[0]?.retryCount).toBe(2)

    await adapter.ack(dequeued[0]!)

    const stats = await adapter.getStats()
    expect(stats.pending).toBe(0)
  })

  it('redelivers unacked messages on redis streams adapter through pending reclaim', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    const client = new FakeRedisStreamsClient()
    const adapter = RedisQueueAdapter.fromClient(client, {
      minIdleMs: 1000,
      blockMs: 0,
    })

    await adapter.enqueue(sampleSignal({ source: 'wallet.track' }))
    const first = await adapter.dequeue(1)
    expect(first.length).toBe(1)

    vi.setSystemTime(new Date('2026-01-01T00:00:02.000Z'))
    const second = await adapter.dequeue(1)

    expect(second.length).toBe(1)
    expect(second[0]?.id).toBe(first[0]?.id)

    await adapter.ack(second[0]!)
  })
})
