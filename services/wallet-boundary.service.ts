import { prismaCrdb } from '@/lib/prisma-crdb'
import { logWarn } from '@/lib/security/logging'
import { getXrplClient } from '@/infra/xrpl/client'
import { userOwnsWallet } from '@/services/wallet-ownership.service'
import { getWalletById } from '@/services/wallet.service'
import {
  countTransferAttempts,
  getLatestTransferAttempt,
  getTransferLogAuthority,
  listTransferAttempts,
} from '@/services/transfer-log.service'
import type {
  WalletReconciliation,
  WalletSnapshot,
  WalletTransactionItem,
  WalletTransactionStatus,
  WalletTransactionsPage,
} from '@/types/wallet-api'

const XRPL_ADDRESS_PATTERN = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/

export class WalletBoundaryError extends Error {
  constructor(public readonly code: 'FORBIDDEN' | 'NOT_FOUND') {
    super(code)
  }
}

function clampLimit(limit: number): number {
  return Math.min(Math.max(limit, 1), 100)
}

function parseChainId(blockchain: string): number | null {
  const parsed = Number(blockchain)
  if (!Number.isInteger(parsed) || parsed <= 0) return null
  return parsed
}

function parseRecordedChainId(chainType: string, networkId: string): number | null {
  if (chainType !== 'EVM') return null
  return parseChainId(networkId)
}

function normalizeWalletTransactionStatus(status: string): WalletTransactionStatus {
  switch (status) {
    case 'initiated':
    case 'approved':
    case 'broadcast':
    case 'failed':
    case 'denied':
    case 'review':
    case 'settled':
      return status
    case 'validated':
      return 'settled'
    default:
      return 'broadcast'
  }
}

function latestTimestamp(...values: Array<Date | null | undefined>): string | null {
  const latest = values
    .filter((value): value is Date => value instanceof Date)
    .sort((a, b) => b.getTime() - a.getTime())[0]

  return latest ? latest.toISOString() : null
}

function parseNumeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

async function readXrplReconciliation(address: string): Promise<WalletReconciliation> {
  const checkedAt = new Date().toISOString()

  if (!XRPL_ADDRESS_PATTERN.test(address)) {
    return {
      source: 'xrpl',
      status: 'not_applicable',
      checkedAt,
      ledgerIndex: null,
      ledgerHash: null,
    }
  }

  try {
    const client = await getXrplClient()
    const response = await client.request({
      command: 'account_info',
      account: address,
      ledger_index: 'validated',
    })

    const result = (response as { result?: Record<string, unknown> }).result ?? {}
    return {
      source: 'xrpl',
      status: 'synced',
      checkedAt,
      ledgerIndex: parseNumeric(result.ledger_index),
      ledgerHash: typeof result.ledger_hash === 'string' ? result.ledger_hash : null,
    }
  } catch (error) {
    logWarn('wallet-boundary:xrpl-reconciliation', error)
    return {
      source: 'xrpl',
      status: 'unknown',
      checkedAt,
      ledgerIndex: null,
      ledgerHash: null,
    }
  }
}

async function assertReadableWallet(input: {
  walletId: string
  userId: string
  isAdmin: boolean
}): Promise<{
  id: string
  address: string
  createdAt: Date
}> {
  if (!input.isAdmin) {
    const owns = await userOwnsWallet(input.userId, input.walletId)
    if (!owns) {
      throw new WalletBoundaryError('FORBIDDEN')
    }
  }

  const wallet = await getWalletById(input.walletId)
  if (!wallet) {
    throw new WalletBoundaryError('NOT_FOUND')
  }

  return {
    id: wallet.id,
    address: wallet.address,
    createdAt: wallet.createdAt,
  }
}

export async function getWalletSnapshotForUser(input: {
  walletId: string
  userId: string
  isAdmin: boolean
}): Promise<WalletSnapshot> {
  const wallet = await assertReadableWallet(input)
  const chainTransactionalWhere = {
    OR: [{ fromWalletId: wallet.id }, { toWalletId: wallet.id }],
  }
  const legacyTransactionalWhere = {
    OR: [{ fromWalletId: wallet.id }, { toWalletId: wallet.id }],
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [
    chainTransactionalTxCount,
    lastChainTransactional,
    legacyTransactionalTxCount,
    lastTransactional,
    transferAttemptCount24h,
    latestTransferAttempt,
    reconciliation,
  ] = await Promise.all([
    prismaCrdb.chainTransaction.count({ where: chainTransactionalWhere }),
    prismaCrdb.chainTransaction.findFirst({
      where: chainTransactionalWhere,
      select: { createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    prismaCrdb.transaction.count({ where: legacyTransactionalWhere }),
    prismaCrdb.transaction.findFirst({
      where: legacyTransactionalWhere,
      select: { createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    countTransferAttempts({ walletId: wallet.id, since }),
    getLatestTransferAttempt(wallet.id),
    readXrplReconciliation(wallet.address),
  ])

  const totalTransactionalTxCount = chainTransactionalTxCount + legacyTransactionalTxCount

  return {
    walletId: wallet.id,
    address: wallet.address,
    createdAt: wallet.createdAt.toISOString(),
    authorities: {
      transactional: 'cockroachdb',
      analytics: getTransferLogAuthority(),
      chain: 'xrpl',
    },
    summary: {
      transactionalTxCount: totalTransactionalTxCount,
      transferAttemptCount24h,
      lastTransactionalAt: latestTimestamp(lastChainTransactional?.createdAt, lastTransactional?.createdAt),
      lastTransferStatus: latestTransferAttempt?.status ?? null,
    },
    reconciliation,
    updatedAt: new Date().toISOString(),
  }
}

export async function getWalletTransactionsForUser(input: {
  walletId: string
  userId: string
  isAdmin: boolean
  limit?: number
  cursor?: Date | null
}): Promise<WalletTransactionsPage> {
  const wallet = await assertReadableWallet(input)
  const limit = clampLimit(input.limit ?? 25)
  const before = input.cursor ?? null

  const chainTransactionalWhere = {
    OR: [{ fromWalletId: wallet.id }, { toWalletId: wallet.id }],
    ...(before ? { createdAt: { lt: before } } : {}),
  }
  const legacyTransactionalWhere = {
    OR: [{ fromWalletId: wallet.id }, { toWalletId: wallet.id }],
    ...(before ? { createdAt: { lt: before } } : {}),
  }

  const [chainTransactionRows, legacyTransactionRows, transferAttempts] = await Promise.all([
    prismaCrdb.chainTransaction.findMany({
      where: chainTransactionalWhere,
      select: {
        id: true,
        chainType: true,
        networkId: true,
        txHash: true,
        status: true,
        asset: true,
        valueBaseUnits: true,
        createdAt: true,
        fromWalletId: true,
        toWalletId: true,
        fromAddress: true,
        toAddress: true,
        fromWallet: {
          select: { address: true },
        },
        toWallet: {
          select: { address: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit * 2,
    }),
    prismaCrdb.transaction.findMany({
      where: legacyTransactionalWhere,
      select: {
        id: true,
        blockchain: true,
        asset: true,
        valueWei: true,
        createdAt: true,
        fromWalletId: true,
        toWalletId: true,
        fromWallet: {
          select: { address: true },
        },
        toWallet: {
          select: { address: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit * 2,
    }),
    listTransferAttempts({
      walletId: wallet.id,
      limit: limit * 3,
      before,
    }),
  ])

  const chainTransactionItems: WalletTransactionItem[] = chainTransactionRows.map((row) => {
    const outgoing = row.fromWalletId === wallet.id
    return {
      id: `chain:${row.id}`,
      source: 'transactional',
      direction: outgoing ? 'outgoing' : 'incoming',
      amountWei: row.valueBaseUnits.toString(),
      asset: row.asset,
      chainId: parseRecordedChainId(row.chainType, row.networkId),
      status: normalizeWalletTransactionStatus(row.status),
      counterparty: outgoing ? row.toWallet?.address ?? row.toAddress : row.fromWallet.address,
      idempotencyKey: null,
      txHash: row.txHash,
      createdAt: row.createdAt.toISOString(),
    }
  })

  const legacyTransactionalItems: WalletTransactionItem[] = legacyTransactionRows.map((row) => {
    const outgoing = row.fromWalletId === wallet.id
    return {
      id: `legacy:${row.id}`,
      source: 'transactional',
      direction: outgoing ? 'outgoing' : 'incoming',
      amountWei: row.valueWei.toString(),
      asset: row.asset,
      chainId: parseChainId(row.blockchain),
      status: 'settled',
      counterparty: outgoing ? row.toWallet.address : row.fromWallet.address,
      idempotencyKey: null,
      txHash: null,
      createdAt: row.createdAt.toISOString(),
    }
  })

  const analyticsItems: WalletTransactionItem[] = transferAttempts.map((item) => ({
      id: `analytics:${item.id}`,
      source: 'analytics',
      direction: 'outgoing',
      amountWei: item.amountWei.toString(),
      asset: 'native',
      chainId: item.chainId,
      status: item.status,
      counterparty: item.toAddress,
      idempotencyKey: item.idempotencyKey,
      txHash: null,
      createdAt: new Date(item.createdAt).toISOString(),
    }))

  const items = [...chainTransactionItems, ...legacyTransactionalItems, ...analyticsItems]
    .sort((a, b) => {
      const aTime = Date.parse(a.createdAt)
      const bTime = Date.parse(b.createdAt)
      if (aTime === bTime) return a.id.localeCompare(b.id)
      return bTime - aTime
    })
    .slice(0, limit)

  const nextCursor = items.length === limit ? items[items.length - 1]?.createdAt ?? null : null

  return {
    walletId: wallet.id,
    items,
    nextCursor,
  }
}
