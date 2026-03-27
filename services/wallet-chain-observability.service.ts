import {
  isEvmRpcChainMismatchError,
  isEvmRpcChainUnavailableError,
} from '@/lib/evm-rpc'
import { getErrorMessage } from '@/lib/security/errors'
import { logError, logWarn } from '@/lib/security/logging'
import { emitSecurityAlert, type SecurityAlertSeverity } from '@/services/security-alert.service'
import { recordTelemetryEvent } from '@/services/telemetry.service'

type WalletChainObservabilityScope =
  | 'wallet-send'
  | 'wallet-pqc-anchor'
  | 'wallet-signing-intent-worker'
  | 'broadcaster'
  | 'chain-tx-sync'

type WalletChainIssue =
  | 'rpc_unavailable'
  | 'chain_mismatch'
  | 'rpc_request_failed'
  | 'sync_failed'

type WalletChainScopeConfig = {
  sessionId: string
  path: string
  source: string
}

type WalletChainObservationInput = {
  scope: WalletChainObservabilityScope
  issue: WalletChainIssue
  chainId?: number | null
  networkId?: string | null
  traceId?: string | null
  requestId?: string | null
  correlationId?: string | null
  walletId?: string | null
  txHash?: string | null
  count?: number
  error?: unknown
  details?: Record<string, unknown>
}

const scopeConfigByScope: Record<WalletChainObservabilityScope, WalletChainScopeConfig> = {
  'wallet-send': {
    sessionId: 'server:wallet-send-route',
    path: '/api/wallet/send',
    source: 'api.wallet-send',
  },
  'wallet-pqc-anchor': {
    sessionId: 'server:wallet-pqc-anchor-route',
    path: '/api/wallet/[id]/pqc/anchor',
    source: 'api.wallet-pqc-anchor',
  },
  'wallet-signing-intent-worker': {
    sessionId: 'server:wallet-signing-intent-worker',
    path: '/internal/workers/wallet-signing-intent',
    source: 'worker.wallet-signing-intent',
  },
  broadcaster: {
    sessionId: 'server:wallet-broadcaster-worker',
    path: '/internal/workers/wallet-broadcaster',
    source: 'worker.wallet-broadcaster',
  },
  'chain-tx-sync': {
    sessionId: 'server:chain-tx-sync-worker',
    path: '/internal/workers/chain-tx-sync',
    source: 'worker.chain-tx-sync',
  },
}

const DEFAULT_SYNC_FAILURE_ALERT_MIN_COUNT = 1

function compactObject(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Record<string, unknown>
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw?.trim()) return fallback

  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback

  return Math.floor(parsed)
}

function parseChainId(networkId: string | null | undefined): number | null {
  if (!networkId?.trim()) return null

  const parsed = Number(networkId)
  if (!Number.isInteger(parsed) || parsed <= 0) return null

  return parsed
}

function resolveChainId(input: { chainId?: number | null; networkId?: string | null }) {
  return input.chainId ?? parseChainId(input.networkId)
}

function resolveDeviceId(input: { chainId?: number | null; networkId?: string | null }) {
  const chainId = resolveChainId(input)
  if (chainId !== null) {
    return `chain:${chainId.toString()}`
  }

  if (input.networkId?.trim()) {
    return `network:${input.networkId.trim()}`
  }

  return 'network:unknown'
}

function syncFailureAlertMinCount() {
  return envInt('CHAIN_TRANSACTION_SYNC_FAILURE_ALERT_MIN_COUNT', DEFAULT_SYNC_FAILURE_ALERT_MIN_COUNT)
}

function resolveAlertConfig(input: WalletChainObservationInput & { chainId: number | null }) {
  const chainLabel = input.chainId?.toString() ?? input.networkId ?? 'unknown'

  switch (input.issue) {
    case 'rpc_unavailable':
      return {
        ruleId: 'wallet.evm_rpc.unavailable',
        severity:
          input.scope === 'wallet-send' || input.scope === 'wallet-pqc-anchor' ? 'medium' : 'high',
        title: 'Configured EVM RPC chain is unavailable',
        description: `scope=${input.scope} chain=${chainLabel}`,
        fingerprint: `rpc-unavailable:${chainLabel}`,
        runbookHint:
          'Check EVM_RPC_URLS or EVM_RPC_URL for the requested chain, verify upstream RPC health, and confirm recent deploy config.',
      } satisfies {
        ruleId: string
        severity: SecurityAlertSeverity
        title: string
        description: string
        fingerprint: string
        runbookHint: string
      }
    case 'chain_mismatch': {
      const actualChainId =
        input.error && isEvmRpcChainMismatchError(input.error) ? input.error.actualChainId : null

      return {
        ruleId: 'wallet.evm_rpc.chain_mismatch',
        severity: 'high',
        title: 'Configured EVM RPC chain mismatch detected',
        description: `scope=${input.scope} requested=${chainLabel} actual=${actualChainId?.toString() ?? 'unknown'}`,
        fingerprint: `rpc-chain-mismatch:${chainLabel}:${actualChainId?.toString() ?? 'unknown'}`,
        runbookHint:
          'Check that each EVM_RPC_URLS key points to an RPC for the same chain, and remove stale single-RPC fallback settings.',
      } satisfies {
        ruleId: string
        severity: SecurityAlertSeverity
        title: string
        description: string
        fingerprint: string
        runbookHint: string
      }
    }
    case 'sync_failed':
      if ((input.count ?? 1) < syncFailureAlertMinCount()) {
        return null
      }

      return {
        ruleId: 'wallet.chain_transaction.sync_failures',
        severity: (input.count ?? 1) >= 3 ? 'high' : 'medium',
        title: 'EVM chain transaction sync failures detected',
        description: `chain=${chainLabel} failed=${(input.count ?? 1).toString()}`,
        fingerprint: `chain-tx-sync-failures:${chainLabel}`,
        runbookHint:
          'Inspect chain-tx-sync logs for sample tx hashes, validate RPC health for the affected chain, and replay the worker after the upstream issue is resolved.',
      } satisfies {
        ruleId: string
        severity: SecurityAlertSeverity
        title: string
        description: string
        fingerprint: string
        runbookHint: string
      }
    case 'rpc_request_failed':
      return null
  }
}

async function observeWalletChainIssue(input: WalletChainObservationInput) {
  const scopeConfig = scopeConfigByScope[input.scope]
  const chainId = resolveChainId(input)
  const count = input.count ?? 1
  const issueMessage = getErrorMessage(
    input.error,
    input.issue === 'sync_failed'
      ? 'EVM chain transaction sync failures detected'
      : input.issue === 'rpc_request_failed'
        ? 'Wallet chain RPC request failed'
        : input.issue === 'rpc_unavailable'
          ? 'Configured EVM RPC chain is unavailable'
          : 'Configured EVM RPC chain mismatch detected',
  )
  const actualChainId =
    input.error && isEvmRpcChainMismatchError(input.error) ? input.error.actualChainId : undefined
  const requestedChainId =
    input.error && isEvmRpcChainUnavailableError(input.error) ? input.error.requestedChainId : undefined
  const logScope = `${input.scope}:observability`
  const errorLike =
    input.error instanceof Error
      ? input.error
      : new Error(input.issue === 'sync_failed' ? `${issueMessage} (${count.toString()})` : issueMessage)
  const logDetails = compactObject({
    issue: input.issue,
    chainId,
    networkId: input.networkId ?? null,
    requestId: input.requestId ?? null,
    traceId: input.traceId ?? null,
    correlationId: input.correlationId ?? null,
    walletId: input.walletId ?? null,
    txHash: input.txHash ?? null,
    count,
    expectedChainId: chainId,
    requestedChainId,
    actualChainId,
    ...(input.details ?? {}),
  })

  if (input.issue === 'rpc_unavailable') {
    logWarn(logScope, errorLike, logDetails)
  } else {
    logError(logScope, errorLike, logDetails)
  }

  const telemetryPayload = compactObject({
    count,
    message: issueMessage,
    expectedChainId: chainId,
    requestedChainId,
    actualChainId,
    ...(input.details ?? {}),
  })

  const telemetryPromise = recordTelemetryEvent({
    event: input.issue === 'sync_failed' ? 'wallet_chain_sync_failure' : 'wallet_chain_rpc_issue',
    sessionId: scopeConfig.sessionId,
    deviceId: resolveDeviceId({ chainId, networkId: input.networkId }),
    traceId: input.traceId ?? null,
    path: scopeConfig.path,
    context: compactObject({
      scope: input.scope,
      issue: input.issue,
      chainId,
      networkId: input.networkId ?? null,
      walletId: input.walletId ?? null,
      requestId: input.requestId ?? null,
      correlationId: input.correlationId ?? null,
      txHash: input.txHash ?? null,
    }),
    payload: telemetryPayload,
  })

  const alertConfig = resolveAlertConfig({ ...input, chainId })
  const tasks: Promise<unknown>[] = [telemetryPromise]

  if (alertConfig) {
    tasks.push(
      emitSecurityAlert({
        ruleId: alertConfig.ruleId,
        source: scopeConfig.source,
        severity: alertConfig.severity,
        repetitive: true,
        title: alertConfig.title,
        description: alertConfig.description,
        fingerprint: alertConfig.fingerprint,
        runbookHint: alertConfig.runbookHint,
        context: compactObject({
          scope: input.scope,
          issue: input.issue,
          chainId,
          networkId: input.networkId ?? null,
          requestId: input.requestId ?? null,
          traceId: input.traceId ?? null,
          correlationId: input.correlationId ?? null,
          walletId: input.walletId ?? null,
          txHash: input.txHash ?? null,
          count,
          expectedChainId: chainId,
          requestedChainId,
          actualChainId,
          ...(input.details ?? {}),
        }),
      }),
    )
  }

  const results = await Promise.allSettled(tasks)
  for (const result of results) {
    if (result.status === 'fulfilled') continue
    logError('wallet-chain-observability', result.reason, {
      scope: input.scope,
      issue: input.issue,
      chainId,
      networkId: input.networkId ?? null,
    })
  }
}

export async function observeWalletChainRpcIssue(input: {
  scope: WalletChainObservabilityScope
  chainId?: number | null
  networkId?: string | null
  traceId?: string | null
  requestId?: string | null
  correlationId?: string | null
  walletId?: string | null
  txHash?: string | null
  error: unknown
  details?: Record<string, unknown>
}) {
  const issue: WalletChainIssue = isEvmRpcChainUnavailableError(input.error)
    ? 'rpc_unavailable'
    : isEvmRpcChainMismatchError(input.error)
      ? 'chain_mismatch'
      : 'rpc_request_failed'

  await observeWalletChainIssue({
    ...input,
    issue,
  })
}

export async function observeWalletChainSyncFailures(input: {
  scope?: 'chain-tx-sync'
  chainId?: number | null
  networkId?: string | null
  traceId?: string | null
  requestId?: string | null
  correlationId?: string | null
  walletId?: string | null
  txHash?: string | null
  failedCount: number
  details?: Record<string, unknown>
  error?: unknown
}) {
  if (input.failedCount <= 0) return

  await observeWalletChainIssue({
    ...input,
    scope: input.scope ?? 'chain-tx-sync',
    issue: 'sync_failed',
    count: input.failedCount,
    error: input.error,
  })
}
