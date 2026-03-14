import { prismaCrdb } from '@/lib/prisma-crdb'
import { emitSecurityAlert } from '@/services/security-alert.service'
import { recordTelemetryEvent } from '@/services/telemetry.service'

type ChainTransactionStatus =
  | 'submitted'
  | 'included'
  | 'confirmed_soft'
  | 'confirmed_final'
  | 'reorged'

type StuckStatus = 'submitted' | 'included'
type WorkerTrigger = 'startup' | 'interval'

type StuckTransactionSummary = {
  count: number
  oldestUpdatedAt: string | null
  oldestAgeMs: number | null
  sampleTxHashes: string[]
}

export type ChainTransactionSyncMetrics = {
  observedAt: string
  networkId: string | null
  trigger: WorkerTrigger
  processedCount: number
  succeededCount: number
  failedCount: number
  syncableCount: number
  submittedCount: number
  includedCount: number
  confirmedSoftCount: number
  confirmedFinalCount: number
  reorgedCount: number
  stuckSubmitted: StuckTransactionSummary
  stuckIncluded: StuckTransactionSummary
}

const WORKER_SESSION_ID = 'server:chain-tx-sync-worker'
const WORKER_PATH = '/internal/workers/chain-tx-sync'
const DEFAULT_SUBMITTED_STUCK_MS = 2 * 60 * 1000
const DEFAULT_INCLUDED_STUCK_MS = 15 * 60 * 1000
const DEFAULT_STUCK_ALERT_MIN_COUNT = 1

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw?.trim()) return fallback

  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback

  return Math.floor(parsed)
}

function stuckThresholdMs(status: StuckStatus): number {
  if (status === 'submitted') {
    return envInt(
      'CHAIN_TRANSACTION_STUCK_SUBMITTED_MS',
      envInt('CHAIN_TRANSACTION_STUCK_BROADCASTED_MS', DEFAULT_SUBMITTED_STUCK_MS),
    )
  }

  return envInt(
    'CHAIN_TRANSACTION_STUCK_INCLUDED_MS',
    envInt('CHAIN_TRANSACTION_STUCK_PENDING_MS', DEFAULT_INCLUDED_STUCK_MS),
  )
}

function alertMinCount(): number {
  return envInt('CHAIN_TRANSACTION_STUCK_ALERT_MIN_COUNT', DEFAULT_STUCK_ALERT_MIN_COUNT)
}

async function readStatusCount(status: ChainTransactionStatus, networkId: string | null): Promise<number> {
  return prismaCrdb.chainTransaction.count({
    where: {
      chainType: 'EVM',
      status,
      ...(networkId ? { networkId } : {}),
    },
  })
}

async function readStuckSummary(status: StuckStatus, networkId: string | null): Promise<StuckTransactionSummary> {
  const thresholdMs = stuckThresholdMs(status)
  const thresholdDate = new Date(Date.now() - thresholdMs)
  const rows = await prismaCrdb.chainTransaction.findMany({
    where: {
      chainType: 'EVM',
      status,
      updatedAt: { lte: thresholdDate },
      ...(networkId ? { networkId } : {}),
    },
    select: {
      txHash: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'asc' },
    take: 5,
  })

  return {
    count: await prismaCrdb.chainTransaction.count({
      where: {
        chainType: 'EVM',
        status,
        updatedAt: { lte: thresholdDate },
        ...(networkId ? { networkId } : {}),
      },
    }),
    oldestUpdatedAt: rows[0]?.updatedAt.toISOString() ?? null,
    oldestAgeMs: rows[0] ? Date.now() - rows[0].updatedAt.getTime() : null,
    sampleTxHashes: rows.map((row) => row.txHash),
  }
}

export async function collectChainTransactionSyncMetrics(input: {
  trigger: WorkerTrigger
  networkId: string | null
  processedCount: number
  succeededCount: number
  failedCount: number
}): Promise<ChainTransactionSyncMetrics> {
  const [
    submittedCount,
    includedCount,
    confirmedSoftCount,
    confirmedFinalCount,
    reorgedCount,
    stuckSubmitted,
    stuckIncluded,
  ] = await Promise.all([
    readStatusCount('submitted', input.networkId),
    readStatusCount('included', input.networkId),
    readStatusCount('confirmed_soft', input.networkId),
    readStatusCount('confirmed_final', input.networkId),
    readStatusCount('reorged', input.networkId),
    readStuckSummary('submitted', input.networkId),
    readStuckSummary('included', input.networkId),
  ])

  return {
    observedAt: new Date().toISOString(),
    networkId: input.networkId,
    trigger: input.trigger,
    processedCount: input.processedCount,
    succeededCount: input.succeededCount,
    failedCount: input.failedCount,
    syncableCount: submittedCount + includedCount + confirmedSoftCount + confirmedFinalCount + reorgedCount,
    submittedCount,
    includedCount,
    confirmedSoftCount,
    confirmedFinalCount,
    reorgedCount,
    stuckSubmitted,
    stuckIncluded,
  }
}

async function maybeEmitStuckAlert(input: {
  networkId: string | null
  status: StuckStatus
  summary: StuckTransactionSummary
}) {
  if (input.summary.count < alertMinCount()) return

  const severity = input.status === 'included' ? 'high' : 'medium'
  await emitSecurityAlert({
    ruleId: `wallet.chain_transaction.stuck_${input.status}`,
    source: 'worker.chain-tx-sync',
    severity,
    repetitive: true,
    title: `Detected stuck EVM transactions in ${input.status} state.`,
    description: `network=${input.networkId ?? 'all'} count=${input.summary.count}`,
    fingerprint: `chain-tx:${input.networkId ?? 'all'}:${input.status}`,
    context: {
      networkId: input.networkId,
      status: input.status,
      count: input.summary.count,
      oldestUpdatedAt: input.summary.oldestUpdatedAt,
      oldestAgeMs: input.summary.oldestAgeMs,
      sampleTxHashes: input.summary.sampleTxHashes,
      thresholdMs: stuckThresholdMs(input.status),
    },
  })
}

export async function observeChainTransactionSyncPass(metrics: ChainTransactionSyncMetrics) {
  await recordTelemetryEvent({
    event: 'chain_transaction_sync_pass',
    sessionId: WORKER_SESSION_ID,
    deviceId: metrics.networkId ?? 'all',
    path: WORKER_PATH,
    context: {
      trigger: metrics.trigger,
      networkId: metrics.networkId,
    },
    payload: {
      observedAt: metrics.observedAt,
      processedCount: metrics.processedCount,
      succeededCount: metrics.succeededCount,
      failedCount: metrics.failedCount,
      syncableCount: metrics.syncableCount,
      submittedCount: metrics.submittedCount,
      includedCount: metrics.includedCount,
      confirmedSoftCount: metrics.confirmedSoftCount,
      confirmedFinalCount: metrics.confirmedFinalCount,
      reorgedCount: metrics.reorgedCount,
      stuckSubmitted: metrics.stuckSubmitted,
      stuckIncluded: metrics.stuckIncluded,
    },
  })

  await Promise.all([
    maybeEmitStuckAlert({
      networkId: metrics.networkId,
      status: 'submitted',
      summary: metrics.stuckSubmitted,
    }),
    maybeEmitStuckAlert({
      networkId: metrics.networkId,
      status: 'included',
      summary: metrics.stuckIncluded,
    }),
  ])
}
