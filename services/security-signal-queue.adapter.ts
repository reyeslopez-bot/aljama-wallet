import os from 'node:os'
import { getErrorMessage } from '@/lib/security/errors'
import { logError, logWarn } from '@/lib/security/logging'

export type SecuritySignalOutcome = 'success' | 'failure' | 'blocked'
export type SecuritySignalTransport = 'direct' | 'api' | 'queue' | 'event_bus'

export type QueueSignalPayload = {
  source: string
  route?: string | null
  outcome: SecuritySignalOutcome
  statusCode?: number | null
  ipHash?: string | null
  userId?: string | null
  sessionId?: string | null
  deviceId?: string | null
  principal?: string | null
  country?: string | null
  latitude?: number | null
  longitude?: number | null
  userAgent?: string | null
  details?: Record<string, unknown>
  detectedAt?: number | null
}

export type SecuritySignalQueueMessage = {
  id: string
  signal: QueueSignalPayload
  transport: SecuritySignalTransport
  retryCount: number
  queuedAt: number
}

export type SecuritySignalQueueStats = {
  backend: 'in_memory' | 'redis'
  depth: number
  pending: number
  lag: number | null
  oldestQueuedAt: number | null
  newestQueuedAt: number | null
}

export type SecuritySignalQueueAdapterHealth = {
  requestedBackend: 'in_memory' | 'redis'
  activeBackend: 'in_memory' | 'redis'
  degraded: boolean
  reason: string | null
  lastFailureAt: number | null
  requireDurable: boolean
}

export type SecuritySignalQueueEnqueueOptions = {
  transport?: SecuritySignalTransport
  retryCount?: number
  delayMs?: number
}

export type SecuritySignalQueueEnqueueResult = {
  message: SecuritySignalQueueMessage
  dropped: boolean
  queueLength: number
}

export interface SecuritySignalQueueAdapter {
  backend: 'in_memory' | 'redis'
  enqueue(
    signal: QueueSignalPayload,
    options?: SecuritySignalQueueEnqueueOptions,
  ): Promise<SecuritySignalQueueEnqueueResult>
  dequeue(batchSize: number): Promise<SecuritySignalQueueMessage[]>
  ack(message: SecuritySignalQueueMessage): Promise<void>
  getStats(): Promise<SecuritySignalQueueStats>
  resetForTests?(): void | Promise<void>
  closeForTests?(): void | Promise<void>
}

type InMemoryQueueEntry = SecuritySignalQueueMessage & {
  availableAt: number
}

const globalForQueueAdapter = globalThis as unknown as {
  securitySignalQueueAdapterHealth?: SecuritySignalQueueAdapterHealth
}

function defaultQueueAdapterHealth(): SecuritySignalQueueAdapterHealth {
  return {
    requestedBackend: 'in_memory',
    activeBackend: 'in_memory',
    degraded: false,
    reason: null,
    lastFailureAt: null,
    requireDurable: false,
  }
}

const adapterHealth = globalForQueueAdapter.securitySignalQueueAdapterHealth ?? defaultQueueAdapterHealth()
if (!globalForQueueAdapter.securitySignalQueueAdapterHealth) {
  globalForQueueAdapter.securitySignalQueueAdapterHealth = adapterHealth
}

function nextQueueId(prefix = 'queue'): string {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${globalThis.crypto.randomUUID()}`
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.floor(parsed))
}

function envBool(name: string, fallback = false): boolean {
  const raw = process.env[name]
  if (!raw) return fallback
  const normalized = raw.trim().toLowerCase()
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false
  }
  return fallback
}

function durableQueueRequired(): boolean {
  return envBool('SECURITY_SIGNAL_QUEUE_REQUIRE_DURABLE', false)
}

function setQueueAdapterHealth(input: SecuritySignalQueueAdapterHealth) {
  adapterHealth.requestedBackend = input.requestedBackend
  adapterHealth.activeBackend = input.activeBackend
  adapterHealth.degraded = input.degraded
  adapterHealth.reason = input.reason
  adapterHealth.lastFailureAt = input.lastFailureAt
  adapterHealth.requireDurable = input.requireDurable
}

function queueOverflowStrategy(): 'drop_oldest' | 'reject_new' {
  const raw = (process.env.SECURITY_SIGNAL_QUEUE_OVERFLOW_STRATEGY ?? 'drop_oldest').trim().toLowerCase()
  if (raw === 'reject_new') return 'reject_new'
  return 'drop_oldest'
}

function hasThen(value: unknown): value is Promise<unknown> {
  return !!value && typeof value === 'object' && 'then' in value
}

export class InMemoryQueueAdapter implements SecuritySignalQueueAdapter {
  backend = 'in_memory' as const

  private readonly queue: InMemoryQueueEntry[] = []
  private readonly inflight = new Map<string, { entry: InMemoryQueueEntry; expiresAt: number }>()

  private maxDepth(): number {
    return envInt('SECURITY_SIGNAL_QUEUE_MAX_DEPTH', 5_000)
  }

  private ackTimeoutMs(): number {
    return envInt('SECURITY_SIGNAL_QUEUE_ACK_TIMEOUT_MS', 30_000)
  }

  private reclaimExpired(now = Date.now()) {
    for (const [id, inflight] of this.inflight.entries()) {
      if (inflight.expiresAt <= now) {
        this.inflight.delete(id)
        this.queue.push({
          ...inflight.entry,
          availableAt: now,
        })
      }
    }
  }

  async enqueue(
    signal: QueueSignalPayload,
    options?: SecuritySignalQueueEnqueueOptions,
  ): Promise<SecuritySignalQueueEnqueueResult> {
    const strategy = queueOverflowStrategy()
    let dropped = false

    if (this.queue.length >= this.maxDepth()) {
      if (strategy === 'reject_new') {
        throw new Error('queue_full')
      }
      const droppedEntry = this.queue.shift()
      dropped = !!droppedEntry
      if (droppedEntry) {
        logWarn('security-signal:queue', new Error('Dropped oldest signal due to queue pressure'), {
          droppedQueueId: droppedEntry.id,
          source: droppedEntry.signal.source,
        })
      }
    }

    const queuedAt = Date.now()
    const message: SecuritySignalQueueMessage = {
      id: nextQueueId('queue'),
      signal,
      transport: options?.transport ?? 'queue',
      retryCount: options?.retryCount ?? 0,
      queuedAt,
    }

    this.queue.push({
      ...message,
      availableAt: queuedAt + Math.max(0, options?.delayMs ?? 0),
    })

    return {
      message,
      dropped,
      queueLength: this.queue.length,
    }
  }

  async dequeue(batchSize: number): Promise<SecuritySignalQueueMessage[]> {
    const now = Date.now()
    const maxBatch = Math.max(1, Math.floor(batchSize))
    const messages: SecuritySignalQueueMessage[] = []

    this.reclaimExpired(now)

    for (let index = 0; index < this.queue.length && messages.length < maxBatch;) {
      const entry = this.queue[index]
      if (entry.availableAt > now) {
        index += 1
        continue
      }

      this.queue.splice(index, 1)
      this.inflight.set(entry.id, {
        entry,
        expiresAt: now + this.ackTimeoutMs(),
      })
      messages.push({
        id: entry.id,
        signal: entry.signal,
        transport: entry.transport,
        retryCount: entry.retryCount,
        queuedAt: entry.queuedAt,
      })
    }

    return messages
  }

  async ack(message: SecuritySignalQueueMessage): Promise<void> {
    this.inflight.delete(message.id)
  }

  async getStats(): Promise<SecuritySignalQueueStats> {
    this.reclaimExpired(Date.now())

    const oldest = this.queue[0]
    const newest = this.queue[this.queue.length - 1]

    return {
      backend: this.backend,
      depth: this.queue.length,
      pending: this.inflight.size,
      lag: this.queue.length,
      oldestQueuedAt: oldest?.queuedAt ?? null,
      newestQueuedAt: newest?.queuedAt ?? null,
    }
  }

  resetForTests() {
    this.queue.splice(0, this.queue.length)
    this.inflight.clear()
  }

  closeForTests() {}
}

type RedisCommandClient = {
  sendCommand(args: string[]): Promise<unknown>
  connect?: () => Promise<void>
  quit?: () => Promise<void>
  on?: (event: string, listener: (error: unknown) => void) => void
}

function normalizeTransport(value: unknown): SecuritySignalTransport {
  if (value === 'direct' || value === 'api' || value === 'queue' || value === 'event_bus') {
    return value
  }
  return 'queue'
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function parseString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return value
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function parseStreamEntry(
  entry: unknown,
): { id: string; fields: Record<string, string> } | null {
  if (!Array.isArray(entry) || entry.length < 2) return null
  const id = parseString(entry[0])
  if (!id) return null

  const rawFields = entry[1]
  if (!Array.isArray(rawFields)) return null

  const fields: Record<string, string> = {}
  for (let index = 0; index < rawFields.length; index += 2) {
    const key = parseString(rawFields[index])
    const value = parseString(rawFields[index + 1])
    if (!key || value === null) continue
    fields[key] = value
  }

  return { id, fields }
}

function parseReadGroupEntries(raw: unknown): Array<{ id: string; fields: Record<string, string> }> {
  if (!Array.isArray(raw)) return []

  const entries: Array<{ id: string; fields: Record<string, string> }> = []
  for (const streamPart of raw) {
    if (!Array.isArray(streamPart) || streamPart.length < 2) continue
    const streamEntries = streamPart[1]
    if (!Array.isArray(streamEntries)) continue

    for (const entry of streamEntries) {
      const parsed = parseStreamEntry(entry)
      if (parsed) entries.push(parsed)
    }
  }

  return entries
}

function parseAutoClaimEntries(raw: unknown): Array<{ id: string; fields: Record<string, string> }> {
  if (!Array.isArray(raw) || raw.length < 2) return []
  const entries = raw[1]
  if (!Array.isArray(entries)) return []

  const parsed: Array<{ id: string; fields: Record<string, string> }> = []
  for (const entry of entries) {
    const item = parseStreamEntry(entry)
    if (item) parsed.push(item)
  }
  return parsed
}

function parseXInfoGroups(
  raw: unknown,
  targetGroup: string,
): { pending: number | null; lag: number | null } {
  if (!Array.isArray(raw)) return { pending: null, lag: null }

  for (const item of raw) {
    if (!Array.isArray(item)) continue

    const pairs: Record<string, unknown> = {}
    for (let index = 0; index < item.length; index += 2) {
      const key = parseString(item[index])
      if (!key) continue
      pairs[key] = item[index + 1]
    }

    if (parseString(pairs.name) !== targetGroup) continue

    return {
      pending: parseNumber(pairs.pending),
      lag: parseNumber(pairs.lag),
    }
  }

  return { pending: null, lag: null }
}

function toStreamMessage(
  entry: { id: string; fields: Record<string, string> },
): SecuritySignalQueueMessage | null {
  const payloadRaw = entry.fields.payload
  if (!payloadRaw) return null

  let payload: QueueSignalPayload
  try {
    const parsed = JSON.parse(payloadRaw)
    const record = asRecord(parsed)
    if (!record) return null

    const source = parseString(record.source)
    if (!source) return null

    const outcome = record.outcome
    if (outcome !== 'success' && outcome !== 'failure' && outcome !== 'blocked') {
      return null
    }

    payload = {
      source,
      route: parseString(record.route),
      outcome,
      statusCode: parseNumber(record.statusCode),
      ipHash: parseString(record.ipHash),
      userId: parseString(record.userId),
      sessionId: parseString(record.sessionId),
      deviceId: parseString(record.deviceId),
      principal: parseString(record.principal),
      country: parseString(record.country),
      latitude: parseNumber(record.latitude),
      longitude: parseNumber(record.longitude),
      userAgent: parseString(record.userAgent),
      details: asRecord(record.details) ?? {},
      detectedAt: parseNumber(record.detectedAt),
    }
  } catch {
    return null
  }

  return {
    id: entry.id,
    signal: payload,
    transport: normalizeTransport(entry.fields.transport),
    retryCount: parseNumber(entry.fields.retry) ?? 0,
    queuedAt: parseNumber(entry.fields.queuedAt) ?? Date.now(),
  }
}

async function loadRedisModule(): Promise<{ createClient: (options: { url: string }) => RedisCommandClient }> {
  const importedModule = await import('redis')
  const record = asRecord(importedModule)
  const createClient = record?.createClient
  if (typeof createClient !== 'function') {
    throw new Error('redis module missing createClient export')
  }
  return { createClient: createClient as (options: { url: string }) => RedisCommandClient }
}

export class RedisQueueAdapter implements SecuritySignalQueueAdapter {
  backend = 'redis' as const

  private readonly streamKey: string
  private readonly group: string
  private readonly consumer: string
  private readonly blockMs: number
  private readonly minIdleMs: number
  private readonly maxDepth: number
  private readonly ownsClient: boolean
  private groupReady = false
  private readonly clientPromise: Promise<RedisCommandClient>

  constructor(input: {
    redisUrl?: string
    streamKey: string
    group: string
    consumer: string
    blockMs: number
    minIdleMs: number
    maxDepth: number
    clientFactory?: () => Promise<RedisCommandClient>
  }) {
    this.streamKey = input.streamKey
    this.group = input.group
    this.consumer = input.consumer
    this.blockMs = input.blockMs
    this.minIdleMs = input.minIdleMs
    this.maxDepth = input.maxDepth
    this.ownsClient = !input.clientFactory

    if (input.clientFactory) {
      this.clientPromise = input.clientFactory()
    } else if (input.redisUrl) {
      this.clientPromise = this.connect(input.redisUrl)
    } else {
      throw new Error('redisUrl or clientFactory is required')
    }
  }

  static fromEnv(): RedisQueueAdapter {
    const redisUrl =
      process.env.SECURITY_SIGNAL_REDIS_URL?.trim() ??
      process.env.REDIS_URL?.trim() ??
      ''

    if (!redisUrl) {
      throw new Error('SECURITY_SIGNAL_REDIS_URL or REDIS_URL is required for redis queue backend')
    }

    const streamKey = process.env.SECURITY_SIGNAL_REDIS_STREAM?.trim() || 'security:signals'
    const group = process.env.SECURITY_SIGNAL_REDIS_GROUP?.trim() || 'detectionGroup'
    const consumer =
      process.env.SECURITY_SIGNAL_REDIS_CONSUMER?.trim() ||
      `${os.hostname().replace(/[^a-zA-Z0-9_-]/g, '_')}-${process.pid}`

    return new RedisQueueAdapter({
      redisUrl,
      streamKey,
      group,
      consumer,
      blockMs: envInt('SECURITY_SIGNAL_REDIS_BLOCK_MS', 250),
      minIdleMs: envInt('SECURITY_SIGNAL_REDIS_MIN_IDLE_MS', 30_000),
      maxDepth: envInt('SECURITY_SIGNAL_QUEUE_MAX_DEPTH', 5_000),
    })
  }

  static fromClient(
    client: RedisCommandClient,
    options?: {
      streamKey?: string
      group?: string
      consumer?: string
      blockMs?: number
      minIdleMs?: number
      maxDepth?: number
    },
  ): RedisQueueAdapter {
    return new RedisQueueAdapter({
      streamKey: options?.streamKey ?? 'security:signals',
      group: options?.group ?? 'detectionGroup',
      consumer: options?.consumer ?? `test-${process.pid}`,
      blockMs: options?.blockMs ?? 250,
      minIdleMs: options?.minIdleMs ?? 30_000,
      maxDepth: options?.maxDepth ?? 5_000,
      clientFactory: async () => client,
    })
  }

  private async connect(redisUrl: string): Promise<RedisCommandClient> {
    const redisModule = await loadRedisModule()
    const client = redisModule.createClient({ url: redisUrl })
    client.on?.('error', (error) => {
      logError('security-signal:redis', error)
    })
    if (client.connect) {
      await client.connect()
    }
    return client
  }

  private async send(args: string[]): Promise<unknown> {
    const client = await this.clientPromise
    return client.sendCommand(args)
  }

  private async ensureGroup() {
    if (this.groupReady) return

    try {
      await this.send(['XGROUP', 'CREATE', this.streamKey, this.group, '0', 'MKSTREAM'])
    } catch (error) {
      const message = getErrorMessage(error, '')
      if (!message.includes('BUSYGROUP')) {
        throw error
      }
    }

    this.groupReady = true
  }

  private async getDepthUnsafe(): Promise<number> {
    const raw = await this.send(['XLEN', this.streamKey])
    return parseNumber(raw) ?? 0
  }

  async enqueue(
    signal: QueueSignalPayload,
    options?: SecuritySignalQueueEnqueueOptions,
  ): Promise<SecuritySignalQueueEnqueueResult> {
    await this.ensureGroup()

    const depth = await this.getDepthUnsafe()
    if (depth >= this.maxDepth && queueOverflowStrategy() === 'reject_new') {
      throw new Error('queue_full')
    }

    const queuedAt = Date.now()
    const delayMs = Math.max(0, options?.delayMs ?? 0)
    const retryCount = Math.max(0, options?.retryCount ?? 0)

    const added = await this.send([
      'XADD',
      this.streamKey,
      'MAXLEN',
      '~',
      String(this.maxDepth),
      '*',
      'payload',
      JSON.stringify(signal),
      'transport',
      options?.transport ?? 'queue',
      'retry',
      String(retryCount),
      'queuedAt',
      String(queuedAt),
      'availableAt',
      String(queuedAt + delayMs),
    ])

    const id = parseString(added)
    if (!id) {
      throw new Error('redis_xadd_failed')
    }

    return {
      message: {
        id,
        signal,
        transport: options?.transport ?? 'queue',
        retryCount,
        queuedAt,
      },
      dropped: false,
      queueLength: depth + 1,
    }
  }

  private async normalizeDelayedEntry(entry: { id: string; fields: Record<string, string> }): Promise<boolean> {
    const availableAt = parseNumber(entry.fields.availableAt)
    if (availableAt === null || availableAt <= Date.now()) return false

    // Keep delayed retries durable without blocking pending entries forever.
    await this.send(['XACK', this.streamKey, this.group, entry.id])
    await this.send([
      'XADD',
      this.streamKey,
      '*',
      'payload',
      entry.fields.payload ?? '{}',
      'transport',
      entry.fields.transport ?? 'queue',
      'retry',
      entry.fields.retry ?? '0',
      'queuedAt',
      entry.fields.queuedAt ?? String(Date.now()),
      'availableAt',
      entry.fields.availableAt,
    ])
    return true
  }

  async dequeue(batchSize: number): Promise<SecuritySignalQueueMessage[]> {
    await this.ensureGroup()

    const count = Math.max(1, Math.floor(batchSize))
    const claimedRaw = await this.send([
      'XAUTOCLAIM',
      this.streamKey,
      this.group,
      this.consumer,
      String(this.minIdleMs),
      '0-0',
      'COUNT',
      String(count),
    ])

    const claimed = parseAutoClaimEntries(claimedRaw)

    const needed = Math.max(0, count - claimed.length)
    let fresh: Array<{ id: string; fields: Record<string, string> }> = []

    if (needed > 0) {
      const freshRaw = await this.send([
        'XREADGROUP',
        'GROUP',
        this.group,
        this.consumer,
        'COUNT',
        String(needed),
        'BLOCK',
        String(this.blockMs),
        'STREAMS',
        this.streamKey,
        '>',
      ])
      fresh = parseReadGroupEntries(freshRaw)
    }

    const entries = [...claimed, ...fresh]
    const messages: SecuritySignalQueueMessage[] = []

    for (const entry of entries) {
      if (await this.normalizeDelayedEntry(entry)) {
        continue
      }

      const message = toStreamMessage(entry)
      if (!message) {
        await this.send(['XACK', this.streamKey, this.group, entry.id])
        continue
      }

      messages.push(message)
      if (messages.length >= count) break
    }

    return messages
  }

  async ack(message: SecuritySignalQueueMessage): Promise<void> {
    await this.send(['XACK', this.streamKey, this.group, message.id])
  }

  async getStats(): Promise<SecuritySignalQueueStats> {
    await this.ensureGroup()

    const depthRaw = await this.send(['XLEN', this.streamKey])
    const depth = parseNumber(depthRaw) ?? 0

    let pending: number | null = null
    let lag: number | null = null

    try {
      const groupsRaw = await this.send(['XINFO', 'GROUPS', this.streamKey])
      const parsed = parseXInfoGroups(groupsRaw, this.group)
      pending = parsed.pending
      lag = parsed.lag
    } catch {
      pending = null
      lag = null
    }

    if (pending === null) {
      const pendingRaw = await this.send(['XPENDING', this.streamKey, this.group])
      pending = Array.isArray(pendingRaw) ? (parseNumber(pendingRaw[0]) ?? 0) : 0
    }

    const oldestRaw = await this.send(['XRANGE', this.streamKey, '-', '+', 'COUNT', '1'])
    const newestRaw = await this.send(['XREVRANGE', this.streamKey, '+', '-', 'COUNT', '1'])

    const oldestEntry = Array.isArray(oldestRaw) ? parseStreamEntry(oldestRaw[0]) : null
    const newestEntry = Array.isArray(newestRaw) ? parseStreamEntry(newestRaw[0]) : null

    return {
      backend: this.backend,
      depth,
      pending,
      lag,
      oldestQueuedAt: parseNumber(oldestEntry?.fields.queuedAt) ?? null,
      newestQueuedAt: parseNumber(newestEntry?.fields.queuedAt) ?? null,
    }
  }

  async resetForTests() {
    try {
      await this.send(['DEL', this.streamKey])
      this.groupReady = false
    } catch (error) {
      logWarn('security-signal:redis', new Error(getErrorMessage(error, 'Failed to reset stream for tests')))
    }
  }

  async closeForTests() {
    if (!this.ownsClient) return
    try {
      const client = await this.clientPromise
      await client.quit?.()
    } catch (error) {
      logWarn('security-signal:redis', new Error(getErrorMessage(error, 'Failed to close redis test client')))
    }
  }
}

export async function createQueueAdapterFromEnv(): Promise<SecuritySignalQueueAdapter> {
  const backendRaw = (process.env.SECURITY_SIGNAL_QUEUE_BACKEND ?? 'in_memory').trim().toLowerCase()
  const requestedBackend = backendRaw === 'redis' ? 'redis' : 'in_memory'
  const requireDurable = durableQueueRequired()

  if (requestedBackend === 'redis') {
    try {
      const adapter = RedisQueueAdapter.fromEnv()
      await adapter.getStats()
      setQueueAdapterHealth({
        requestedBackend,
        activeBackend: 'redis',
        degraded: false,
        reason: null,
        lastFailureAt: null,
        requireDurable,
      })
      return adapter
    } catch (error) {
      const reason = getErrorMessage(error, 'redis_backend_unavailable')
      logError('security-signal:adapter', error, {
        backend: requestedBackend,
        requireDurable,
        fallbackBackend: requireDurable ? 'none' : 'in_memory',
      })
      setQueueAdapterHealth({
        requestedBackend,
        activeBackend: requireDurable ? 'redis' : 'in_memory',
        degraded: true,
        reason,
        lastFailureAt: Date.now(),
        requireDurable,
      })
      if (requireDurable) {
        throw new Error(`durable_queue_required:${reason}`)
      }
      return new InMemoryQueueAdapter()
    }
  }

  setQueueAdapterHealth({
    requestedBackend,
    activeBackend: 'in_memory',
    degraded: false,
    reason: null,
    lastFailureAt: null,
    requireDurable,
  })
  return new InMemoryQueueAdapter()
}

export function getSecuritySignalQueueAdapterHealth(): SecuritySignalQueueAdapterHealth {
  return {
    requestedBackend: adapterHealth.requestedBackend,
    activeBackend: adapterHealth.activeBackend,
    degraded: adapterHealth.degraded,
    reason: adapterHealth.reason,
    lastFailureAt: adapterHealth.lastFailureAt,
    requireDurable: adapterHealth.requireDurable,
  }
}

export function resetSecuritySignalQueueAdapterHealthForTests() {
  setQueueAdapterHealth(defaultQueueAdapterHealth())
}

export function maybeResetQueueAdapterForTests(adapter: SecuritySignalQueueAdapter | null | undefined) {
  if (!adapter?.resetForTests) return
  const result = adapter.resetForTests()
  if (hasThen(result)) {
    void result.catch((error) => {
      logError('security-signal:adapter', error)
    })
  }
}

export function maybeCloseQueueAdapterForTests(adapter: SecuritySignalQueueAdapter | null | undefined) {
  if (!adapter?.closeForTests) return
  const result = adapter.closeForTests()
  if (hasThen(result)) {
    void result.catch((error) => {
      logError('security-signal:adapter', error)
    })
  }
}
