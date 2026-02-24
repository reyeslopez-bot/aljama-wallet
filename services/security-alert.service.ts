import { logError, logInfo } from '@/lib/security/logging'

export type SecurityAlertSeverity = 'low' | 'medium' | 'high' | 'critical'

export type SecurityAlertInput = {
  ruleId: string
  severity: SecurityAlertSeverity
  repetitive: boolean
  title: string
  description: string
  fingerprint: string
  source?: string | null
  context?: Record<string, unknown>
}

export type SecurityAlertRecord = SecurityAlertInput & {
  id: string
  createdAt: number
  source: string
  baseSeverity: SecurityAlertSeverity
  deduped: boolean
  dedup: {
    key: string
    duplicateCount: number
    windowMs: number
    ttlMs: number
    firstSeenAt: number
    lastSeenAt: number
    escalated: boolean
  }
  delivered: {
    log: boolean
    webhook: boolean
  }
}

type DedupState = {
  firstSeenAt: number
  lastSeenAt: number
  duplicateCount: number
}

const severityRank: Record<SecurityAlertSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
}

const severityByRank: Record<number, SecurityAlertSeverity> = {
  1: 'low',
  2: 'medium',
  3: 'high',
  4: 'critical',
}

const DEFAULT_MAX_ALERTS = 2_000
const DEFAULT_DEDUP_WINDOW_MS = 5 * 60 * 1000
const DEFAULT_DEDUP_TTL_MS = 60 * 60 * 1000
const DEFAULT_WEBHOOK_TIMEOUT_MS = 1_500
const DEFAULT_ESCALATE_AFTER = 3
const DEFAULT_ESCALATE_EVERY = 5

const globalForSecurityAlerts = globalThis as unknown as {
  securityAlerts?: SecurityAlertRecord[]
  securityAlertDedup?: Map<string, DedupState>
  securityAlertRedisClientPromise?: Promise<{
    sendCommand(args: string[]): Promise<unknown>
    connect?: () => Promise<void>
    on?: (event: string, listener: (error: unknown) => void) => void
  }>
}

const alertBuffer = globalForSecurityAlerts.securityAlerts ?? []
if (!globalForSecurityAlerts.securityAlerts) {
  globalForSecurityAlerts.securityAlerts = alertBuffer
}

const alertDedup = globalForSecurityAlerts.securityAlertDedup ?? new Map<string, DedupState>()
if (!globalForSecurityAlerts.securityAlertDedup) {
  globalForSecurityAlerts.securityAlertDedup = alertDedup
}

type RedisCommandClient = {
  sendCommand(args: string[]): Promise<unknown>
  connect?: () => Promise<void>
  on?: (event: string, listener: (error: unknown) => void) => void
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.floor(parsed))
}

function dedupBackend(): 'memory' | 'redis' {
  const raw = (process.env.SECURITY_ALERT_DEDUP_BACKEND ?? 'memory').trim().toLowerCase()
  if (raw === 'redis') return 'redis'
  return 'memory'
}

function redisDedupUrl(): string {
  return process.env.SECURITY_ALERT_REDIS_URL?.trim() ?? process.env.REDIS_URL?.trim() ?? ''
}

function redisDedupPrefix(): string {
  return process.env.SECURITY_ALERT_REDIS_PREFIX?.trim() || 'security:alerts:dedup'
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

async function loadRedisModule(): Promise<{ createClient: (options: { url: string }) => RedisCommandClient }> {
  const dynamicImport = new Function('moduleName', 'return import(moduleName)') as (
    moduleName: string,
  ) => Promise<unknown>
  const importedModule = await dynamicImport('redis')
  const record = asRecord(importedModule)
  const createClient = record?.createClient
  if (typeof createClient !== 'function') {
    throw new Error('redis module missing createClient export')
  }
  return { createClient: createClient as (options: { url: string }) => RedisCommandClient }
}

async function resolveRedisClient(): Promise<RedisCommandClient | null> {
  const url = redisDedupUrl()
  if (!url) return null

  if (!globalForSecurityAlerts.securityAlertRedisClientPromise) {
    globalForSecurityAlerts.securityAlertRedisClientPromise = (async () => {
      const redisModule = await loadRedisModule()
      const client = redisModule.createClient({ url })
      client.on?.('error', (error) => {
        logError('security-alert:redis', error)
      })
      if (client.connect) {
        await client.connect()
      }
      return client
    })().catch((error) => {
      logError('security-alert:redis', error)
      throw error
    })
  }

  try {
    return await globalForSecurityAlerts.securityAlertRedisClientPromise
  } catch {
    return null
  }
}

function minWebhookSeverity(): SecurityAlertSeverity {
  const raw = (process.env.SECURITY_ALERT_WEBHOOK_MIN_SEVERITY ?? 'high').trim().toLowerCase()
  if (raw === 'low' || raw === 'medium' || raw === 'high' || raw === 'critical') return raw
  return 'high'
}

function shouldWebhook(severity: SecurityAlertSeverity): boolean {
  return severityRank[severity] >= severityRank[minWebhookSeverity()]
}

function nextAlertId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `alert_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function resolveSource(input: SecurityAlertInput): string {
  const fromInput = normalizeString(input.source)
  if (fromInput) return fromInput

  const fromContext = normalizeString(input.context?.source)
  if (fromContext) return fromContext

  return 'unknown'
}

function normalizeFingerprint(input: SecurityAlertInput): string {
  return normalizeString(input.fingerprint) ?? 'anon'
}

function dedupWindowMs(): number {
  return envInt('SECURITY_ALERT_DEDUP_WINDOW_MS', DEFAULT_DEDUP_WINDOW_MS)
}

function dedupTtlMs(windowMs: number): number {
  return envInt('SECURITY_ALERT_DEDUP_TTL_MS', Math.max(windowMs, DEFAULT_DEDUP_TTL_MS))
}

function escalateAfterDuplicates(): number {
  return envInt('SECURITY_ALERT_DUPLICATE_ESCALATE_AFTER', DEFAULT_ESCALATE_AFTER)
}

function escalateEveryDuplicates(): number {
  return Math.max(1, envInt('SECURITY_ALERT_DUPLICATE_ESCALATE_EVERY', DEFAULT_ESCALATE_EVERY))
}

function buildDedupKey(input: SecurityAlertInput, source: string): string {
  // Duplicate definition: same rule + same logical source + same fingerprint.
  // Time-bounded by SECURITY_ALERT_DEDUP_WINDOW_MS.
  return `${input.ruleId}:${source}:${normalizeFingerprint(input)}`
}

function shouldEscalateDuplicate(duplicateCount: number): boolean {
  const after = escalateAfterDuplicates()
  if (after <= 0) return false
  if (duplicateCount < after) return false

  const every = escalateEveryDuplicates()
  return (duplicateCount - after) % every === 0
}

function escalateSeverity(severity: SecurityAlertSeverity): SecurityAlertSeverity {
  const nextRank = Math.min(4, severityRank[severity] + 1)
  return severityByRank[nextRank]
}

async function deliverWebhook(alert: SecurityAlertRecord): Promise<boolean> {
  const endpoint = process.env.SECURITY_ALERT_WEBHOOK_URL?.trim()
  if (!endpoint) return false
  if (!shouldWebhook(alert.severity)) return false

  const timeoutMs = envInt('SECURITY_ALERT_WEBHOOK_TIMEOUT_MS', DEFAULT_WEBHOOK_TIMEOUT_MS)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'security.alert',
        alert,
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      throw new Error(`Webhook returned ${res.status}`)
    }
    return true
  } catch (error) {
    logError('security-alert:webhook', error, {
      ruleId: alert.ruleId,
      severity: alert.severity,
      repetitive: alert.repetitive,
      deduped: alert.deduped,
      duplicateCount: alert.dedup.duplicateCount,
    })
    return false
  } finally {
    clearTimeout(timer)
  }
}

function trimBuffers(now: number) {
  const maxAlerts = envInt('SECURITY_ALERT_MAX_BUFFER', DEFAULT_MAX_ALERTS)
  if (alertBuffer.length > maxAlerts) {
    alertBuffer.splice(0, alertBuffer.length - maxAlerts)
  }

  if (dedupBackend() === 'redis') {
    return
  }

  const ttlMs = dedupTtlMs(dedupWindowMs())
  for (const [key, state] of alertDedup.entries()) {
    if (now - state.lastSeenAt > ttlMs) {
      alertDedup.delete(key)
    }
  }
}

function parseStoredDedupState(raw: unknown): DedupState | null {
  if (typeof raw !== 'string') return null
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const firstSeenAt = Number(parsed.firstSeenAt)
    const lastSeenAt = Number(parsed.lastSeenAt)
    const duplicateCount = Number(parsed.duplicateCount)
    if (!Number.isFinite(firstSeenAt) || !Number.isFinite(lastSeenAt) || !Number.isFinite(duplicateCount)) {
      return null
    }
    return {
      firstSeenAt: Math.max(0, Math.floor(firstSeenAt)),
      lastSeenAt: Math.max(0, Math.floor(lastSeenAt)),
      duplicateCount: Math.max(0, Math.floor(duplicateCount)),
    }
  } catch {
    return null
  }
}

async function getDedupState(key: string): Promise<DedupState | null> {
  if (dedupBackend() !== 'redis') {
    return alertDedup.get(key) ?? null
  }

  const client = await resolveRedisClient()
  if (!client) {
    return alertDedup.get(key) ?? null
  }

  try {
    const redisKey = `${redisDedupPrefix()}:${key}`
    const raw = await client.sendCommand(['GET', redisKey])
    return parseStoredDedupState(raw)
  } catch (error) {
    logError('security-alert:redis', error, { operation: 'GET' })
    return alertDedup.get(key) ?? null
  }
}

async function setDedupState(key: string, state: DedupState, ttlMs: number): Promise<void> {
  if (dedupBackend() !== 'redis') {
    alertDedup.set(key, state)
    return
  }

  const client = await resolveRedisClient()
  if (!client) {
    alertDedup.set(key, state)
    return
  }

  const redisKey = `${redisDedupPrefix()}:${key}`
  try {
    await client.sendCommand([
      'SET',
      redisKey,
      JSON.stringify(state),
      'PX',
      String(Math.max(1, ttlMs)),
    ])
  } catch (error) {
    logError('security-alert:redis', error, { operation: 'SET' })
    alertDedup.set(key, state)
  }
}

async function evaluateDedup(input: SecurityAlertInput, now: number) {
  const source = resolveSource(input)
  const key = buildDedupKey(input, source)
  const windowMs = dedupWindowMs()
  const ttlMs = dedupTtlMs(windowMs)

  const existing = await getDedupState(key)

  if (!existing || now - existing.lastSeenAt > windowMs) {
    const state: DedupState = {
      firstSeenAt: now,
      lastSeenAt: now,
      duplicateCount: 0,
    }
    await setDedupState(key, state, ttlMs)
    return {
      source,
      key,
      isDuplicate: false,
      duplicateCount: 0,
      firstSeenAt: state.firstSeenAt,
      lastSeenAt: state.lastSeenAt,
      windowMs,
      ttlMs,
      escalated: false,
      effectiveSeverity: input.severity,
    }
  }

  existing.lastSeenAt = now
  existing.duplicateCount += 1
  await setDedupState(key, existing, ttlMs)

  const escalated = shouldEscalateDuplicate(existing.duplicateCount)
  const effectiveSeverity = escalated ? escalateSeverity(input.severity) : input.severity

  return {
    source,
    key,
    isDuplicate: true,
    duplicateCount: existing.duplicateCount,
    firstSeenAt: existing.firstSeenAt,
    lastSeenAt: existing.lastSeenAt,
    windowMs,
    ttlMs,
    escalated,
    effectiveSeverity,
  }
}

export async function emitSecurityAlert(input: SecurityAlertInput): Promise<SecurityAlertRecord> {
  const now = Date.now()
  const dedup = await evaluateDedup(input, now)

  const record: SecurityAlertRecord = {
    ...input,
    id: nextAlertId(),
    createdAt: now,
    source: dedup.source,
    baseSeverity: input.severity,
    severity: dedup.effectiveSeverity,
    deduped: dedup.isDuplicate,
    dedup: {
      key: dedup.key,
      duplicateCount: dedup.duplicateCount,
      windowMs: dedup.windowMs,
      ttlMs: dedup.ttlMs,
      firstSeenAt: dedup.firstSeenAt,
      lastSeenAt: dedup.lastSeenAt,
      escalated: dedup.escalated,
    },
    delivered: { log: false, webhook: false },
  }

  logInfo('security-alert', record.title, {
    alertId: record.id,
    ruleId: record.ruleId,
    source: record.source,
    severity: record.severity,
    baseSeverity: record.baseSeverity,
    repetitive: record.repetitive,
    deduped: record.deduped,
    duplicateCount: record.dedup.duplicateCount,
    dedupWindowMs: record.dedup.windowMs,
    dedupTtlMs: record.dedup.ttlMs,
    escalated: record.dedup.escalated,
    context: record.context ?? null,
  })
  record.delivered.log = true

  // Deliver the first alert in a dedup window and escalation checkpoints for duplicates.
  if (!record.deduped || record.dedup.escalated) {
    record.delivered.webhook = await deliverWebhook(record)
  }

  alertBuffer.push(record)
  trimBuffers(now)
  return record
}

export function getSecurityAlerts(limit = 200): SecurityAlertRecord[] {
  const max = Number.isInteger(limit) && limit > 0 ? limit : 200
  return alertBuffer.slice(-max).reverse()
}

export function clearSecurityAlertsForTests() {
  alertBuffer.splice(0, alertBuffer.length)
  alertDedup.clear()
  globalForSecurityAlerts.securityAlertRedisClientPromise = undefined
}
