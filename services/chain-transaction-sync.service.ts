import { JsonRpcProvider, getAddress, keccak256, toUtf8Bytes } from 'ethers'
import { normalizeChainTransactionStatus } from '@/lib/chain-transactions'
import { prismaCrdb } from '@/lib/prisma-crdb'
import { logWarn } from '@/lib/security/logging'
import {
  replaceTransferAttemptsByTxHashes,
  updateTransferAttemptByTxHash,
} from '@/services/transfer-log.service'

const ERC20_OR_ERC721_TRANSFER_TOPIC = keccak256(toUtf8Bytes('Transfer(address,address,uint256)'))
const DROP_AFTER_MS = 10 * 60 * 1000

const globalForProviders = globalThis as unknown as {
  evmSyncProvider?: JsonRpcProvider
}

function getRpcUrl(): string | null {
  const rpcUrl = process.env.EVM_RPC_URL?.trim()
  if (!rpcUrl) return null
  if (process.env.NODE_ENV === 'production' && !rpcUrl.startsWith('https://')) {
    return null
  }
  return rpcUrl
}

function getSyncProvider(): JsonRpcProvider | null {
  const rpcUrl = getRpcUrl()
  if (!rpcUrl) return null

  if (!globalForProviders.evmSyncProvider) {
    globalForProviders.evmSyncProvider = new JsonRpcProvider(rpcUrl)
  }

  return globalForProviders.evmSyncProvider
}

function topicAddress(topic?: string | null): string | null {
  if (!topic || topic.length < 42) return null
  try {
    return getAddress(`0x${topic.slice(-40)}`)
  } catch {
    return null
  }
}

function bigintToString(value: bigint | null | undefined): string | null {
  if (value === null || value === undefined) return null
  return value.toString()
}

async function resolveConfirmedAt(provider: JsonRpcProvider, blockHash?: string | null): Promise<Date | null> {
  if (!blockHash) return null
  try {
    const block = await provider.getBlock(blockHash)
    if (!block) return null
    return new Date(Number(block.timestamp) * 1000)
  } catch (error) {
    logWarn('chain-tx-sync:block', error, { blockHash })
    return null
  }
}

async function persistTokenTransfers(params: {
  networkId: string
  txHash: string
  blockHeight: bigint | null
  blockHash: string | null
  confirmedAt: Date | null
  logs: ReadonlyArray<{
    address: string
    data: string
    topics: readonly string[]
    index?: number
    logIndex?: number
  }>
}) {
  const transfers = params.logs
    .filter((log) => log.topics[0] === ERC20_OR_ERC721_TRANSFER_TOPIC)
    .map((log) => {
      const fromAddress = topicAddress(log.topics[1])
      const toAddress = topicAddress(log.topics[2])
      if (!fromAddress || !toAddress) return null

      const tokenId =
        log.topics.length >= 4 && (!log.data || log.data === '0x') ? BigInt(log.topics[3]!).toString() : null
      const amountBaseUnits =
        tokenId === null && log.data && log.data !== '0x' ? BigInt(log.data).toString() : tokenId ? '1' : null
      const tokenStandard = tokenId ? 'ERC721' : amountBaseUnits ? 'ERC20' : null
      const logIndex = log.index ?? log.logIndex
      if (!Number.isInteger(logIndex)) return null
      const normalizedLogIndex = logIndex as number

      return {
        chainType: 'EVM' as const,
        networkId: params.networkId,
        txHash: params.txHash,
        logIndex: normalizedLogIndex,
        contractAddress: getAddress(log.address),
        tokenStandard,
        assetSymbol: null,
        amountBaseUnits,
        tokenId,
        fromAddress,
        toAddress,
      }
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value))

  if (transfers.length === 0) return

  const addresses = Array.from(new Set(transfers.flatMap((transfer) => [transfer.fromAddress, transfer.toAddress])))
  const walletRows = await prismaCrdb.wallet.findMany({
    where: { address: { in: addresses } },
    select: { id: true, address: true },
  })
  const walletByAddress = new Map(walletRows.map((row) => [row.address, row.id]))

  await prismaCrdb.$transaction(
    transfers.map((transfer) =>
      prismaCrdb.tokenTransfer.upsert({
        where: {
          chainType_networkId_txHash_logIndex: {
            chainType: transfer.chainType,
            networkId: transfer.networkId,
            txHash: transfer.txHash,
            logIndex: transfer.logIndex,
          },
        },
        update: {
          contractAddress: transfer.contractAddress,
          tokenStandard: transfer.tokenStandard,
          assetSymbol: transfer.assetSymbol,
          amountBaseUnits: transfer.amountBaseUnits,
          tokenId: transfer.tokenId,
          fromAddress: transfer.fromAddress,
          toAddress: transfer.toAddress,
          fromWalletId: walletByAddress.get(transfer.fromAddress) ?? null,
          toWalletId: walletByAddress.get(transfer.toAddress) ?? null,
          blockHeight: params.blockHeight,
          blockHash: params.blockHash,
          confirmedAt: params.confirmedAt,
        },
        create: {
          chainType: transfer.chainType,
          networkId: transfer.networkId,
          txHash: transfer.txHash,
          logIndex: transfer.logIndex,
          contractAddress: transfer.contractAddress,
          tokenStandard: transfer.tokenStandard,
          assetSymbol: transfer.assetSymbol,
          amountBaseUnits: transfer.amountBaseUnits,
          tokenId: transfer.tokenId,
          fromAddress: transfer.fromAddress,
          toAddress: transfer.toAddress,
          fromWalletId: walletByAddress.get(transfer.fromAddress) ?? null,
          toWalletId: walletByAddress.get(transfer.toAddress) ?? null,
          blockHeight: params.blockHeight,
          blockHash: params.blockHash,
          confirmedAt: params.confirmedAt,
        },
      }),
    ),
  )
}

async function syncRow(
  provider: JsonRpcProvider,
  row: {
    chainType: string
    networkId: string
    txHash: string
    status: string
    blockHash: string | null
    createdAt: Date
  },
) {
  const normalizedStatus = normalizeChainTransactionStatus(row.status)
  const receipt = await provider.getTransactionReceipt(row.txHash).catch((error) => {
    logWarn('chain-tx-sync:receipt', error, { txHash: row.txHash })
    return null
  })

  if (receipt) {
    const nextStatus = receipt.status === 1 ? 'confirmed' : 'failed'
    const blockHash = receipt.blockHash ?? null
    const blockHeight =
      receipt.blockNumber === null || receipt.blockNumber === undefined ? null : BigInt(receipt.blockNumber)
    const gasUsed = bigintToString(receipt.gasUsed ?? null)
    const confirmedAt = await resolveConfirmedAt(provider, blockHash)

    await prismaCrdb.chainTransaction.update({
      where: {
        chainType_networkId_txHash: {
          chainType: row.chainType,
          networkId: row.networkId,
          txHash: row.txHash,
        },
      },
      data: {
        status: nextStatus,
        blockHeight,
        blockHash,
        gasUsed,
        confirmedAt,
      },
    })

    await updateTransferAttemptByTxHash(row.txHash, {
      status: nextStatus,
      gasUsed,
      blockHeight,
      blockHash,
      confirmedAt,
    })

    if (nextStatus === 'confirmed') {
      await persistTokenTransfers({
        networkId: row.networkId,
        txHash: row.txHash,
        blockHeight,
        blockHash,
        confirmedAt,
        logs: receipt.logs.map((log) => ({
          address: log.address,
          data: log.data,
          topics: log.topics,
          index: 'index' in log ? log.index : undefined,
          logIndex: 'logIndex' in log ? (log as { logIndex?: number }).logIndex : undefined,
        })),
      })
    }

    return
  }

  if (normalizedStatus === 'confirmed' && row.blockHash) {
    const existingBlock = await provider.getBlock(row.blockHash).catch(() => null)
    if (!existingBlock) {
      await prismaCrdb.chainTransaction.update({
        where: {
          chainType_networkId_txHash: {
            chainType: row.chainType,
            networkId: row.networkId,
            txHash: row.txHash,
          },
        },
        data: {
          status: 'pending',
          blockHeight: null,
          blockHash: null,
          gasUsed: null,
          confirmedAt: null,
        },
      })

      await updateTransferAttemptByTxHash(row.txHash, {
        status: 'pending',
        blockHeight: null,
        blockHash: null,
        gasUsed: null,
        confirmedAt: null,
      })
      return
    }
  }

  const transaction = await provider.getTransaction(row.txHash).catch((error) => {
    logWarn('chain-tx-sync:transaction', error, { txHash: row.txHash })
    return null
  })

  if (transaction) {
    if (normalizedStatus !== 'pending') {
      await prismaCrdb.chainTransaction.update({
        where: {
          chainType_networkId_txHash: {
            chainType: row.chainType,
            networkId: row.networkId,
            txHash: row.txHash,
          },
        },
        data: {
          status: 'pending',
        },
      })

      await updateTransferAttemptByTxHash(row.txHash, {
        status: 'pending',
      })
    }
    return
  }

  if (Date.now() - row.createdAt.getTime() >= DROP_AFTER_MS && normalizedStatus !== 'dropped') {
    await prismaCrdb.chainTransaction.update({
      where: {
        chainType_networkId_txHash: {
          chainType: row.chainType,
          networkId: row.networkId,
          txHash: row.txHash,
        },
      },
      data: {
        status: 'dropped',
      },
    })

    await updateTransferAttemptByTxHash(row.txHash, {
      status: 'dropped',
    })
  }
}

export async function syncRecentEvmChainTransactions(params?: {
  walletId?: string
  networkId?: string | null
  txHash?: string | null
  limit?: number
}) {
  const provider = getSyncProvider()
  if (!provider) return

  const rows = await prismaCrdb.chainTransaction.findMany({
    where: {
      chainType: 'EVM',
      status: { in: ['broadcasted', 'pending', 'confirmed'] },
      ...(params?.walletId
        ? {
            OR: [{ fromWalletId: params.walletId }, { toWalletId: params.walletId }],
          }
        : {}),
      ...(params?.networkId ? { networkId: params.networkId } : {}),
      ...(params?.txHash ? { txHash: params.txHash } : {}),
    },
    select: {
      chainType: true,
      networkId: true,
      txHash: true,
      status: true,
      blockHash: true,
      createdAt: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: Math.min(Math.max(params?.limit ?? 20, 1), 50),
  })

  await Promise.allSettled(rows.map((row) => syncRow(provider, row)))
}

export async function markReplacedTransferAttempts(replacedTxHashes: string[], replacedByTxHash: string) {
  await replaceTransferAttemptsByTxHashes(replacedTxHashes, replacedByTxHash)
}
