import { normalizeChainTransactionType, normalizeTransferWorkflowStatus } from '@/lib/chain-transactions'
import { prismaCrdb } from '@/lib/prisma-crdb'
import { logWarn } from '@/lib/security/logging'
import { getXrplClient } from '@/infra/xrpl/client'
import { syncRecentEvmChainTransactions } from '@/services/chain-transaction-sync.service'
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

function parseRecordedChainId(chainType: string, networkId: string): number | null {
  if (chainType !== 'EVM') return null
  return parseChainId(networkId)
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
  chain: string
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
    chain: wallet.chain,
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
  if (wallet.chain === 'EVM') {
    await syncRecentEvmChainTransactions({ walletId: wallet.id, limit: 20 })
  }
  const chainTransactionalWhere = {
    OR: [{ fromWalletId: wallet.id }, { toWalletId: wallet.id }],
  }
  const internalOperationWhere = {
    OR: [{ fromWalletId: wallet.id }, { toWalletId: wallet.id }],
  }
  const xrplTransactionalWhere = {
    OR: [
      { fromWalletId: wallet.id },
      { toWalletId: wallet.id },
      { account: wallet.address },
      { destination: wallet.address },
    ],
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [
    chainTransactionalTxCount,
    lastChainTransactional,
    internalOperationCount,
    lastInternalOperation,
    xrplTransactionalCount,
    lastXrplTransactional,
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
    prismaCrdb.internalOperation.count({ where: internalOperationWhere }),
    prismaCrdb.internalOperation.findFirst({
      where: internalOperationWhere,
      select: { createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    prismaCrdb.xrplTransaction.count({ where: xrplTransactionalWhere }),
    prismaCrdb.xrplTransaction.findFirst({
      where: xrplTransactionalWhere,
      select: { createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    countTransferAttempts({ walletId: wallet.id, since }),
    getLatestTransferAttempt(wallet.id),
    readXrplReconciliation(wallet.address),
  ])

  const totalTransactionalTxCount = chainTransactionalTxCount + internalOperationCount + xrplTransactionalCount

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
      lastTransactionalAt: latestTimestamp(
        lastChainTransactional?.createdAt,
        lastInternalOperation?.createdAt,
        lastXrplTransactional?.createdAt,
      ),
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
  if (wallet.chain === 'EVM') {
    await syncRecentEvmChainTransactions({ walletId: wallet.id, limit: 25 })
  }
  const limit = clampLimit(input.limit ?? 25)
  const before = input.cursor ?? null

  const chainTransactionalWhere = {
    OR: [{ fromWalletId: wallet.id }, { toWalletId: wallet.id }],
    ...(before ? { createdAt: { lt: before } } : {}),
  }
  const internalOperationWhere = {
    OR: [{ fromWalletId: wallet.id }, { toWalletId: wallet.id }],
    ...(before ? { createdAt: { lt: before } } : {}),
  }
  const xrplTransactionalWhere = {
    OR: [
      { fromWalletId: wallet.id },
      { toWalletId: wallet.id },
      { account: wallet.address },
      { destination: wallet.address },
    ],
    ...(before ? { createdAt: { lt: before } } : {}),
  }

  const [chainTransactionRows, tokenTransferRows, internalOperationRows, xrplTransactionRows, transferAttempts] =
    await Promise.all([
    prismaCrdb.chainTransaction.findMany({
      where: chainTransactionalWhere,
      select: {
        id: true,
        chainType: true,
        networkId: true,
        txHash: true,
        nonce: true,
        replacesTxHash: true,
        replacedByTxHash: true,
        status: true,
        txType: true,
        asset: true,
        valueBaseUnits: true,
        gasLimit: true,
        gasPrice: true,
        maxFeePerGas: true,
        maxPriorityFeePerGas: true,
        gasUsed: true,
        createdAt: true,
        confirmedAt: true,
        blockHeight: true,
        blockHash: true,
        fromWalletId: true,
        toWalletId: true,
        fromAddress: true,
        toAddress: true,
        data: true,
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
    prismaCrdb.tokenTransfer.findMany({
      where: {
        OR: [{ fromWalletId: wallet.id }, { toWalletId: wallet.id }],
        ...(before ? { createdAt: { lt: before } } : {}),
      },
      select: {
        id: true,
        networkId: true,
        txHash: true,
        contractAddress: true,
        tokenStandard: true,
        assetSymbol: true,
        amountBaseUnits: true,
        tokenId: true,
        fromWalletId: true,
        toWalletId: true,
        fromAddress: true,
        toAddress: true,
        blockHeight: true,
        blockHash: true,
        confirmedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit * 2,
    }),
    prismaCrdb.internalOperation.findMany({
      where: internalOperationWhere,
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
    prismaCrdb.xrplTransaction.findMany({
      where: xrplTransactionalWhere,
      select: {
        id: true,
        networkId: true,
        txHash: true,
        txType: true,
        status: true,
        engineResult: true,
        ledgerIndex: true,
        ledgerHash: true,
        sequence: true,
        feeDrops: true,
        account: true,
        destination: true,
        confirmedAt: true,
        createdAt: true,
        rawTransaction: true,
        fromWalletId: true,
        toWalletId: true,
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
      chainType: row.chainType,
      networkId: row.networkId,
      chainId: parseRecordedChainId(row.chainType, row.networkId),
      txType: normalizeChainTransactionType(row.txType),
      status: normalizeTransferWorkflowStatus(row.status),
      counterparty: outgoing ? row.toWallet?.address ?? row.toAddress : row.fromWallet.address,
      idempotencyKey: null,
      txHash: row.txHash,
      nonce: row.nonce,
      replacesTxHash: row.replacesTxHash,
      replacedByTxHash: row.replacedByTxHash,
      gasLimit: row.gasLimit,
      gasPrice: row.gasPrice,
      maxFeePerGas: row.maxFeePerGas,
      maxPriorityFeePerGas: row.maxPriorityFeePerGas,
      gasUsed: row.gasUsed,
      blockHeight: row.blockHeight?.toString() ?? null,
      blockHash: row.blockHash,
      contractAddress: null,
      tokenId: null,
      data: row.data,
      confirmedAt: row.confirmedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }
  })

  const indexedTokenTransferItems: WalletTransactionItem[] = tokenTransferRows.map((row) => {
    const outgoing = row.fromWalletId === wallet.id
    return {
      id: `token:${row.id}`,
      source: 'indexed',
      direction: outgoing ? 'outgoing' : 'incoming',
      amountWei: row.amountBaseUnits ?? '1',
      asset: row.assetSymbol ?? row.contractAddress,
      chainType: 'EVM',
      networkId: row.networkId,
      chainId: parseChainId(row.networkId),
      txType: 'token_transfer',
      status: row.confirmedAt ? 'confirmed' : 'pending',
      counterparty: outgoing ? row.toAddress : row.fromAddress,
      idempotencyKey: null,
      txHash: row.txHash,
      nonce: null,
      replacesTxHash: null,
      replacedByTxHash: null,
      gasLimit: null,
      gasPrice: null,
      maxFeePerGas: null,
      maxPriorityFeePerGas: null,
      gasUsed: null,
      blockHeight: row.blockHeight?.toString() ?? null,
      blockHash: row.blockHash,
      contractAddress: row.contractAddress,
      tokenId: row.tokenId,
      data: null,
      confirmedAt: row.confirmedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }
  })

  const internalOperationItems: WalletTransactionItem[] = internalOperationRows.map((row) => {
    const outgoing = row.fromWalletId === wallet.id
    return {
      id: `internal:${row.id}`,
      source: 'transactional',
      direction: outgoing ? 'outgoing' : 'incoming',
      amountWei: row.valueWei.toString(),
      asset: row.asset,
      chainType: 'EVM',
      networkId: row.blockchain,
      chainId: parseChainId(row.blockchain),
      txType: 'transfer',
      status: 'confirmed',
      counterparty: outgoing ? row.toWallet.address : row.fromWallet.address,
      idempotencyKey: null,
      txHash: null,
      nonce: null,
      replacesTxHash: null,
      replacedByTxHash: null,
      gasLimit: null,
      gasPrice: null,
      maxFeePerGas: null,
      maxPriorityFeePerGas: null,
      gasUsed: null,
      blockHeight: null,
      blockHash: null,
      contractAddress: null,
      tokenId: null,
      data: null,
      confirmedAt: null,
      createdAt: row.createdAt.toISOString(),
    }
  })

  const xrplTransactionItems: WalletTransactionItem[] = xrplTransactionRows.map((row) => {
    const outgoing = row.account === wallet.address || row.fromWalletId === wallet.id
    const rawTransaction =
      row.rawTransaction && typeof row.rawTransaction === 'object' && !Array.isArray(row.rawTransaction)
        ? (row.rawTransaction as Record<string, unknown>)
        : null
    const derivedAsset =
      row.txType === 'trustline_set' &&
      rawTransaction?.LimitAmount &&
      typeof rawTransaction.LimitAmount === 'object' &&
      rawTransaction.LimitAmount !== null &&
      'currency' in rawTransaction.LimitAmount &&
      typeof rawTransaction.LimitAmount.currency === 'string'
        ? rawTransaction.LimitAmount.currency
        : row.txType.startsWith('nft_') || row.txType === 'nft_mint'
          ? 'NFT'
          : 'XRP'

    return {
      id: `xrpl:${row.id}`,
      source: 'transactional',
      direction: outgoing ? 'outgoing' : 'incoming',
      amountWei:
        typeof rawTransaction?.Amount === 'string'
          ? rawTransaction.Amount
          : typeof row.feeDrops === 'string'
            ? row.feeDrops
            : '0',
      asset: derivedAsset,
      chainType: 'XRPL',
      networkId: row.networkId,
      chainId: null,
      txType: normalizeChainTransactionType(row.txType),
      status: normalizeTransferWorkflowStatus(row.status),
      counterparty: outgoing ? row.destination : row.account,
      idempotencyKey: null,
      txHash: row.txHash,
      nonce: row.sequence !== null ? String(row.sequence) : null,
      replacesTxHash: null,
      replacedByTxHash: null,
      gasLimit: null,
      gasPrice: row.feeDrops,
      maxFeePerGas: null,
      maxPriorityFeePerGas: null,
      gasUsed: null,
      blockHeight: row.ledgerIndex?.toString() ?? null,
      blockHash: row.ledgerHash,
      contractAddress: null,
      tokenId: null,
      data: null,
      confirmedAt: row.confirmedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }
  })

  const transactionalHashes = new Set(chainTransactionRows.map((row) => row.txHash))

  const analyticsItems: WalletTransactionItem[] = transferAttempts
    .filter((item) => !item.txHash || !transactionalHashes.has(item.txHash))
    .map((item) => ({
      id: `analytics:${item.id}`,
      source: 'analytics',
      direction: 'outgoing',
      amountWei: item.amountWei.toString(),
      asset: 'native',
      chainType: 'EVM',
      networkId: String(item.chainId),
      chainId: item.chainId,
      txType: item.txType ?? 'transfer',
      status: item.status,
      counterparty: item.toAddress,
      idempotencyKey: item.idempotencyKey,
      txHash: item.txHash ?? null,
      nonce: item.nonce ?? null,
      replacesTxHash: item.replacesTxHash ?? null,
      replacedByTxHash: item.replacedByTxHash ?? null,
      gasLimit: item.gasLimit ?? null,
      gasPrice: item.gasPrice ?? null,
      maxFeePerGas: item.maxFeePerGas ?? null,
      maxPriorityFeePerGas: item.maxPriorityFeePerGas ?? null,
      gasUsed: item.gasUsed ?? null,
      blockHeight: item.blockHeight?.toString() ?? null,
      blockHash: item.blockHash ?? null,
      contractAddress: null,
      tokenId: null,
      data: item.data ?? null,
      confirmedAt: item.confirmedAt ? new Date(item.confirmedAt).toISOString() : null,
      createdAt: new Date(item.createdAt).toISOString(),
    }))

  const items = [
    ...chainTransactionItems,
    ...indexedTokenTransferItems,
    ...internalOperationItems,
    ...xrplTransactionItems,
    ...analyticsItems,
  ]
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
