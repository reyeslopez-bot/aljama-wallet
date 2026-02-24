import crypto from 'node:crypto'
import { getErrorMessage } from '@/lib/security/errors'
import { logError, logWarn } from '@/lib/security/logging'
import { emitSecurityAlert, type SecurityAlertSeverity } from '@/services/security-alert.service'
import {
  createQueueAdapterFromEnv,
  maybeResetQueueAdapterForTests,
  type SecuritySignalQueueAdapter,
} from '@/services/security-signal-queue.adapter'

export type SecuritySignalOutcome = 'success' | 'failure' | 'blocked'
export type SecuritySignalTransport = 'direct' | 'api' | 'queue' | 'event_bus'

export type SecuritySignalInput = {
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

export type SecuritySignalRecord = SecuritySignalInput & {
  id: string
  detectedAt: number
  transport: SecuritySignalTransport
}

export type SecurityAnomalyRuleType = 'repetitive' | 'non_repetitive'

export type SecurityAnomalyRecord = {
  id: string
  ruleId: string
  ruleType: SecurityAnomalyRuleType
  severity: SecurityAlertSeverity
  repetitive: boolean
  score: number
  summary: string
  details: Record<string, unknown>
  signalId: string
  detectedAt: number
}

export type SecurityAnomalyResult = {
  signal: SecuritySignalRecord
  anomalies: SecurityAnomalyRecord[]
}

export type SecuritySignalSeriesPoint = {
  minute: number
  count: number
}

export type SecuritySignalWindowStats = {
  windowMs: number
  count: number
  series: SecuritySignalSeriesPoint[]
}

export type SecurityAnomalyDraft = {
  severity?: SecurityAlertSeverity
  score: number
  summary: string
  details?: Record<string, unknown>
}

export type SecurityAnomalyRuleContext = {
  signal: SecuritySignalRecord
  now: number
  identityKey: string | null
  windowStats: (
    windowMs: number,
    predicate: (signal: SecuritySignalRecord) => boolean,
  ) => SecuritySignalWindowStats
  recent: (windowMs: number, predicate: (signal: SecuritySignalRecord) => boolean) => SecuritySignalRecord[]
}

export type SecurityAnomalyRuleDefinition = {
  id: string
  type: SecurityAnomalyRuleType
  description: string
  enabledByDefault?: boolean
  evaluate: (
    context: SecurityAnomalyRuleContext,
  ) => SecurityAnomalyDraft | SecurityAnomalyDraft[] | null
}

export type SecuritySignalNormalizeOptions = {
  fallbackSource?: string
}

export type SecuritySignalIngestOptions = {
  transport?: SecuritySignalTransport
  enqueue?: boolean
  drain?: boolean
  fallbackSource?: string
}

export type SecuritySignalIngestResult = {
  accepted: boolean
  rejected: boolean
  dropped: boolean
  queued: boolean
  processed: boolean
  queueId: string | null
  queueLength: number
  error?: string
  signalId?: string
  anomalyCount?: number
}

export type SecuritySignalQueueState = {
  backend: 'in_memory' | 'redis'
  depth: number
  pending: number
  lag: number | null
  draining: boolean
  throttled: boolean
  highWatermark: number
  lowWatermark: number
  oldestQueuedAt: number | null
  newestQueuedAt: number | null
  stats: {
    accepted: number
    processed: number
    retried: number
    dropped: number
    rejected: number
    failed: number
    lastDrainAt: number | null
  }
}

type SecuritySignalQueueStatsInternal = {
  accepted: number
  processed: number
  retried: number
  dropped: number
  rejected: number
  failed: number
  lastDrainAt: number | null
}

type SecuritySignalQueueControlState = {
  draining: boolean
  throttled: boolean
}

const severityRank: Record<SecurityAlertSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
}

const DEFAULTS = {
  maxSignals: 10_000,
  maxAnomalies: 4_000,
  velocityWindowMs: 5 * 60 * 1000,
  velocityThreshold: 30,
  failureBurstThreshold: 8,
  principalProbeThreshold: 6,
  impossibleTravelWindowMs: 2 * 60 * 60 * 1000,
  impossibleTravelDistanceKm: 2_500,
  queueMaxDepth: 5_000,
  queueDrainBatch: 500,
  queueMaxRetries: 3,
  queueRetryBaseMs: 250,
  queueRetryMaxMs: 5_000,
}

const globalForSecurityAnomalies = globalThis as unknown as {
  securitySignals?: SecuritySignalRecord[]
  securityAnomalies?: SecurityAnomalyRecord[]
  securityGeoByKey?: Map<string, { country: string; latitude: number; longitude: number; detectedAt: number }>
  securityCountryHistory?: Map<string, Set<string>>
  securitySignalQueueAdapter?: SecuritySignalQueueAdapter
  securitySignalQueueAdapterPromise?: Promise<SecuritySignalQueueAdapter>
  securitySignalQueueStats?: SecuritySignalQueueStatsInternal
  securitySignalQueueControlState?: SecuritySignalQueueControlState
  securityPluginRules?: Map<string, SecurityAnomalyRuleDefinition>
}

const signalBuffer = globalForSecurityAnomalies.securitySignals ?? []
if (!globalForSecurityAnomalies.securitySignals) {
  globalForSecurityAnomalies.securitySignals = signalBuffer
}

const anomalyBuffer = globalForSecurityAnomalies.securityAnomalies ?? []
if (!globalForSecurityAnomalies.securityAnomalies) {
  globalForSecurityAnomalies.securityAnomalies = anomalyBuffer
}

const geoByIdentity =
  globalForSecurityAnomalies.securityGeoByKey ??
  new Map<string, { country: string; latitude: number; longitude: number; detectedAt: number }>()
if (!globalForSecurityAnomalies.securityGeoByKey) {
  globalForSecurityAnomalies.securityGeoByKey = geoByIdentity
}

const countryHistoryByIdentity = globalForSecurityAnomalies.securityCountryHistory ?? new Map<string, Set<string>>()
if (!globalForSecurityAnomalies.securityCountryHistory) {
  globalForSecurityAnomalies.securityCountryHistory = countryHistoryByIdentity
}

const queueStats = globalForSecurityAnomalies.securitySignalQueueStats ?? {
  accepted: 0,
  processed: 0,
  retried: 0,
  dropped: 0,
  rejected: 0,
  failed: 0,
  lastDrainAt: null,
}
if (!globalForSecurityAnomalies.securitySignalQueueStats) {
  globalForSecurityAnomalies.securitySignalQueueStats = queueStats
}

const queueControl = globalForSecurityAnomalies.securitySignalQueueControlState ?? {
  draining: false,
  throttled: false,
}
if (!globalForSecurityAnomalies.securitySignalQueueControlState) {
  globalForSecurityAnomalies.securitySignalQueueControlState = queueControl
}

const pluginRules = globalForSecurityAnomalies.securityPluginRules ?? new Map<string, SecurityAnomalyRuleDefinition>()
if (!globalForSecurityAnomalies.securityPluginRules) {
  globalForSecurityAnomalies.securityPluginRules = pluginRules
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.floor(parsed))
}

function nextId(prefix: 'sig' | 'anomaly'): string {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${globalThis.crypto.randomUUID()}`
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function normalizeStatusCode(value: unknown): number | null {
  const parsed = normalizeNumber(value)
  if (parsed === null) return null
  const statusCode = Math.floor(parsed)
  if (statusCode < 100 || statusCode > 599) return null
  return statusCode
}

function normalizeOutcome(value: unknown, statusCode: number | null): SecuritySignalOutcome {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'success' || normalized === 'ok' || normalized === 'allowed') return 'success'
    if (normalized === 'failure' || normalized === 'failed' || normalized === 'error') return 'failure'
    if (normalized === 'blocked' || normalized === 'denied' || normalized === 'forbidden') return 'blocked'
  }

  if (statusCode !== null) {
    if (statusCode === 401 || statusCode === 403 || statusCode === 404 || statusCode === 429) return 'blocked'
    if (statusCode >= 400) return 'failure'
    return 'success'
  }

  return 'failure'
}

function normalizeCountry(value: unknown): string | null {
  const country = normalizeString(value)
  if (!country) return null
  return country.toUpperCase().slice(0, 3)
}

function normalizeTimestamp(value: unknown): number | null {
  if (value === null || value === undefined) return null

  if (value instanceof Date) {
    const ts = value.getTime()
    if (Number.isFinite(ts) && ts > 0) return Math.floor(ts)
    return null
  }

  const numeric = normalizeNumber(value)
  if (numeric !== null && numeric > 0) {
    return Math.floor(numeric)
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed)
  }

  return null
}

function normalizeCoordinate(value: unknown, minimum: number, maximum: number): number | null {
  const parsed = normalizeNumber(value)
  if (parsed === null) return null
  if (parsed < minimum || parsed > maximum) return null
  return parsed
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readFirstValue(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      return record[key]
    }
  }
  return null
}

function readFirstString(record: Record<string, unknown>, keys: string[]): string | null {
  return normalizeString(readFirstValue(record, keys))
}

function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(ip).digest('hex')
}

function trimBuffers() {
  const maxSignals = envInt('SECURITY_ANOMALY_SIGNAL_BUFFER', DEFAULTS.maxSignals)
  if (signalBuffer.length > maxSignals) {
    signalBuffer.splice(0, signalBuffer.length - maxSignals)
  }

  const maxAnomalies = envInt('SECURITY_ANOMALY_EVENT_BUFFER', DEFAULTS.maxAnomalies)
  if (anomalyBuffer.length > maxAnomalies) {
    anomalyBuffer.splice(0, anomalyBuffer.length - maxAnomalies)
  }
}

function alertMinSeverity(): SecurityAlertSeverity {
  const raw = (process.env.SECURITY_ANOMALY_ALERT_MIN_SEVERITY ?? 'medium').trim().toLowerCase()
  if (raw === 'low' || raw === 'medium' || raw === 'high' || raw === 'critical') return raw
  return 'medium'
}

function shouldAlert(severity: SecurityAlertSeverity): boolean {
  return severityRank[severity] >= severityRank[alertMinSeverity()]
}

function isSensitiveSource(source: string): boolean {
  return source === 'wallet.send' || source === 'auth.register' || source.startsWith('wallet.read')
}

function haversineDistanceKm(
  latA: number,
  lonA: number,
  latB: number,
  lonB: number,
): number {
  const rad = (value: number) => (value * Math.PI) / 180
  const earthRadiusKm = 6_371
  const dLat = rad(latB - latA)
  const dLon = rad(lonB - lonA)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rad(latA)) * Math.cos(rad(latB)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return earthRadiusKm * c
}

function recentSignals(
  now: number,
  windowMs: number,
  predicate: (signal: SecuritySignalRecord) => boolean,
): SecuritySignalRecord[] {
  const minTs = now - windowMs
  return signalBuffer.filter((signal) => signal.detectedAt >= minTs && predicate(signal))
}

function buildWindowStats(
  now: number,
  windowMs: number,
  predicate: (signal: SecuritySignalRecord) => boolean,
): SecuritySignalWindowStats {
  const minTs = now - windowMs
  const series = new Map<number, number>()
  let count = 0

  for (const signal of signalBuffer) {
    if (signal.detectedAt < minTs) continue
    if (!predicate(signal)) continue

    count += 1
    const minute = Math.floor(signal.detectedAt / 60_000) * 60_000
    series.set(minute, (series.get(minute) ?? 0) + 1)
  }

  return {
    windowMs,
    count,
    series: Array.from(series.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([minute, bucketCount]) => ({ minute, count: bucketCount })),
  }
}

function createAnomaly(
  signal: SecuritySignalRecord,
  rule: SecurityAnomalyRuleDefinition,
  draft: SecurityAnomalyDraft,
): SecurityAnomalyRecord {
  return {
    id: nextId('anomaly'),
    ruleId: rule.id,
    ruleType: rule.type,
    severity: draft.severity ?? severityFromScore(draft.score),
    repetitive: rule.type === 'repetitive',
    score: Math.max(0, Math.min(100, Math.round(draft.score))),
    summary: draft.summary,
    details: draft.details ?? {},
    signalId: signal.id,
    detectedAt: signal.detectedAt,
  }
}

function severityFromScore(score: number): SecurityAlertSeverity {
  if (score >= 90) return 'critical'
  if (score >= 75) return 'high'
  if (score >= 50) return 'medium'
  return 'low'
}

function scoreFromThreshold(observed: number, threshold: number, base: number, cap: number): number {
  if (threshold <= 0) return Math.max(0, Math.min(100, base))
  const ratio = observed / threshold
  const normalized = Math.max(0, Math.min(2, ratio)) / 2
  const raw = base + normalized * (cap - base)
  return Math.max(0, Math.min(100, Math.round(raw)))
}

function signalIdentityKey(signal: SecuritySignalRecord): string | null {
  if (signal.sessionId) return `session:${signal.sessionId}`
  if (signal.deviceId) return `device:${signal.deviceId}`
  if (signal.userId) return `user:${signal.userId}`
  return null
}

async function emitAnomaly(signal: SecuritySignalRecord, anomaly: SecurityAnomalyRecord) {
  anomalyBuffer.push(anomaly)
  trimBuffers()

  logWarn('security-anomaly', new Error(anomaly.summary), {
    anomalyId: anomaly.id,
    ruleId: anomaly.ruleId,
    ruleType: anomaly.ruleType,
    severity: anomaly.severity,
    repetitive: anomaly.repetitive,
    source: signal.source,
    route: signal.route ?? null,
    outcome: signal.outcome,
    statusCode: signal.statusCode ?? null,
    details: anomaly.details,
  })

  if (!shouldAlert(anomaly.severity)) return

  const fingerprint = signal.ipHash ?? signal.userId ?? signal.sessionId ?? signal.deviceId ?? 'anon'
  await emitSecurityAlert({
    ruleId: anomaly.ruleId,
    source: signal.source,
    severity: anomaly.severity,
    repetitive: anomaly.repetitive,
    title: anomaly.summary,
    description: `source=${signal.source} outcome=${signal.outcome} route=${signal.route ?? 'n/a'}`,
    fingerprint,
    context: {
      signalId: signal.id,
      source: signal.source,
      route: signal.route ?? null,
      outcome: signal.outcome,
      statusCode: signal.statusCode ?? null,
      ipHash: signal.ipHash ?? null,
      userId: signal.userId ?? null,
      sessionId: signal.sessionId ?? null,
      deviceId: signal.deviceId ?? null,
      country: signal.country ?? null,
      transport: signal.transport,
      details: anomaly.details,
    },
  })
}

const builtInRules: SecurityAnomalyRuleDefinition[] = [
  {
    id: 'velocity.by_ip_source',
    type: 'repetitive',
    description: 'High request velocity from one IP/source pair over a sliding window.',
    evaluate: (ctx) => {
      if (!ctx.signal.ipHash) return null

      const windowMs = envInt('SECURITY_ANOMALY_VELOCITY_WINDOW_MS', DEFAULTS.velocityWindowMs)
      const threshold = envInt('SECURITY_ANOMALY_VELOCITY_THRESHOLD', DEFAULTS.velocityThreshold)
      const stats = ctx.windowStats(
        windowMs,
        (item) => item.ipHash === ctx.signal.ipHash && item.source === ctx.signal.source,
      )

      if (stats.count < threshold) return null

      return {
        score: scoreFromThreshold(stats.count, threshold, 55, 80),
        summary: 'High request velocity detected from a single source/IP pair.',
        details: {
          observedCount: stats.count,
          threshold,
          windowMs,
          series: stats.series,
        },
      }
    },
  },
  {
    id: 'failure.burst',
    type: 'repetitive',
    description: 'Repeated failed requests from one IP/source pair over a sliding window.',
    evaluate: (ctx) => {
      if (!ctx.signal.ipHash || ctx.signal.outcome === 'success') return null

      const windowMs = envInt('SECURITY_ANOMALY_VELOCITY_WINDOW_MS', DEFAULTS.velocityWindowMs)
      const threshold = envInt('SECURITY_ANOMALY_FAILURE_BURST_THRESHOLD', DEFAULTS.failureBurstThreshold)
      const stats = ctx.windowStats(
        windowMs,
        (item) =>
          item.ipHash === ctx.signal.ipHash &&
          item.source === ctx.signal.source &&
          item.outcome !== 'success',
      )

      if (stats.count < threshold) return null

      return {
        score: scoreFromThreshold(stats.count, threshold, 75, 92),
        summary: 'Failure burst detected from a single IP.',
        details: {
          failureCount: stats.count,
          threshold,
          windowMs,
          series: stats.series,
        },
      }
    },
  },
  {
    id: 'probe.multi_principal',
    type: 'repetitive',
    description: 'Many distinct principals targeted by one IP/source in a short window.',
    evaluate: (ctx) => {
      if (!ctx.signal.ipHash || !ctx.signal.principal) return null

      const windowMs = envInt('SECURITY_ANOMALY_VELOCITY_WINDOW_MS', DEFAULTS.velocityWindowMs)
      const threshold = envInt(
        'SECURITY_ANOMALY_PRINCIPAL_PROBE_THRESHOLD',
        DEFAULTS.principalProbeThreshold,
      )
      const targetedSignals = ctx.recent(
        windowMs,
        (item) =>
          item.ipHash === ctx.signal.ipHash &&
          item.source === ctx.signal.source &&
          item.principal !== null &&
          item.principal !== undefined,
      )

      const principals = new Set(targetedSignals.map((item) => item.principal as string))
      if (principals.size < threshold) return null

      const stats = ctx.windowStats(
        windowMs,
        (item) => item.ipHash === ctx.signal.ipHash && item.source === ctx.signal.source,
      )

      return {
        score: scoreFromThreshold(principals.size, threshold, 80, 96),
        summary: 'Multiple unique principals targeted from one IP in a short window.',
        details: {
          distinctPrincipals: principals.size,
          threshold,
          windowMs,
          series: stats.series,
        },
      }
    },
  },
  {
    id: 'probe.internal_route',
    type: 'non_repetitive',
    description: 'Single unauthorized attempt against an internal route.',
    evaluate: (ctx) => {
      if (!ctx.signal.source.startsWith('internal.') || ctx.signal.outcome === 'success') return null

      return {
        severity: 'critical',
        score: 95,
        summary: 'Unauthorized access attempt against an internal route.',
        details: {
          source: ctx.signal.source,
          route: ctx.signal.route ?? null,
          statusCode: ctx.signal.statusCode ?? null,
        },
      }
    },
  },
  {
    id: 'geo.impossible_travel',
    type: 'non_repetitive',
    description:
      'Single event indicates impossible travel for same session/device/user identity within limited time.',
    evaluate: (ctx) => {
      const identityKey = ctx.identityKey
      if (
        !identityKey ||
        !ctx.signal.country ||
        typeof ctx.signal.latitude !== 'number' ||
        typeof ctx.signal.longitude !== 'number'
      ) {
        return null
      }

      const previous = geoByIdentity.get(identityKey)
      let draft: SecurityAnomalyDraft | null = null

      if (previous && previous.country !== ctx.signal.country) {
        const windowMs = envInt(
          'SECURITY_ANOMALY_IMPOSSIBLE_TRAVEL_WINDOW_MS',
          DEFAULTS.impossibleTravelWindowMs,
        )
        const minDistanceKm = envInt(
          'SECURITY_ANOMALY_IMPOSSIBLE_TRAVEL_DISTANCE_KM',
          DEFAULTS.impossibleTravelDistanceKm,
        )

        const deltaMs = ctx.signal.detectedAt - previous.detectedAt
        const distanceKm = haversineDistanceKm(
          previous.latitude,
          previous.longitude,
          ctx.signal.latitude,
          ctx.signal.longitude,
        )

        if (deltaMs > 0 && deltaMs <= windowMs && distanceKm >= minDistanceKm) {
          draft = {
            severity: 'high',
            score: 88,
            summary: 'Impossible travel pattern detected for a session/device identity.',
            details: {
              identityKey,
              fromCountry: previous.country,
              toCountry: ctx.signal.country,
              distanceKm: Math.round(distanceKm),
              deltaMs,
              maxWindowMs: windowMs,
            },
          }
        }
      }

      geoByIdentity.set(identityKey, {
        country: ctx.signal.country,
        latitude: ctx.signal.latitude,
        longitude: ctx.signal.longitude,
        detectedAt: ctx.signal.detectedAt,
      })

      return draft
    },
  },
  {
    id: 'geo.new_country_sensitive',
    type: 'non_repetitive',
    description: 'Sensitive action from an unseen country for a known identity.',
    evaluate: (ctx) => {
      const identityKey = ctx.identityKey
      if (!identityKey || !ctx.signal.country || !isSensitiveSource(ctx.signal.source)) return null

      const countries = countryHistoryByIdentity.get(identityKey) ?? new Set<string>()
      const seenBefore = countries.has(ctx.signal.country)
      let draft: SecurityAnomalyDraft | null = null

      if (!seenBefore && countries.size > 0) {
        draft = {
          severity: 'medium',
          score: 60,
          summary: 'Sensitive action observed from a new country for this identity.',
          details: {
            identityKey,
            country: ctx.signal.country,
            knownCountries: Array.from(countries),
            source: ctx.signal.source,
          },
        }
      }

      countries.add(ctx.signal.country)
      countryHistoryByIdentity.set(identityKey, countries)

      return draft
    },
  },
]

function parseRuleListEnv(name: string): Set<string> {
  const raw = process.env[name]
  if (!raw) return new Set()
  return new Set(
    raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  )
}

function isRuleEnabled(ruleId: string, enabledByDefault = true): boolean {
  const enabledList = parseRuleListEnv('SECURITY_ANOMALY_RULES_ENABLED')
  const disabledList = parseRuleListEnv('SECURITY_ANOMALY_RULES_DISABLED')

  if (enabledList.size > 0) {
    return enabledList.has(ruleId)
  }

  if (disabledList.has(ruleId)) {
    return false
  }

  return enabledByDefault
}

function activeRules(): SecurityAnomalyRuleDefinition[] {
  return [...builtInRules, ...pluginRules.values()]
}

function evaluateRules(signal: SecuritySignalRecord): SecurityAnomalyRecord[] {
  const now = signal.detectedAt
  const context: SecurityAnomalyRuleContext = {
    signal,
    now,
    identityKey: signalIdentityKey(signal),
    windowStats: (windowMs, predicate) => buildWindowStats(now, windowMs, predicate),
    recent: (windowMs, predicate) => recentSignals(now, windowMs, predicate),
  }

  const anomalies: SecurityAnomalyRecord[] = []

  for (const rule of activeRules()) {
    if (!isRuleEnabled(rule.id, rule.enabledByDefault ?? true)) continue

    try {
      const evaluated = rule.evaluate(context)
      if (!evaluated) continue

      const drafts = Array.isArray(evaluated) ? evaluated : [evaluated]
      for (const draft of drafts) {
        anomalies.push(createAnomaly(signal, rule, draft))
      }
    } catch (error) {
      logError('security-anomaly:rule', error, {
        ruleId: rule.id,
        source: signal.source,
        signalId: signal.id,
      })
    }
  }

  return anomalies
}

function normalizeDetectedAt(value: number | null): number {
  if (value === null) return Date.now()
  const now = Date.now()
  const futureLimit = now + 5 * 60 * 1000
  if (value > futureLimit) return now
  return value
}

function queueRetryDelayMs(attempt: number): number {
  const base = envInt('SECURITY_SIGNAL_QUEUE_RETRY_BASE_MS', DEFAULTS.queueRetryBaseMs)
  const max = envInt('SECURITY_SIGNAL_QUEUE_RETRY_MAX_MS', DEFAULTS.queueRetryMaxMs)
  const delay = base * Math.pow(2, Math.max(0, attempt - 1))
  return Math.min(max, Math.max(base, Math.floor(delay)))
}

function queueHighWatermark(): number {
  const configured = envInt('SECURITY_SIGNAL_QUEUE_HIGH_WATER', 0)
  if (configured > 0) return configured
  const maxDepth = envInt('SECURITY_SIGNAL_QUEUE_MAX_DEPTH', DEFAULTS.queueMaxDepth)
  return Math.max(1, Math.floor(maxDepth * 0.9))
}

function queueLowWatermark(highWatermark: number): number {
  const configured = envInt('SECURITY_SIGNAL_QUEUE_LOW_WATER', 0)
  if (configured > 0) return Math.min(highWatermark, configured)
  return Math.max(0, Math.floor(highWatermark * 0.7))
}

async function resolveQueueAdapter(): Promise<SecuritySignalQueueAdapter> {
  if (globalForSecurityAnomalies.securitySignalQueueAdapter) {
    return globalForSecurityAnomalies.securitySignalQueueAdapter
  }

  if (!globalForSecurityAnomalies.securitySignalQueueAdapterPromise) {
    globalForSecurityAnomalies.securitySignalQueueAdapterPromise = createQueueAdapterFromEnv()
      .catch((error) => {
        logError('security-signal:adapter', error)
        throw error
      })
  }

  const adapter = await globalForSecurityAnomalies.securitySignalQueueAdapterPromise
  globalForSecurityAnomalies.securitySignalQueueAdapter = adapter
  return adapter
}

async function currentQueueDepth(adapter: SecuritySignalQueueAdapter): Promise<number> {
  const stats = await adapter.getStats()
  return stats.depth
}

async function applyQueueBackpressureGate(
  adapter: SecuritySignalQueueAdapter,
): Promise<{ allowed: boolean; queueLength: number }> {
  const stats = await adapter.getStats()
  const queueLoad = stats.lag ?? stats.depth
  const highWatermark = queueHighWatermark()
  const lowWatermark = queueLowWatermark(highWatermark)

  if (queueControl.throttled && queueLoad <= lowWatermark) {
    queueControl.throttled = false
  }

  if (!queueControl.throttled && queueLoad >= highWatermark) {
    queueControl.throttled = true
    try {
      await emitSecurityAlert({
        ruleId: 'queue.backpressure.high_water',
        source: 'internal.security-signals',
        severity: 'high',
        repetitive: true,
        title: 'Security signal queue entered backpressure mode.',
        description: `backend=${stats.backend} load=${queueLoad} highWatermark=${highWatermark}`,
        fingerprint: `queue:${stats.backend}`,
        context: {
          backend: stats.backend,
          depth: stats.depth,
          load: queueLoad,
          pending: stats.pending,
          lag: stats.lag,
          highWatermark,
          lowWatermark,
        },
      })
    } catch (error) {
      logError('security-signal:backpressure-alert', error, {
        backend: stats.backend,
        depth: queueLoad,
      })
    }
  }

  if (queueControl.throttled && queueLoad > lowWatermark) {
    return { allowed: false, queueLength: queueLoad }
  }

  return { allowed: true, queueLength: queueLoad }
}

function buildSignalRecord(input: SecuritySignalInput, transport: SecuritySignalTransport): SecuritySignalRecord {
  return {
    ...input,
    id: nextId('sig'),
    source: input.source,
    route: input.route ?? null,
    outcome: input.outcome,
    statusCode: input.statusCode ?? null,
    ipHash: input.ipHash ?? null,
    userId: input.userId ?? null,
    sessionId: input.sessionId ?? null,
    deviceId: input.deviceId ?? null,
    principal: input.principal ?? null,
    country: input.country ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    userAgent: input.userAgent ?? null,
    details: input.details ?? {},
    detectedAt: normalizeDetectedAt(input.detectedAt ?? null),
    transport,
  }
}

async function processSecuritySignalInternal(
  input: SecuritySignalInput,
  transport: SecuritySignalTransport,
): Promise<SecurityAnomalyResult> {
  const signal = buildSignalRecord(input, transport)

  signalBuffer.push(signal)
  trimBuffers()

  const anomalies = evaluateRules(signal)
  for (const anomaly of anomalies) {
    await emitAnomaly(signal, anomaly)
  }

  return { signal, anomalies }
}

export function normalizeSecuritySignalInput(
  input: SecuritySignalInput | Record<string, unknown>,
  options?: SecuritySignalNormalizeOptions,
): SecuritySignalInput {
  const raw = asRecord(input)
  if (!raw) {
    throw new Error('Security signal must be a JSON object')
  }

  const fallbackSource = normalizeString(options?.fallbackSource)
  const source =
    readFirstString(raw, ['source', 'service', 'module', 'eventSource']) ?? fallbackSource
  if (!source) {
    throw new Error('Security signal source is required')
  }

  const statusCode = normalizeStatusCode(readFirstValue(raw, ['statusCode', 'status', 'httpStatus']))
  const outcome = normalizeOutcome(readFirstValue(raw, ['outcome', 'result', 'eventOutcome']), statusCode)

  const latitude = normalizeCoordinate(
    readFirstValue(raw, ['latitude', 'lat', 'geoLatitude']),
    -90,
    90,
  )
  const longitude = normalizeCoordinate(
    readFirstValue(raw, ['longitude', 'lon', 'lng', 'geoLongitude']),
    -180,
    180,
  )

  const rawIpHash = readFirstString(raw, ['ipHash'])
  const rawIp = readFirstString(raw, ['ip', 'clientIp'])
  const ipHash = rawIpHash ?? (rawIp ? hashIp(rawIp) : null)

  const details =
    asRecord(readFirstValue(raw, ['details', 'meta'])) ??
    (asRecord(raw.details) ?? {})

  return {
    source,
    route: readFirstString(raw, ['route', 'path', 'endpoint']),
    outcome,
    statusCode,
    ipHash,
    userId: readFirstString(raw, ['userId', 'uid', 'subject']),
    sessionId: readFirstString(raw, ['sessionId', 'sid']),
    deviceId: readFirstString(raw, ['deviceId']),
    principal: readFirstString(raw, ['principal', 'email', 'username']),
    country: normalizeCountry(readFirstValue(raw, ['country', 'geoCountry'])),
    latitude,
    longitude,
    userAgent: readFirstString(raw, ['userAgent', 'ua']),
    details,
    detectedAt: normalizeTimestamp(readFirstValue(raw, ['detectedAt', 'timestamp', 'ts'])),
  }
}

export async function drainSecuritySignalQueue(options?: {
  maxItems?: number
}): Promise<{ processed: number; retried: number; failed: number; remaining: number }> {
  const adapter = await resolveQueueAdapter()
  if (queueControl.draining) {
    const remaining = await currentQueueDepth(adapter)
    return {
      processed: 0,
      retried: 0,
      failed: 0,
      remaining,
    }
  }

  queueControl.draining = true
  const maxItems = options?.maxItems ?? envInt('SECURITY_SIGNAL_QUEUE_DRAIN_BATCH', DEFAULTS.queueDrainBatch)
  const dequeueBatchSize = envInt('SECURITY_SIGNAL_QUEUE_DEQUEUE_BATCH', 64)
  let processed = 0
  let retried = 0
  let failed = 0

  try {
    while (processed + retried + failed < maxItems) {
      const budget = maxItems - (processed + retried + failed)
      const dequeueCount = Math.max(1, Math.min(dequeueBatchSize, budget))
      const messages = await adapter.dequeue(dequeueCount)
      if (messages.length === 0) break

      for (const message of messages) {
        try {
          await processSecuritySignalInternal(message.signal, message.transport)
          await adapter.ack(message)
          queueStats.processed += 1
          processed += 1
        } catch (error) {
          const attempts = message.retryCount + 1
          const maxRetries = envInt('SECURITY_SIGNAL_QUEUE_MAX_RETRIES', DEFAULTS.queueMaxRetries)

          if (attempts <= maxRetries) {
            try {
              await adapter.ack(message)
              await adapter.enqueue(message.signal, {
                transport: message.transport,
                retryCount: attempts,
                delayMs: queueRetryDelayMs(attempts),
              })
              queueStats.retried += 1
              retried += 1
              logWarn('security-signal:retry', new Error(getErrorMessage(error, 'Signal processing failed')), {
                queueId: message.id,
                attempts,
                nextAttemptInMs: queueRetryDelayMs(attempts),
                source: message.signal.source,
              })
            } catch (requeueError) {
              queueStats.failed += 1
              failed += 1
              logError('security-signal:failed', requeueError, {
                queueId: message.id,
                attempts,
                source: message.signal.source,
              })
            }
          } else {
            queueStats.failed += 1
            failed += 1
            try {
              await adapter.ack(message)
            } catch (ackError) {
              logError('security-signal:ack', ackError, {
                queueId: message.id,
                source: message.signal.source,
              })
            }
            logError('security-signal:failed', error, {
              queueId: message.id,
              attempts,
              source: message.signal.source,
            })
          }
        }

        if (processed + retried + failed >= maxItems) {
          break
        }
      }
    }
  } finally {
    queueStats.lastDrainAt = Date.now()
    queueControl.draining = false
  }

  const remaining = await currentQueueDepth(adapter)
  return {
    processed,
    retried,
    failed,
    remaining,
  }
}

export async function ingestSecuritySignal(
  input: SecuritySignalInput | Record<string, unknown>,
  options?: SecuritySignalIngestOptions,
): Promise<SecuritySignalIngestResult> {
  const transport = options?.transport ?? 'queue'
  const shouldEnqueue = options?.enqueue ?? transport !== 'direct'
  const adapter = await resolveQueueAdapter()

  let normalized: SecuritySignalInput
  try {
    normalized = normalizeSecuritySignalInput(input, {
      fallbackSource: options?.fallbackSource,
    })
  } catch (error) {
    queueStats.rejected += 1
    const message = getErrorMessage(error, 'Invalid signal')
    const queueLength = await currentQueueDepth(adapter)
    return {
      accepted: false,
      rejected: true,
      dropped: false,
      queued: false,
      processed: false,
      queueId: null,
      queueLength,
      error: message,
    }
  }

  if (!shouldEnqueue) {
    const result = await processSecuritySignalInternal(normalized, 'direct')
    const queueLength = await currentQueueDepth(adapter)
    return {
      accepted: true,
      rejected: false,
      dropped: false,
      queued: false,
      processed: true,
      queueId: null,
      queueLength,
      signalId: result.signal.id,
      anomalyCount: result.anomalies.length,
    }
  }

  const backpressure = await applyQueueBackpressureGate(adapter)
  if (!backpressure.allowed) {
    queueStats.rejected += 1
    return {
      accepted: false,
      rejected: true,
      dropped: false,
      queued: false,
      processed: false,
      queueId: null,
      queueLength: backpressure.queueLength,
      error: 'queue_throttled',
    }
  }

  try {
    const queued = await adapter.enqueue(normalized, {
      transport,
      retryCount: 0,
    })
    queueStats.accepted += 1
    if (queued.dropped) {
      queueStats.dropped += 1
    }

    if (options?.drain ?? true) {
      await drainSecuritySignalQueue()
    }

    const queueLength = await currentQueueDepth(adapter)
    return {
      accepted: true,
      rejected: false,
      dropped: queued.dropped,
      queued: true,
      processed: false,
      queueId: queued.message.id,
      queueLength,
    }
  } catch (error) {
    queueStats.rejected += 1
    const queueLength = await currentQueueDepth(adapter)
    const message = getErrorMessage(error, 'queue_enqueue_failed')
    return {
      accepted: false,
      rejected: true,
      dropped: false,
      queued: false,
      processed: false,
      queueId: null,
      queueLength,
      error: message,
    }
  }
}

export async function ingestSecuritySignalsBatch(
  inputs: Array<SecuritySignalInput | Record<string, unknown>>,
  options?: SecuritySignalIngestOptions,
): Promise<SecuritySignalIngestResult[]> {
  const results: SecuritySignalIngestResult[] = []

  for (const input of inputs) {
    results.push(
      await ingestSecuritySignal(input, {
        ...options,
        drain: false,
      }),
    )
  }

  if (options?.drain ?? true) {
    await drainSecuritySignalQueue()
  }

  return results
}

export async function recordSecuritySignal(input: SecuritySignalInput): Promise<SecurityAnomalyResult> {
  const normalized = normalizeSecuritySignalInput(input, {
    fallbackSource: input.source,
  })
  return processSecuritySignalInternal(normalized, 'direct')
}

export function getRecentSecuritySignals(limit = 300): SecuritySignalRecord[] {
  const max = Number.isInteger(limit) && limit > 0 ? limit : 300
  return signalBuffer.slice(-max).reverse()
}

export function getRecentSecurityAnomalies(limit = 200): SecurityAnomalyRecord[] {
  const max = Number.isInteger(limit) && limit > 0 ? limit : 200
  return anomalyBuffer.slice(-max).reverse()
}

export async function getSecuritySignalQueueState(): Promise<SecuritySignalQueueState> {
  const adapter = await resolveQueueAdapter()
  const stats = await adapter.getStats()
  const highWatermark = queueHighWatermark()
  const lowWatermark = queueLowWatermark(highWatermark)
  if (queueControl.throttled && stats.depth <= lowWatermark) {
    queueControl.throttled = false
  }

  return {
    backend: stats.backend,
    depth: stats.depth,
    pending: stats.pending,
    lag: stats.lag,
    draining: queueControl.draining,
    throttled: queueControl.throttled,
    highWatermark,
    lowWatermark,
    oldestQueuedAt: stats.oldestQueuedAt,
    newestQueuedAt: stats.newestQueuedAt,
    stats: {
      accepted: queueStats.accepted,
      processed: queueStats.processed,
      retried: queueStats.retried,
      dropped: queueStats.dropped,
      rejected: queueStats.rejected,
      failed: queueStats.failed,
      lastDrainAt: queueStats.lastDrainAt,
    },
  }
}

export function setSecuritySignalQueueAdapterForTests(adapter: SecuritySignalQueueAdapter | null) {
  globalForSecurityAnomalies.securitySignalQueueAdapter = adapter ?? undefined
  globalForSecurityAnomalies.securitySignalQueueAdapterPromise = adapter
    ? Promise.resolve(adapter)
    : undefined
}

export function registerSecurityAnomalyRule(rule: SecurityAnomalyRuleDefinition) {
  if (builtInRules.some((item) => item.id === rule.id)) {
    throw new Error(`Cannot override built-in rule: ${rule.id}`)
  }
  pluginRules.set(rule.id, rule)
}

export function unregisterSecurityAnomalyRule(ruleId: string) {
  pluginRules.delete(ruleId)
}

export function listSecurityAnomalyRules(): Array<{
  id: string
  type: SecurityAnomalyRuleType
  description: string
  builtin: boolean
  enabled: boolean
}> {
  const builtInIds = new Set(builtInRules.map((rule) => rule.id))
  return activeRules().map((rule) => ({
    id: rule.id,
    type: rule.type,
    description: rule.description,
    builtin: builtInIds.has(rule.id),
    enabled: isRuleEnabled(rule.id, rule.enabledByDefault ?? true),
  }))
}

export function clearSecurityAnomalyStateForTests() {
  signalBuffer.splice(0, signalBuffer.length)
  anomalyBuffer.splice(0, anomalyBuffer.length)
  geoByIdentity.clear()
  countryHistoryByIdentity.clear()

  maybeResetQueueAdapterForTests(globalForSecurityAnomalies.securitySignalQueueAdapter)
  globalForSecurityAnomalies.securitySignalQueueAdapter = undefined
  globalForSecurityAnomalies.securitySignalQueueAdapterPromise = undefined

  queueStats.accepted = 0
  queueStats.processed = 0
  queueStats.retried = 0
  queueStats.dropped = 0
  queueStats.rejected = 0
  queueStats.failed = 0
  queueStats.lastDrainAt = null
  queueControl.draining = false
  queueControl.throttled = false

  pluginRules.clear()
}
