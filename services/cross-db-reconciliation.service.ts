import { normalizeTransferWorkflowStatus } from '@/lib/chain-transactions'
import { prismaCrdb } from '@/lib/prisma-crdb'
import { prismaPg } from '@/lib/prisma-pg'
import { Prisma } from '@/prisma/generated/pg'

type ReconciliationIssueState = 'opened' | 'updated' | 'resolved' | 'noop'
type ReconciliationIssueScope = 'wallet_transfer_log' | 'xrpl_action' | 'risk_decision'
type TransferIssueKind = 'MISSING_CHAIN_TRANSACTION' | 'CHAIN_TRANSACTION_MISMATCH'
type XrplIssueKind = 'MISSING_XRPL_TRANSACTION' | 'XRPL_TRANSACTION_MISMATCH'
type RiskIssueKind =
  | 'RISK_DECISION_MISSING_IDEMPOTENCY_KEY'
  | 'RISK_DECISION_MISSING_TRANSFER_LOG'
  | 'RISK_DECISION_OUTCOME_MISMATCH'
type ReconciliationIssueKind = TransferIssueKind | XrplIssueKind | RiskIssueKind

export type CrossDbReconciliationConfig = {
  lookbackHours: number
  graceMs: number
  transferLimit: number
  xrplLimit: number
  riskLimit: number
}

type ReconciliationBucketResult = {
  checkedCount: number
  missingCount: number
  mismatchCount: number
}

export type CrossDbReconciliationResult = {
  skipped: boolean
  openedCount: number
  resolvedCount: number
  transfer: ReconciliationBucketResult
  xrpl: ReconciliationBucketResult
  risk: ReconciliationBucketResult
}

const DEFAULT_LOOKBACK_HOURS = 24
const DEFAULT_GRACE_MS = 2 * 60 * 1000
const DEFAULT_TRANSFER_LIMIT = 200
const DEFAULT_XRPL_LIMIT = 200
const DEFAULT_RISK_LIMIT = 200
const XRPL_RISK_CHAIN_ID = 999_000

const TRANSFER_STATUSES_EXPECTING_CHAIN_TX = new Set([
  'submitted',
  'included',
  'confirmed_soft',
  'confirmed_final',
  'reorged',
  'replaced',
  'dropped',
])

const XRPL_ACTION_STATUSES_EXPECTING_TRANSACTION = new Set(['submitted', 'validated', 'failed'])

function canUsePg() {
  return Boolean(process.env.PG_DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim())
}

function canUseCrdb() {
  return Boolean(process.env.CRDB_DATABASE_URL?.trim() || process.env.COCKROACH_URL?.trim())
}

function parsePositiveInteger(rawValue: string | undefined, fallback: number, fieldName: string): number {
  if (!rawValue?.trim()) return fallback

  const parsed = Number(rawValue)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive integer`)
  }

  return parsed
}

export function readCrossDbReconciliationConfig(): CrossDbReconciliationConfig {
  return {
    lookbackHours: parsePositiveInteger(
      process.env.CROSS_DB_RECONCILIATION_LOOKBACK_HOURS,
      DEFAULT_LOOKBACK_HOURS,
      'CROSS_DB_RECONCILIATION_LOOKBACK_HOURS',
    ),
    graceMs: parsePositiveInteger(
      process.env.CROSS_DB_RECONCILIATION_GRACE_MS,
      DEFAULT_GRACE_MS,
      'CROSS_DB_RECONCILIATION_GRACE_MS',
    ),
    transferLimit: parsePositiveInteger(
      process.env.CROSS_DB_RECONCILIATION_TRANSFER_LIMIT,
      DEFAULT_TRANSFER_LIMIT,
      'CROSS_DB_RECONCILIATION_TRANSFER_LIMIT',
    ),
    xrplLimit: parsePositiveInteger(
      process.env.CROSS_DB_RECONCILIATION_XRPL_LIMIT,
      DEFAULT_XRPL_LIMIT,
      'CROSS_DB_RECONCILIATION_XRPL_LIMIT',
    ),
    riskLimit: parsePositiveInteger(
      process.env.CROSS_DB_RECONCILIATION_RISK_LIMIT,
      DEFAULT_RISK_LIMIT,
      'CROSS_DB_RECONCILIATION_RISK_LIMIT',
    ),
  }
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function normalizeHash(value?: string | null): string | null {
  const normalized = value?.trim().toLowerCase()
  return normalized || null
}

function normalizeEvmAddress(value?: string | null): string | null {
  const normalized = value?.trim().toLowerCase()
  return normalized || null
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getContextString(value: unknown, key: string): string | null {
  if (!isObjectRecord(value)) return null
  const raw = value[key]
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

function getContextNumber(value: unknown, key: string): number | null {
  if (!isObjectRecord(value)) return null
  const raw = value[key]
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null
}

function buildTxKey(networkId: string, txHash: string) {
  return `${networkId}:${normalizeHash(txHash)}`
}

function buildResult(): CrossDbReconciliationResult {
  return {
    skipped: false,
    openedCount: 0,
    resolvedCount: 0,
    transfer: {
      checkedCount: 0,
      missingCount: 0,
      mismatchCount: 0,
    },
    xrpl: {
      checkedCount: 0,
      missingCount: 0,
      mismatchCount: 0,
    },
    risk: {
      checkedCount: 0,
      missingCount: 0,
      mismatchCount: 0,
    },
  }
}

function applyIssueState(result: CrossDbReconciliationResult, state: ReconciliationIssueState) {
  if (state === 'opened') {
    result.openedCount += 1
  } else if (state === 'resolved') {
    result.resolvedCount += 1
  }
}

async function setIssueState(input: {
  scope: ReconciliationIssueScope
  kind: ReconciliationIssueKind
  refId: string
  isOpen: boolean
  severity?: string
  traceId?: string | null
  summary?: string | null
  details?: Record<string, unknown> | null
}): Promise<ReconciliationIssueState> {
  if (!canUsePg()) return 'noop'

  const now = new Date()

  if (input.isOpen) {
    const existing = await prismaPg.reconciliationIssue.findUnique({
      where: {
        scope_kind_refId: {
          scope: input.scope,
          kind: input.kind,
          refId: input.refId,
        },
      },
      select: {
        status: true,
      },
    })

    await prismaPg.reconciliationIssue.upsert({
      where: {
        scope_kind_refId: {
          scope: input.scope,
          kind: input.kind,
          refId: input.refId,
        },
      },
      update: {
        status: 'open',
        severity: input.severity ?? 'high',
        traceId: input.traceId ?? null,
        summary: input.summary ?? null,
        details: input.details ? toJson(input.details) : Prisma.DbNull,
        lastSeenAt: now,
        resolvedAt: null,
      },
      create: {
        scope: input.scope,
        kind: input.kind,
        refId: input.refId,
        status: 'open',
        severity: input.severity ?? 'high',
        traceId: input.traceId ?? null,
        summary: input.summary ?? null,
        details: input.details ? toJson(input.details) : Prisma.DbNull,
        firstSeenAt: now,
        lastSeenAt: now,
        resolvedAt: null,
      },
    })

    return !existing || existing.status !== 'open' ? 'opened' : 'updated'
  }

  const resolved = await prismaPg.reconciliationIssue.updateMany({
    where: {
      scope: input.scope,
      kind: input.kind,
      refId: input.refId,
      status: 'open',
    },
    data: {
      status: 'resolved',
      lastSeenAt: now,
      resolvedAt: now,
    },
  })

  return resolved.count > 0 ? 'resolved' : 'noop'
}

async function findEvmChainTransactions(input: Array<{ networkId: string; txHash: string }>) {
  const uniqueKeys = Array.from(new Map(input.map((item) => [buildTxKey(item.networkId, item.txHash), item])).values())
  if (uniqueKeys.length === 0) {
    return []
  }

  return prismaCrdb.chainTransaction.findMany({
    where: {
      chainType: 'EVM',
      OR: uniqueKeys.map((item) => ({
        networkId: item.networkId,
        txHash: item.txHash,
      })),
    },
    select: {
      networkId: true,
      txHash: true,
      status: true,
      fromWalletId: true,
      toAddress: true,
      valueBaseUnits: true,
      nonce: true,
    },
  })
}

async function findXrplTransactions(input: {
  actionIds: string[]
  networkIdAndHash: Array<{ networkId: string; txHash: string }>
}) {
  const filters: Array<{
    actionId?: { in: string[] }
    networkId?: string
    txHash?: string
  }> = []
  if (input.actionIds.length > 0) {
    filters.push({
      actionId: {
        in: input.actionIds,
      },
    })
  }

  const uniquePairs = Array.from(
    new Map(input.networkIdAndHash.map((item) => [buildTxKey(item.networkId, item.txHash), item])).values(),
  )
  if (uniquePairs.length > 0) {
    filters.push(
      ...uniquePairs.map((item) => ({
        networkId: item.networkId,
        txHash: item.txHash,
      })),
    )
  }

  if (filters.length === 0) {
    return []
  }

  return prismaCrdb.xrplTransaction.findMany({
    where: {
      OR: filters,
    },
    select: {
      actionId: true,
      networkId: true,
      txHash: true,
      status: true,
      engineResult: true,
    },
  })
}

function expectedXrplTransactionStatus(status: string): 'submitted' | 'validated' | 'failed' | null {
  switch (status) {
    case 'submitted':
      return 'submitted'
    case 'validated':
      return 'validated'
    case 'failed':
      return 'failed'
    default:
      return null
  }
}

export async function reconcileWalletTransfers(
  input?: Partial<CrossDbReconciliationConfig>,
  result?: CrossDbReconciliationResult,
): Promise<ReconciliationBucketResult> {
  const config = {
    ...readCrossDbReconciliationConfig(),
    ...(input ?? {}),
  }
  const summary = result ?? buildResult()
  if (!canUsePg() || !canUseCrdb()) {
    return summary.transfer
  }
  const since = new Date(Date.now() - config.lookbackHours * 60 * 60 * 1000)

  const logs = await prismaPg.walletTransferLog.findMany({
    where: {
      updatedAt: {
        gte: since,
      },
    },
    orderBy: {
      updatedAt: 'desc',
    },
    take: config.transferLimit,
    select: {
      id: true,
      walletId: true,
      chainId: true,
      toAddress: true,
      amountWei: true,
      status: true,
      traceId: true,
      idempotencyKey: true,
      txHash: true,
      nonce: true,
      createdAt: true,
    },
  })

  const transferLogIds = logs.map((item) => item.id)
  const intents =
    transferLogIds.length > 0
      ? await prismaPg.walletSigningIntent.findMany({
          where: {
            transferLogId: {
              in: transferLogIds,
            },
          },
          orderBy: {
            updatedAt: 'desc',
          },
          select: {
            id: true,
            transferLogId: true,
            status: true,
            txHash: true,
          },
        })
      : []

  const latestIntentByTransferLogId = new Map<string, (typeof intents)[number]>()
  for (const intent of intents) {
    if (!intent.transferLogId || latestIntentByTransferLogId.has(intent.transferLogId)) continue
    latestIntentByTransferLogId.set(intent.transferLogId, intent)
  }

  const chainTransactions = await findEvmChainTransactions(
    logs
      .map((log) => {
        const txHash = normalizeHash(log.txHash) ?? normalizeHash(latestIntentByTransferLogId.get(log.id)?.txHash)
        if (!txHash) return null
        return {
          networkId: String(log.chainId),
          txHash,
        }
      })
      .filter((value): value is { networkId: string; txHash: string } => Boolean(value)),
  )

  const chainTransactionByKey = new Map(chainTransactions.map((item) => [buildTxKey(item.networkId, item.txHash), item]))

  for (const log of logs) {
    summary.transfer.checkedCount += 1

    const normalizedStatus = normalizeTransferWorkflowStatus(log.status)
    const intent = latestIntentByTransferLogId.get(log.id) ?? null
    const effectiveTxHash = normalizeHash(log.txHash) ?? normalizeHash(intent?.txHash)
    const shouldRequireChainTx =
      Date.now() - log.createdAt.getTime() >= config.graceMs &&
      (Boolean(effectiveTxHash) || TRANSFER_STATUSES_EXPECTING_CHAIN_TX.has(normalizedStatus))
    const chainTx = effectiveTxHash
      ? chainTransactionByKey.get(buildTxKey(String(log.chainId), effectiveTxHash)) ?? null
      : null

    const missingIssueOpen = shouldRequireChainTx && !chainTx
    const missingState = await setIssueState({
      scope: 'wallet_transfer_log',
      kind: 'MISSING_CHAIN_TRANSACTION',
      refId: log.id,
      isOpen: missingIssueOpen,
      traceId: log.traceId,
      summary: 'Wallet transfer log has no matching Cockroach chain transaction',
      details: missingIssueOpen
        ? {
            transferLogId: log.id,
            walletId: log.walletId,
            chainId: log.chainId,
            status: normalizedStatus,
            idempotencyKey: log.idempotencyKey,
            txHash: effectiveTxHash,
            signingIntentId: intent?.id ?? null,
            signingIntentStatus: intent?.status ?? null,
          }
        : null,
    })
    applyIssueState(summary, missingState)
    if (missingIssueOpen) {
      summary.transfer.missingCount += 1
    }

    let mismatchReasons: string[] = []
    if (chainTx) {
      if (chainTx.fromWalletId !== log.walletId) mismatchReasons.push('from_wallet_mismatch')
      if (normalizeEvmAddress(chainTx.toAddress) !== normalizeEvmAddress(log.toAddress)) {
        mismatchReasons.push('to_address_mismatch')
      }
      if (chainTx.valueBaseUnits !== log.amountWei) mismatchReasons.push('amount_mismatch')
      if (log.nonce?.trim() && chainTx.nonce?.trim() && log.nonce.trim() !== chainTx.nonce.trim()) {
        mismatchReasons.push('nonce_mismatch')
      }
      if (normalizedStatus !== chainTx.status) mismatchReasons.push('status_mismatch')
    }

    const mismatchOpen = mismatchReasons.length > 0
    const mismatchState = await setIssueState({
      scope: 'wallet_transfer_log',
      kind: 'CHAIN_TRANSACTION_MISMATCH',
      refId: log.id,
      isOpen: mismatchOpen,
      traceId: log.traceId,
      summary: 'Wallet transfer log diverged from Cockroach chain transaction state',
      details: mismatchOpen
        ? {
            transferLogId: log.id,
            walletId: log.walletId,
            chainId: log.chainId,
            idempotencyKey: log.idempotencyKey,
            txHash: effectiveTxHash,
            transferStatus: normalizedStatus,
            chainTransactionStatus: chainTx?.status ?? null,
            mismatchReasons,
          }
        : null,
    })
    applyIssueState(summary, mismatchState)
    if (mismatchOpen) {
      summary.transfer.mismatchCount += 1
    }
  }

  return summary.transfer
}

export async function reconcileXrplActions(
  input?: Partial<CrossDbReconciliationConfig>,
  result?: CrossDbReconciliationResult,
): Promise<ReconciliationBucketResult> {
  const config = {
    ...readCrossDbReconciliationConfig(),
    ...(input ?? {}),
  }
  const summary = result ?? buildResult()
  if (!canUsePg() || !canUseCrdb()) {
    return summary.xrpl
  }
  const since = new Date(Date.now() - config.lookbackHours * 60 * 60 * 1000)

  const actions = await prismaPg.xrplAction.findMany({
    where: {
      updatedAt: {
        gte: since,
      },
    },
    orderBy: {
      updatedAt: 'desc',
    },
    take: config.xrplLimit,
    select: {
      id: true,
      status: true,
      networkId: true,
      txHash: true,
      engineResult: true,
      traceId: true,
      createdAt: true,
    },
  })

  const transactions = await findXrplTransactions({
    actionIds: actions.map((item) => item.id),
    networkIdAndHash: actions
      .map((action) => {
        const txHash = normalizeHash(action.txHash)
        if (!txHash) return null
        return {
          networkId: action.networkId,
          txHash,
        }
      })
      .filter((value): value is { networkId: string; txHash: string } => Boolean(value)),
  })

  const txByActionId = new Map(
    transactions
      .filter((item): item is typeof item & { actionId: string } => Boolean(item.actionId))
      .map((item) => [item.actionId, item]),
  )
  const txByNetworkAndHash = new Map(transactions.map((item) => [buildTxKey(item.networkId, item.txHash), item]))

  for (const action of actions) {
    summary.xrpl.checkedCount += 1

    const normalizedTxHash = normalizeHash(action.txHash)
    const expectedStatus = expectedXrplTransactionStatus(action.status)
    const shouldRequireTransaction =
      Date.now() - action.createdAt.getTime() >= config.graceMs &&
      (Boolean(normalizedTxHash) || XRPL_ACTION_STATUSES_EXPECTING_TRANSACTION.has(action.status))
    const transaction =
      txByActionId.get(action.id) ??
      (normalizedTxHash ? txByNetworkAndHash.get(buildTxKey(action.networkId, normalizedTxHash)) ?? null : null)

    const missingIssueOpen = shouldRequireTransaction && !transaction
    const missingState = await setIssueState({
      scope: 'xrpl_action',
      kind: 'MISSING_XRPL_TRANSACTION',
      refId: action.id,
      isOpen: missingIssueOpen,
      traceId: action.traceId,
      summary: 'XRPL action has no matching Cockroach transaction',
      details: missingIssueOpen
        ? {
            actionId: action.id,
            networkId: action.networkId,
            status: action.status,
            txHash: normalizedTxHash,
          }
        : null,
    })
    applyIssueState(summary, missingState)
    if (missingIssueOpen) {
      summary.xrpl.missingCount += 1
    }

    const mismatchReasons: string[] = []
    if (transaction) {
      if (!normalizedTxHash) {
        mismatchReasons.push('tx_hash_missing_on_action')
      } else if (normalizeHash(transaction.txHash) !== normalizedTxHash) {
        mismatchReasons.push('tx_hash_mismatch')
      }
      if (expectedStatus === null) {
        mismatchReasons.push('unexpected_transaction_for_action_status')
      } else if (transaction.status !== expectedStatus) {
        mismatchReasons.push('status_mismatch')
      }
      if ((action.engineResult ?? null) !== (transaction.engineResult ?? null)) {
        mismatchReasons.push('engine_result_mismatch')
      }
    }

    const mismatchOpen = mismatchReasons.length > 0
    const mismatchState = await setIssueState({
      scope: 'xrpl_action',
      kind: 'XRPL_TRANSACTION_MISMATCH',
      refId: action.id,
      isOpen: mismatchOpen,
      traceId: action.traceId,
      summary: 'XRPL action diverged from Cockroach transaction state',
      details: mismatchOpen
        ? {
            actionId: action.id,
            networkId: action.networkId,
            actionStatus: action.status,
            transactionStatus: transaction?.status ?? null,
            actionTxHash: normalizedTxHash,
            transactionTxHash: transaction?.txHash ?? null,
            actionEngineResult: action.engineResult,
            transactionEngineResult: transaction?.engineResult ?? null,
            mismatchReasons,
          }
        : null,
    })
    applyIssueState(summary, mismatchState)
    if (mismatchOpen) {
      summary.xrpl.mismatchCount += 1
    }
  }

  return summary.xrpl
}

export async function reconcileSendRiskDecisions(
  input?: Partial<CrossDbReconciliationConfig>,
  result?: CrossDbReconciliationResult,
): Promise<ReconciliationBucketResult> {
  const config = {
    ...readCrossDbReconciliationConfig(),
    ...(input ?? {}),
  }
  const summary = result ?? buildResult()
  if (!canUsePg() || !canUseCrdb()) {
    return summary.risk
  }
  const since = new Date(Date.now() - config.lookbackHours * 60 * 60 * 1000)

  const decisions = await prismaPg.riskDecision.findMany({
    where: {
      action: 'wallet.send',
      createdAt: {
        gte: since,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: config.riskLimit,
    select: {
      id: true,
      walletId: true,
      userId: true,
      decision: true,
      context: true,
      createdAt: true,
    },
  })

  const sendDecisions = decisions.filter((decision) => getContextNumber(decision.context, 'chainId') !== XRPL_RISK_CHAIN_ID)
  const chainIdByIdempotencyKey = new Map<string, number>()
  for (const decision of sendDecisions) {
    const idempotencyKey = getContextString(decision.context, 'idempotencyKey')
    const chainId = getContextNumber(decision.context, 'chainId')
    if (!idempotencyKey || chainId === null || chainIdByIdempotencyKey.has(idempotencyKey)) continue
    chainIdByIdempotencyKey.set(idempotencyKey, chainId)
  }
  const idempotencyKeys = Array.from(
    new Set(
      sendDecisions
        .map((decision) => getContextString(decision.context, 'idempotencyKey'))
        .filter((value): value is string => Boolean(value)),
    ),
  )

  const transferLogs =
    idempotencyKeys.length > 0
      ? await prismaPg.walletTransferLog.findMany({
          where: {
            idempotencyKey: {
              in: idempotencyKeys,
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          select: {
            id: true,
            walletId: true,
            idempotencyKey: true,
            status: true,
            txHash: true,
            traceId: true,
            createdAt: true,
          },
        })
      : []

  const latestTransferLogByIdempotencyKey = new Map<string, (typeof transferLogs)[number]>()
  for (const transferLog of transferLogs) {
    if (latestTransferLogByIdempotencyKey.has(transferLog.idempotencyKey)) continue
    latestTransferLogByIdempotencyKey.set(transferLog.idempotencyKey, transferLog)
  }

  const chainTransactions = await findEvmChainTransactions(
    transferLogs
      .map((transferLog) => {
        const txHash = normalizeHash(transferLog.txHash)
        if (!txHash) return null
        const chainId = chainIdByIdempotencyKey.get(transferLog.idempotencyKey)
        if (!chainId) return null
        return {
          networkId: String(chainId),
          txHash,
        }
      })
      .filter((value): value is { networkId: string; txHash: string } => Boolean(value?.networkId && value.txHash)),
  )

  const chainTransactionByKey = new Map(chainTransactions.map((item) => [buildTxKey(item.networkId, item.txHash), item]))

  for (const decision of sendDecisions) {
    summary.risk.checkedCount += 1

    const ageMs = Date.now() - decision.createdAt.getTime()
    const idempotencyKey = getContextString(decision.context, 'idempotencyKey')
    const chainId = getContextNumber(decision.context, 'chainId')
    const transferLog = idempotencyKey ? latestTransferLogByIdempotencyKey.get(idempotencyKey) ?? null : null
    const chainTx =
      chainId && transferLog?.txHash
        ? chainTransactionByKey.get(buildTxKey(String(chainId), transferLog.txHash)) ?? null
        : null

    const missingIdempotencyIssueOpen = ageMs >= config.graceMs && !idempotencyKey
    const missingIdempotencyState = await setIssueState({
      scope: 'risk_decision',
      kind: 'RISK_DECISION_MISSING_IDEMPOTENCY_KEY',
      refId: decision.id,
      isOpen: missingIdempotencyIssueOpen,
      summary: 'Send risk decision is missing the idempotency key needed for reconciliation',
      details: missingIdempotencyIssueOpen
        ? {
            riskDecisionId: decision.id,
            walletId: decision.walletId,
            userId: decision.userId,
            decision: decision.decision,
          }
        : null,
    })
    applyIssueState(summary, missingIdempotencyState)
    if (missingIdempotencyIssueOpen) {
      summary.risk.missingCount += 1
    }

    const missingTransferIssueOpen = ageMs >= config.graceMs && Boolean(idempotencyKey) && !transferLog
    const missingTransferState = await setIssueState({
      scope: 'risk_decision',
      kind: 'RISK_DECISION_MISSING_TRANSFER_LOG',
      refId: decision.id,
      isOpen: missingTransferIssueOpen,
      summary: 'Send risk decision has no matching transfer log',
      details: missingTransferIssueOpen
        ? {
            riskDecisionId: decision.id,
            walletId: decision.walletId,
            userId: decision.userId,
            decision: decision.decision,
            idempotencyKey,
            chainId,
          }
        : null,
    })
    applyIssueState(summary, missingTransferState)
    if (missingTransferIssueOpen) {
      summary.risk.missingCount += 1
    }

    let mismatchReasons: string[] = []
    const normalizedTransferStatus = transferLog ? normalizeTransferWorkflowStatus(transferLog.status) : null
    if (transferLog) {
      if (decision.decision === 'allow') {
        if (normalizedTransferStatus === 'denied' || normalizedTransferStatus === 'review') {
          mismatchReasons.push('blocked_after_allow_decision')
        }
      } else if (normalizedTransferStatus !== decision.decision) {
        mismatchReasons.push('transfer_status_mismatch')
      }

      if (decision.decision !== 'allow' && chainTx) {
        mismatchReasons.push('chain_transaction_exists_for_blocked_decision')
      }
    }

    const mismatchOpen = mismatchReasons.length > 0
    const mismatchState = await setIssueState({
      scope: 'risk_decision',
      kind: 'RISK_DECISION_OUTCOME_MISMATCH',
      refId: decision.id,
      isOpen: mismatchOpen,
      traceId: transferLog?.traceId ?? null,
      summary: 'Send risk decision diverged from the observed transfer outcome',
      details: mismatchOpen
        ? {
            riskDecisionId: decision.id,
            decision: decision.decision,
            walletId: decision.walletId,
            userId: decision.userId,
            idempotencyKey,
            chainId,
            transferLogId: transferLog?.id ?? null,
            transferStatus: normalizedTransferStatus,
            txHash: transferLog?.txHash ?? null,
            chainTransactionStatus: chainTx?.status ?? null,
            mismatchReasons,
          }
        : null,
    })
    applyIssueState(summary, mismatchState)
    if (mismatchOpen) {
      summary.risk.mismatchCount += 1
    }
  }

  return summary.risk
}

export async function reconcileCrossDbState(
  input?: Partial<CrossDbReconciliationConfig>,
): Promise<CrossDbReconciliationResult> {
  const config = {
    ...readCrossDbReconciliationConfig(),
    ...(input ?? {}),
  }
  const result = buildResult()

  if (!canUsePg() || !canUseCrdb()) {
    result.skipped = true
    return result
  }

  await reconcileWalletTransfers(config, result)
  await reconcileXrplActions(config, result)
  await reconcileSendRiskDecisions(config, result)

  return result
}
