import { prismaPg } from '@/lib/prisma-pg'
import { logError, logInfo } from '@/lib/security/logging'
import type { Prisma } from '@/prisma/generated/pg'
import { runForensicRetentionMaintenance } from '@/services/forensic-retention.service'

export type SecurityAlertSeverity = 'low' | 'medium' | 'high' | 'critical'
export type SecurityAlertPriority = 'p1' | 'p2' | 'p3' | 'p4'

type SecurityRunbook = {
  id: string
  title: string
  url: string | null
}

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
  priority: SecurityAlertPriority
  runbook: SecurityRunbook
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
    siem: boolean
    soar: boolean
    containment: boolean
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
const DEFAULT_SIEM_TIMEOUT_MS = 1_500
const DEFAULT_SOAR_TIMEOUT_MS = 2_000
const DEFAULT_ESCALATE_AFTER = 3
const DEFAULT_ESCALATE_EVERY = 5
const DEFAULT_RUNBOOK_BASE_URL = ''

const priorityBySeverity: Record<SecurityAlertSeverity, SecurityAlertPriority> = {
  critical: 'p1',
  high: 'p2',
  medium: 'p3',
  low: 'p4',
}

const cefSeverityBySeverity: Record<SecurityAlertSeverity, number> = {
  low: 2,
  medium: 5,
  high: 8,
  critical: 10,
}

const defaultRunbooks: Record<string, { id: string; title: string; slug: string }> = {
  'failure.burst': {
    id: 'RB-AUTH-001',
    title: 'Investigate authentication failure burst',
    slug: 'auth-failure-burst',
  },
  'probe.multi_principal': {
    id: 'RB-AUTH-002',
    title: 'Investigate multi-principal probing pattern',
    slug: 'auth-multi-principal-probe',
  },
  'probe.internal_route': {
    id: 'RB-INT-001',
    title: 'Investigate internal route probe',
    slug: 'internal-route-probe',
  },
  'geo.impossible_travel': {
    id: 'RB-IDENT-001',
    title: 'Investigate impossible travel event',
    slug: 'impossible-travel',
  },
  'geo.new_country_sensitive': {
    id: 'RB-IDENT-002',
    title: 'Review sensitive action from new country',
    slug: 'sensitive-action-new-country',
  },
  'queue.backpressure.high_water': {
    id: 'RB-OPS-001',
    title: 'Handle security queue backpressure',
    slug: 'security-queue-backpressure',
  },
}

const defaultContainmentActions: Record<string, string[]> = {
  'failure.burst': ['throttle_source', 'require_step_up_auth'],
  'probe.multi_principal': ['throttle_source', 'lock_principal'],
  'probe.internal_route': ['block_source'],
  'geo.impossible_travel': ['suspend_session', 'require_step_up_auth'],
  'geo.new_country_sensitive': ['require_step_up_auth'],
  'queue.backpressure.high_water': ['throttle_ingestion'],
}

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

function envBool(name: string, fallback = false): boolean {
  const raw = process.env[name]
  if (!raw) return fallback
  const normalized = raw.trim().toLowerCase()
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') return true
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false
  return fallback
}

function canUsePg() {
  return Boolean(process.env.PG_DATABASE_URL ?? process.env.POSTGRES_URL)
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function parseSeverity(value: string | null | undefined, fallback: SecurityAlertSeverity): SecurityAlertSeverity {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high' || normalized === 'critical') {
    return normalized
  }
  return fallback
}

function severityAtLeast(actual: SecurityAlertSeverity, minimum: SecurityAlertSeverity): boolean {
  return severityRank[actual] >= severityRank[minimum]
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
  return parseSeverity(process.env.SECURITY_ALERT_WEBHOOK_MIN_SEVERITY, 'high')
}

function minSiemSeverity(): SecurityAlertSeverity {
  return parseSeverity(process.env.SECURITY_ALERT_SIEM_MIN_SEVERITY, 'medium')
}

function minSoarSeverity(): SecurityAlertSeverity {
  return parseSeverity(process.env.SECURITY_ALERT_SOAR_MIN_SEVERITY, 'high')
}

function minContainmentSeverity(): SecurityAlertSeverity {
  return parseSeverity(process.env.SECURITY_ALERT_CONTAINMENT_MIN_SEVERITY, 'critical')
}

function shouldWebhook(severity: SecurityAlertSeverity): boolean {
  return severityAtLeast(severity, minWebhookSeverity())
}

function shouldSiem(severity: SecurityAlertSeverity): boolean {
  return severityAtLeast(severity, minSiemSeverity())
}

function shouldSoar(severity: SecurityAlertSeverity): boolean {
  return severityAtLeast(severity, minSoarSeverity())
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

function computePriority(severity: SecurityAlertSeverity): SecurityAlertPriority {
  return priorityBySeverity[severity]
}

function parseRunbookMap(): Record<string, { id?: string; title?: string; url?: string | null; slug?: string }> {
  const raw = process.env.SECURITY_ALERT_RUNBOOK_MAP?.trim()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const output: Record<string, { id?: string; title?: string; url?: string | null; slug?: string }> = {}
    for (const [ruleId, value] of Object.entries(parsed)) {
      const row = asRecord(value)
      if (!row) continue
      output[ruleId] = {
        id: normalizeString(row.id) ?? undefined,
        title: normalizeString(row.title) ?? undefined,
        url: row.url === null ? null : normalizeString(row.url),
        slug: normalizeString(row.slug) ?? undefined,
      }
    }
    return output
  } catch {
    return {}
  }
}

function resolveRunbook(ruleId: string): SecurityRunbook {
  const override = parseRunbookMap()[ruleId]
  const baseUrl = (process.env.SECURITY_ALERT_RUNBOOK_BASE_URL ?? DEFAULT_RUNBOOK_BASE_URL).trim()
  const fallback = defaultRunbooks[ruleId] ?? {
    id: `RB-${ruleId.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 32) || 'GENERIC'}`,
    title: `Investigate security alert: ${ruleId}`,
    slug: ruleId,
  }

  const id = override?.id ?? fallback.id
  const title = override?.title ?? fallback.title
  const explicitUrl = override?.url
  if (explicitUrl === null) {
    return { id, title, url: null }
  }
  if (explicitUrl) {
    return { id, title, url: explicitUrl }
  }
  if (baseUrl) {
    const trimmedBase = baseUrl.replace(/\/+$/, '')
    const slug = (override?.slug ?? fallback.slug).replace(/^\/+/, '')
    return { id, title, url: `${trimmedBase}/${slug}` }
  }
  return { id, title, url: null }
}

function parseContainmentRules(): Set<string> {
  const raw = process.env.SECURITY_ALERT_AUTO_CONTAIN_RULES?.trim()
  if (!raw) return new Set()
  return new Set(
    raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  )
}

function containmentActionsForRule(ruleId: string): string[] {
  const overrideRaw = process.env.SECURITY_ALERT_CONTAINMENT_ACTION_MAP?.trim()
  if (overrideRaw) {
    try {
      const parsed = JSON.parse(overrideRaw) as Record<string, unknown>
      const value = parsed[ruleId]
      if (Array.isArray(value)) {
        return value
          .map((item) => normalizeString(item))
          .filter((item): item is string => !!item)
      }
    } catch {
      // no-op: invalid override map falls back to defaults
    }
  }
  return defaultContainmentActions[ruleId] ?? []
}

function shouldRunContainment(record: SecurityAlertRecord): boolean {
  if (!envBool('SECURITY_ALERT_AUTO_CONTAIN_ENABLED', false)) return false
  if (!severityAtLeast(record.severity, minContainmentSeverity())) return false
  if (envBool('SECURITY_ALERT_AUTO_CONTAIN_REPETITIVE_ONLY', false) && !record.repetitive) return false

  const allowedRules = parseContainmentRules()
  if (allowedRules.size > 0 && !allowedRules.has(record.ruleId)) return false
  return containmentActionsForRule(record.ruleId).length > 0
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

function shouldDeliverFromDedup(record: SecurityAlertRecord): boolean {
  if (envBool('SECURITY_ALERT_DISPATCH_ALL_DUPLICATES', false)) return true
  return !record.deduped || record.dedup.escalated
}

function sanitizeCef(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/=/g, '\\=')
}

function buildSiemCefEvent(alert: SecurityAlertRecord): string {
  return [
    `CEF:0|aljama-wallet|security-alert|1.0|${sanitizeCef(alert.ruleId)}|${sanitizeCef(alert.title)}|${cefSeverityBySeverity[alert.severity]}`,
    `src=${sanitizeCef(alert.source)}`,
    `cs1Label=fingerprint`,
    `cs1=${sanitizeCef(alert.fingerprint)}`,
    `cs2Label=priority`,
    `cs2=${sanitizeCef(alert.priority)}`,
    `cs3Label=alertId`,
    `cs3=${sanitizeCef(alert.id)}`,
    `msg=${sanitizeCef(alert.description)}`,
  ].join(' ')
}

function buildSocPayload(alert: SecurityAlertRecord, containmentActions: string[]) {
  return {
    type: 'security.alert',
    schemaVersion: '1.0',
    emittedAt: new Date(alert.createdAt).toISOString(),
    alertId: alert.id,
    ruleId: alert.ruleId,
    source: alert.source,
    severity: alert.severity,
    priority: alert.priority,
    repetitive: alert.repetitive,
    deduped: alert.deduped,
    duplicateCount: alert.dedup.duplicateCount,
    fingerprint: alert.fingerprint,
    title: alert.title,
    description: alert.description,
    runbook: alert.runbook,
    containment: {
      enabled: shouldRunContainment(alert),
      actions: containmentActions,
    },
    context: alert.context ?? {},
  }
}

async function postJson(
  endpoint: string,
  body: unknown,
  timeoutMs: number,
  sink: 'webhook' | 'siem' | 'soar' | 'containment',
  alert: SecurityAlertRecord,
): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) {
      throw new Error(`${sink} endpoint returned ${res.status}`)
    }
    return true
  } catch (error) {
    logError(`security-alert:${sink}`, error, {
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

async function postCef(
  endpoint: string,
  body: string,
  timeoutMs: number,
  alert: SecurityAlertRecord,
): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'text/plain; charset=utf-8' },
      body,
      signal: controller.signal,
    })
    if (!res.ok) {
      throw new Error(`siem endpoint returned ${res.status}`)
    }
    return true
  } catch (error) {
    logError('security-alert:siem', error, {
      ruleId: alert.ruleId,
      severity: alert.severity,
      deduped: alert.deduped,
      duplicateCount: alert.dedup.duplicateCount,
    })
    return false
  } finally {
    clearTimeout(timer)
  }
}

async function deliverWebhook(alert: SecurityAlertRecord, socPayload: unknown): Promise<boolean> {
  const endpoint = process.env.SECURITY_ALERT_WEBHOOK_URL?.trim()
  if (!endpoint) return false
  if (!shouldWebhook(alert.severity)) return false
  if (!shouldDeliverFromDedup(alert)) return false
  return postJson(
    endpoint,
    socPayload,
    envInt('SECURITY_ALERT_WEBHOOK_TIMEOUT_MS', DEFAULT_WEBHOOK_TIMEOUT_MS),
    'webhook',
    alert,
  )
}

async function deliverSiem(alert: SecurityAlertRecord, socPayload: unknown): Promise<boolean> {
  const endpoint = process.env.SECURITY_ALERT_SIEM_URL?.trim()
  if (!endpoint) return false
  if (!shouldSiem(alert.severity)) return false
  if (!shouldDeliverFromDedup(alert)) return false

  const format = (process.env.SECURITY_ALERT_SIEM_FORMAT ?? 'json').trim().toLowerCase()
  const timeoutMs = envInt('SECURITY_ALERT_SIEM_TIMEOUT_MS', DEFAULT_SIEM_TIMEOUT_MS)
  if (format === 'cef') {
    return postCef(endpoint, buildSiemCefEvent(alert), timeoutMs, alert)
  }
  return postJson(endpoint, socPayload, timeoutMs, 'siem', alert)
}

async function deliverSoar(alert: SecurityAlertRecord, socPayload: unknown): Promise<boolean> {
  const endpoint = process.env.SECURITY_ALERT_SOAR_URL?.trim()
  if (!endpoint) return false
  if (!shouldSoar(alert.severity)) return false
  if (!shouldDeliverFromDedup(alert)) return false
  return postJson(
    endpoint,
    socPayload,
    envInt('SECURITY_ALERT_SOAR_TIMEOUT_MS', DEFAULT_SOAR_TIMEOUT_MS),
    'soar',
    alert,
  )
}

async function requestContainment(
  alert: SecurityAlertRecord,
  socPayload: unknown,
  actions: string[],
): Promise<boolean> {
  if (!shouldRunContainment(alert)) return false
  const endpoint = process.env.SECURITY_ALERT_SOAR_URL?.trim()
  if (!endpoint) return false
  if (!shouldDeliverFromDedup(alert)) return false

  return postJson(
    endpoint,
    {
      type: 'security.containment.request',
      schemaVersion: '1.0',
      emittedAt: new Date(alert.createdAt).toISOString(),
      alertId: alert.id,
      runbook: alert.runbook,
      actions,
      alert: socPayload,
    },
    envInt('SECURITY_ALERT_CONTAINMENT_TIMEOUT_MS', DEFAULT_SOAR_TIMEOUT_MS),
    'containment',
    alert,
  )
}

async function persistAlertEvent(alert: SecurityAlertRecord, containmentActions: string[]) {
  if (!canUsePg()) return
  try {
    await prismaPg.securityAlertEvent.create({
      data: {
        id: alert.id,
        ruleId: alert.ruleId,
        source: alert.source,
        severity: alert.severity,
        baseSeverity: alert.baseSeverity,
        priority: alert.priority,
        repetitive: alert.repetitive,
        deduped: alert.deduped,
        duplicateCount: alert.dedup.duplicateCount,
        dedupKey: alert.dedup.key,
        dedupWindowMs: alert.dedup.windowMs,
        dedupTtlMs: alert.dedup.ttlMs,
        dedupEscalated: alert.dedup.escalated,
        fingerprint: alert.fingerprint,
        title: alert.title,
        description: alert.description,
        runbookId: alert.runbook.id,
        runbookUrl: alert.runbook.url,
        context: toJson(alert.context ?? {}),
        containmentActions: toJson(containmentActions),
        delivered: toJson(alert.delivered),
        createdAt: new Date(alert.createdAt),
      },
    })
    void runForensicRetentionMaintenance()
  } catch (error) {
    logError('security-alert:forensic-write', error, {
      alertId: alert.id,
      ruleId: alert.ruleId,
    })
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

function fromJsonRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function fromJsonStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => normalizeString(item)).filter((item): item is string => !!item)
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
    priority: computePriority(dedup.effectiveSeverity),
    runbook: resolveRunbook(input.ruleId),
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
    delivered: { log: false, webhook: false, siem: false, soar: false, containment: false },
  }

  const containmentActions = containmentActionsForRule(record.ruleId)
  const socPayload = buildSocPayload(record, containmentActions)
  const shouldLogRecord = shouldDeliverFromDedup(record)

  if (shouldLogRecord) {
    logInfo('security-alert', record.title, {
      alertId: record.id,
      ruleId: record.ruleId,
      source: record.source,
      severity: record.severity,
      priority: record.priority,
      baseSeverity: record.baseSeverity,
      repetitive: record.repetitive,
      deduped: record.deduped,
      duplicateCount: record.dedup.duplicateCount,
      dedupWindowMs: record.dedup.windowMs,
      dedupTtlMs: record.dedup.ttlMs,
      escalated: record.dedup.escalated,
      runbookId: record.runbook.id,
      runbookUrl: record.runbook.url,
      containmentEnabled: shouldRunContainment(record),
      containmentActions,
      context: record.context ?? null,
    })
    record.delivered.log = true
  }

  record.delivered.webhook = await deliverWebhook(record, socPayload)
  record.delivered.siem = await deliverSiem(record, socPayload)
  record.delivered.soar = await deliverSoar(record, socPayload)
  record.delivered.containment = await requestContainment(record, socPayload, containmentActions)

  await persistAlertEvent(record, containmentActions)
  alertBuffer.push(record)
  trimBuffers(now)
  return record
}

export function getSecurityAlerts(limit = 200): SecurityAlertRecord[] {
  const max = Number.isInteger(limit) && limit > 0 ? limit : 200
  return alertBuffer.slice(-max).reverse()
}

export async function getSecurityAlertsForensics(limit = 200): Promise<SecurityAlertRecord[]> {
  const max = Number.isInteger(limit) && limit > 0 ? limit : 200
  if (!canUsePg()) {
    return getSecurityAlerts(max)
  }

  try {
    const rows = await prismaPg.securityAlertEvent.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      take: max,
    })

    if (rows.length === 0) {
      return getSecurityAlerts(max)
    }

    return rows.map((row) => {
      const delivered = fromJsonRecord(row.delivered)
      const context = fromJsonRecord(row.context)
      const containmentActions = fromJsonStringArray(row.containmentActions)
      const fallbackRunbook = resolveRunbook(row.ruleId)

      return {
        id: row.id,
        ruleId: row.ruleId,
        source: row.source,
        severity: parseSeverity(row.severity, 'medium'),
        baseSeverity: parseSeverity(row.baseSeverity, 'medium'),
        priority: (normalizeString(row.priority) as SecurityAlertPriority) ?? 'p3',
        repetitive: row.repetitive,
        deduped: row.deduped,
        fingerprint: row.fingerprint,
        title: row.title,
        description: row.description,
        context,
        runbook: {
          id: row.runbookId ?? fallbackRunbook.id,
          title: fallbackRunbook.title,
          url: row.runbookUrl,
        },
        dedup: {
          key: row.dedupKey,
          duplicateCount: row.duplicateCount,
          windowMs: row.dedupWindowMs,
          ttlMs: row.dedupTtlMs,
          firstSeenAt: row.createdAt.getTime(),
          lastSeenAt: row.createdAt.getTime(),
          escalated: row.dedupEscalated,
        },
        delivered: {
          log: Boolean(delivered.log),
          webhook: Boolean(delivered.webhook),
          siem: Boolean(delivered.siem),
          soar: Boolean(delivered.soar),
          containment: Boolean(delivered.containment) || containmentActions.length > 0,
        },
        createdAt: row.createdAt.getTime(),
      } satisfies SecurityAlertRecord
    })
  } catch (error) {
    logError('security-alert:forensic-read', error)
    return getSecurityAlerts(max)
  }
}

export function clearSecurityAlertsForTests() {
  alertBuffer.splice(0, alertBuffer.length)
  alertDedup.clear()
  globalForSecurityAlerts.securityAlertRedisClientPromise = undefined
}
