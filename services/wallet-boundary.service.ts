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
  const transactionalWhere = {
    OR: [{ fromWalletId: wallet.id }, { toWalletId: wallet.id }],
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [
    transactionalTxCount,
    lastTransactional,
    transferAttemptCount24h,
    latestTransferAttempt,
    reconciliation,
  ] = await Promise.all([
    prismaCrdb.transaction.count({ where: transactionalWhere }),
    prismaCrdb.transaction.findFirst({
      where: transactionalWhere,
      select: { createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    countTransferAttempts({ walletId: wallet.id, since }),
    getLatestTransferAttempt(wallet.id),
    readXrplReconciliation(wallet.address),
  ])

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
      transactionalTxCount,
      transferAttemptCount24h,
      lastTransactionalAt: lastTransactional?.createdAt.toISOString() ?? null,
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

  const transactionalWhere = {
    OR: [{ fromWalletId: wallet.id }, { toWalletId: wallet.id }],
    ...(before ? { createdAt: { lt: before } } : {}),
  }

  const [transactionRows, transferAttempts] = await Promise.all([
    prismaCrdb.transaction.findMany({
      where: transactionalWhere,
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
      limit: limit * 2,
      before,
    }),
  ])

  const transactionalItems: WalletTransactionItem[] = transactionRows.map((row) => {
    const outgoing = row.fromWalletId === wallet.id
    return {
      id: `crdb:${row.id}`,
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

  const items = [...transactionalItems, ...analyticsItems]
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
