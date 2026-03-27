import { getAddress, keccak256, toUtf8Bytes, type JsonRpcProvider } from 'ethers'
import {
  getEvmTransactionFinality,
  normalizeChainTransactionStatus,
  SYNCABLE_CHAIN_TRANSACTION_STATUSES,
  type ChainTransactionStatus,
} from '@/lib/chain-transactions'
import { prismaCrdb } from '@/lib/prisma-crdb'
import { logWarn } from '@/lib/security/logging'
import {
  markNonceReservationConfirmedByTxHash,
  markNonceReservationFailedByTxHash,
  markNonceReservationsFailedByTxHashes,
  markNonceReservationSubmittedByTxHash,
} from '@/services/nonce-reservation.service'
import {
  markWalletSigningIntentConfirmedByTxHash,
  markWalletSigningIntentFailedByTxHash,
  reopenWalletSigningIntentByTxHash,
} from '@/services/signing-intent.service'
import {
  replaceTransferAttemptsByTxHashes,
  updateTransferAttemptByTxHash,
} from '@/services/transfer-log.service'
import { getEvmProviderForChain } from '@/lib/evm-rpc'
import { resolveWalletIdsByAddresses } from '@/services/wallet.service'

const ERC20_OR_ERC721_TRANSFER_TOPIC = keccak256(toUtf8Bytes('Transfer(address,address,uint256)'))
const DROP_AFTER_MS = 10 * 60 * 1000

function hasCanonicalInclusionStatus(status: ChainTransactionStatus): boolean {
  return status === 'included' || status === 'confirmed_soft' || status === 'confirmed_final'
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

function parseNetworkChainId(networkId: string): number | null {
  const parsed = Number(networkId)
  if (!Number.isInteger(parsed) || parsed <= 0) return null
  return parsed
}

async function clearIndexedEventData(input: {
  chainType: string
  networkId: string
  txHash: string
}) {
  await prismaCrdb.$transaction([
    prismaCrdb.tokenTransfer.deleteMany({
      where: {
        chainType: input.chainType,
        networkId: input.networkId,
        txHash: input.txHash,
      },
    }),
    prismaCrdb.chainLog.deleteMany({
      where: {
        chainType: input.chainType,
        networkId: input.networkId,
        txHash: input.txHash,
      },
    }),
  ])
}

async function clearIndexedReceiptData(input: {
  chainType: string
  networkId: string
  txHash: string
  status: 'reorged' | 'dropped'
}) {
  await prismaCrdb.$transaction([
    prismaCrdb.tokenTransfer.deleteMany({
      where: {
        chainType: input.chainType,
        networkId: input.networkId,
        txHash: input.txHash,
      },
    }),
    prismaCrdb.chainLog.deleteMany({
      where: {
        chainType: input.chainType,
        networkId: input.networkId,
        txHash: input.txHash,
      },
    }),
    prismaCrdb.chainIndexTransaction.updateMany({
      where: {
        chainType: input.chainType,
        networkId: input.networkId,
        txHash: input.txHash,
      },
      data: {
        blockHeight: null,
        blockHash: null,
        transactionIndex: null,
        status: input.status,
        effectiveGasPrice: null,
        gasUsed: null,
        confirmationCount: 0,
      },
    }),
  ])
}

async function readCanonicalBlock(
  provider: JsonRpcProvider,
  row: { txHash: string; blockHash: string | null; blockHeight: bigint | null },
) {
  if (row.blockHeight !== null) {
    return provider.getBlock(Number(row.blockHeight)).catch((error) => {
      logWarn('chain-tx-sync:block-height', error, {
        txHash: row.txHash,
        blockHeight: row.blockHeight?.toString() ?? null,
      })
      return null
    })
  }

  if (!row.blockHash) return null
  return provider.getBlock(row.blockHash).catch((error) => {
    logWarn('chain-tx-sync:block-hash', error, { txHash: row.txHash, blockHash: row.blockHash })
    return null
  })
}

async function upsertIndexedBlock(
  provider: JsonRpcProvider,
  input: { chainType: string; networkId: string; blockHash?: string | null; blockHeight?: bigint | null },
): Promise<Date | null> {
  if (!input.blockHash) return null
  try {
    const block = await provider.getBlock(input.blockHash)
    if (!block) return null
    const timestamp = new Date(Number(block.timestamp) * 1000)

    await prismaCrdb.chainBlock.upsert({
      where: {
        chainType_networkId_blockHash: {
          chainType: input.chainType,
          networkId: input.networkId,
          blockHash: input.blockHash,
        },
      },
      update: {
        blockHeight: input.blockHeight ?? BigInt(block.number),
        parentHash: block.parentHash ?? null,
        timestamp,
      },
      create: {
        chainType: input.chainType,
        networkId: input.networkId,
        blockHeight: input.blockHeight ?? BigInt(block.number),
        blockHash: input.blockHash,
        parentHash: block.parentHash ?? null,
        timestamp,
      },
    })

    return timestamp
  } catch (error) {
    logWarn('chain-tx-sync:block', error, { blockHash: input.blockHash })
    return null
  }
}

async function persistChainIndexData(params: {
  provider: JsonRpcProvider
  chainType: string
  networkId: string
  txHash: string
  status: 'included' | 'confirmed_soft' | 'confirmed_final' | 'failed'
  confirmationCount: number
  receipt: {
    blockHash: string | null
    blockNumber: number | null
    index?: number
    status?: number | null
    gasUsed?: bigint | null
    effectiveGasPrice?: bigint | null
    from?: string | null
    to?: string | null
    logs: ReadonlyArray<{
      address: string
      data: string
      topics: readonly string[]
      index?: number
      logIndex?: number
      removed?: boolean
    }>
  }
}) {
  const blockHeight =
    params.receipt.blockNumber === null || params.receipt.blockNumber === undefined
      ? null
      : BigInt(params.receipt.blockNumber)
  const confirmedAt = await upsertIndexedBlock(params.provider, {
    chainType: params.chainType,
    networkId: params.networkId,
    blockHash: params.receipt.blockHash,
    blockHeight,
  })

  const transaction = await params.provider.getTransaction(params.txHash).catch((error) => {
    logWarn('chain-tx-sync:index-transaction', error, { txHash: params.txHash })
    return null
  })

  await prismaCrdb.chainIndexTransaction.upsert({
    where: {
      chainType_networkId_txHash: {
        chainType: params.chainType,
        networkId: params.networkId,
        txHash: params.txHash,
      },
    },
    update: {
      blockHeight,
      blockHash: params.receipt.blockHash,
      transactionIndex:
        typeof params.receipt.index === 'number'
          ? params.receipt.index
          : typeof transaction?.index === 'number'
            ? transaction.index
            : null,
      status: params.status,
      fromAddress: transaction?.from ?? params.receipt.from ?? null,
      toAddress: transaction?.to ?? params.receipt.to ?? null,
      nonce: typeof transaction?.nonce === 'number' ? String(transaction.nonce) : null,
      valueBaseUnits: bigintToString(transaction?.value ?? null),
      gasLimit: bigintToString(transaction?.gasLimit ?? null),
      gasPrice: bigintToString(transaction?.gasPrice ?? null),
      effectiveGasPrice: bigintToString(params.receipt.effectiveGasPrice ?? null),
      gasUsed: bigintToString(params.receipt.gasUsed ?? null),
      confirmationCount: params.confirmationCount,
      data: transaction?.data ?? null,
    },
    create: {
      chainType: params.chainType,
      networkId: params.networkId,
      txHash: params.txHash,
      blockHeight,
      blockHash: params.receipt.blockHash,
      transactionIndex:
        typeof params.receipt.index === 'number'
          ? params.receipt.index
          : typeof transaction?.index === 'number'
            ? transaction.index
            : null,
      status: params.status,
      fromAddress: transaction?.from ?? params.receipt.from ?? null,
      toAddress: transaction?.to ?? params.receipt.to ?? null,
      nonce: typeof transaction?.nonce === 'number' ? String(transaction.nonce) : null,
      valueBaseUnits: bigintToString(transaction?.value ?? null),
      gasLimit: bigintToString(transaction?.gasLimit ?? null),
      gasPrice: bigintToString(transaction?.gasPrice ?? null),
      effectiveGasPrice: bigintToString(params.receipt.effectiveGasPrice ?? null),
      gasUsed: bigintToString(params.receipt.gasUsed ?? null),
      confirmationCount: params.confirmationCount,
      data: transaction?.data ?? null,
    },
  })

  if (params.receipt.logs.length > 0) {
    await prismaCrdb.$transaction(
      params.receipt.logs.flatMap((log) => {
        const logIndex = log.index ?? log.logIndex
        if (!Number.isInteger(logIndex)) return []

        return prismaCrdb.chainLog.upsert({
          where: {
            chainType_networkId_txHash_logIndex: {
              chainType: params.chainType,
              networkId: params.networkId,
              txHash: params.txHash,
              logIndex: logIndex as number,
            },
          },
          update: {
            blockHeight,
            blockHash: params.receipt.blockHash,
            contractAddress: getAddress(log.address),
            topic0: log.topics[0] ?? null,
            topic1: log.topics[1] ?? null,
            topic2: log.topics[2] ?? null,
            topic3: log.topics[3] ?? null,
            data: log.data ?? null,
            removed: Boolean(log.removed),
          },
          create: {
            chainType: params.chainType,
            networkId: params.networkId,
            txHash: params.txHash,
            logIndex: logIndex as number,
            blockHeight,
            blockHash: params.receipt.blockHash,
            contractAddress: getAddress(log.address),
            topic0: log.topics[0] ?? null,
            topic1: log.topics[1] ?? null,
            topic2: log.topics[2] ?? null,
            topic3: log.topics[3] ?? null,
            data: log.data ?? null,
            removed: Boolean(log.removed),
          },
        })
      }),
    )
  }

  return confirmedAt
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

  const walletByAddress = await resolveWalletIdsByAddresses({
    addresses: transfers.flatMap((transfer) => [transfer.fromAddress, transfer.toAddress]),
    chainType: 'EVM',
    networkId: params.networkId,
  })

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
    blockHeight: bigint | null
    createdAt: Date
  },
  currentBlockNumber: number,
) {
  let normalizedStatus = normalizeChainTransactionStatus(row.status)
  const receipt = await provider.getTransactionReceipt(row.txHash).catch((error) => {
    logWarn('chain-tx-sync:receipt', error, { txHash: row.txHash })
    return null
  })

  if (receipt) {
    const blockHash = receipt.blockHash ?? null
    const blockHeight =
      receipt.blockNumber === null || receipt.blockNumber === undefined ? null : BigInt(receipt.blockNumber)
    const successfulReceipt = receipt.status === 1
    const successfulFinality = successfulReceipt
      ? getEvmTransactionFinality({
          currentBlockNumber,
          includedBlockNumber: receipt.blockNumber ?? null,
        })
      : null
    const nextStatus: ChainTransactionStatus | 'failed' = successfulFinality
      ? successfulFinality.status
      : 'failed'
    const confirmationCount = successfulFinality ? successfulFinality.confirmationCount : 0

    if (hasCanonicalInclusionStatus(normalizedStatus) && row.blockHash && blockHash && row.blockHash !== blockHash) {
      logWarn(
        'chain-tx-sync:reorg',
        new Error('Confirmed transaction moved to a different canonical block'),
        {
          txHash: row.txHash,
          previousBlockHash: row.blockHash,
          nextBlockHash: blockHash,
          previousBlockHeight: row.blockHeight?.toString() ?? null,
          nextBlockHeight: blockHeight?.toString() ?? null,
        },
      )
      await clearIndexedEventData({
        chainType: row.chainType,
        networkId: row.networkId,
        txHash: row.txHash,
      })
    }
    const gasUsed = bigintToString(receipt.gasUsed ?? null)
    const confirmedAt = await persistChainIndexData({
      provider,
      chainType: row.chainType,
      networkId: row.networkId,
      txHash: row.txHash,
      status: nextStatus,
      confirmationCount,
      receipt: {
        blockHash,
        blockNumber: receipt.blockNumber ?? null,
        index: 'index' in receipt ? receipt.index : undefined,
        status: receipt.status ?? null,
        gasUsed: receipt.gasUsed ?? null,
        effectiveGasPrice:
          'effectiveGasPrice' in receipt
            ? ((receipt as { effectiveGasPrice?: bigint | null }).effectiveGasPrice ?? null)
            : null,
        from: 'from' in receipt ? receipt.from ?? null : null,
        to: 'to' in receipt ? receipt.to ?? null : null,
        logs: receipt.logs.map((log) => ({
          address: log.address,
          data: log.data,
          topics: log.topics,
          index: 'index' in log ? log.index : undefined,
          logIndex: 'logIndex' in log ? (log as { logIndex?: number }).logIndex : undefined,
          removed: 'removed' in log ? Boolean(log.removed) : false,
        })),
      },
    })

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
        confirmationCount,
      },
    })

    await updateTransferAttemptByTxHash(row.txHash, {
      status: nextStatus,
      gasUsed,
      blockHeight,
      blockHash,
      confirmedAt,
      confirmationCount,
    })
    if (nextStatus === 'confirmed_final') {
      await markNonceReservationConfirmedByTxHash(row.txHash)
      await markWalletSigningIntentConfirmedByTxHash(row.txHash)
    } else if (nextStatus === 'failed') {
      await markNonceReservationFailedByTxHash(row.txHash)
      await markWalletSigningIntentFailedByTxHash(row.txHash, {
        errorCode: 'CHAIN_EXECUTION_FAILED',
        errorDetails: {
          chainType: row.chainType,
          networkId: row.networkId,
          receiptStatus: receipt.status ?? null,
        },
      })
    } else {
      await markNonceReservationSubmittedByTxHash(row.txHash)
      await reopenWalletSigningIntentByTxHash(row.txHash)
    }

    if (nextStatus === 'confirmed_final') {
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

  if (hasCanonicalInclusionStatus(normalizedStatus) && (row.blockHash || row.blockHeight !== null)) {
    const canonicalBlock = await readCanonicalBlock(provider, row)
    if (canonicalBlock && (!row.blockHash || canonicalBlock.hash === row.blockHash)) {
      return
    }

    logWarn(
      'chain-tx-sync:reorg',
      new Error('Confirmed transaction is no longer on the canonical chain'),
      {
        txHash: row.txHash,
        previousBlockHash: row.blockHash,
        previousBlockHeight: row.blockHeight?.toString() ?? null,
        canonicalBlockHash: canonicalBlock?.hash ?? null,
      },
    )

    await clearIndexedReceiptData({
      chainType: row.chainType,
      networkId: row.networkId,
      txHash: row.txHash,
      status: 'reorged',
    })

    await prismaCrdb.chainTransaction.update({
      where: {
        chainType_networkId_txHash: {
          chainType: row.chainType,
          networkId: row.networkId,
          txHash: row.txHash,
        },
      },
      data: {
        status: 'reorged',
        blockHeight: null,
        blockHash: null,
        gasUsed: null,
        confirmedAt: null,
        confirmationCount: 0,
      },
    })

    await updateTransferAttemptByTxHash(row.txHash, {
      status: 'reorged',
      blockHeight: null,
      blockHash: null,
      gasUsed: null,
      confirmedAt: null,
      confirmationCount: 0,
    })
    await markNonceReservationSubmittedByTxHash(row.txHash)
    await reopenWalletSigningIntentByTxHash(row.txHash)
    normalizedStatus = 'reorged'
  }

  const transaction = await provider.getTransaction(row.txHash).catch((error) => {
    logWarn('chain-tx-sync:transaction', error, { txHash: row.txHash })
    return null
  })

  if (transaction) {
    if (normalizedStatus !== 'submitted' && normalizedStatus !== 'reorged') {
      await prismaCrdb.chainTransaction.update({
        where: {
          chainType_networkId_txHash: {
            chainType: row.chainType,
            networkId: row.networkId,
            txHash: row.txHash,
          },
        },
        data: {
          status: 'submitted',
          confirmationCount: 0,
        },
      })

      await updateTransferAttemptByTxHash(row.txHash, {
        status: 'submitted',
        confirmationCount: 0,
      })
      await markNonceReservationSubmittedByTxHash(row.txHash)
      await reopenWalletSigningIntentByTxHash(row.txHash)
    }
    return
  }

  if (Date.now() - row.createdAt.getTime() >= DROP_AFTER_MS && normalizedStatus !== 'dropped') {
    await clearIndexedReceiptData({
      chainType: row.chainType,
      networkId: row.networkId,
      txHash: row.txHash,
      status: 'dropped',
    })

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
        blockHeight: null,
        blockHash: null,
        gasUsed: null,
        confirmedAt: null,
        confirmationCount: 0,
      },
    })

    await updateTransferAttemptByTxHash(row.txHash, {
      status: 'dropped',
      blockHeight: null,
      blockHash: null,
      gasUsed: null,
      confirmedAt: null,
      confirmationCount: 0,
    })
    await markNonceReservationFailedByTxHash(row.txHash)
    await markWalletSigningIntentFailedByTxHash(row.txHash, {
      errorCode: 'TX_DROPPED',
      errorDetails: {
        chainType: row.chainType,
        networkId: row.networkId,
      },
    })
  }
}

export async function syncRecentEvmChainTransactions(params?: {
  walletId?: string
  networkId?: string | null
  txHash?: string | null
  limit?: number
}) {
  const rows = await prismaCrdb.chainTransaction.findMany({
    where: {
      chainType: 'EVM',
      status: { in: [...SYNCABLE_CHAIN_TRANSACTION_STATUSES] },
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
      blockHeight: true,
      createdAt: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: Math.min(Math.max(params?.limit ?? 20, 1), 50),
  })

  const rowsByNetworkId = new Map<string, typeof rows>()
  for (const row of rows) {
    const group = rowsByNetworkId.get(row.networkId) ?? []
    group.push(row)
    rowsByNetworkId.set(row.networkId, group)
  }

  let processedCount = 0
  let succeededCount = 0
  let failedCount = 0

  for (const [networkId, networkRows] of rowsByNetworkId) {
    const chainId = parseNetworkChainId(networkId)
    if (chainId === null) {
      logWarn('chain-tx-sync:network-id', new Error('Skipping EVM sync rows with invalid network id'), {
        networkId,
        rowCount: networkRows.length,
      })
      continue
    }

    let provider: JsonRpcProvider
    try {
      provider = await getEvmProviderForChain(chainId)
    } catch (error) {
      logWarn('chain-tx-sync:provider', error, {
        networkId,
        chainId,
        rowCount: networkRows.length,
      })
      continue
    }

    const currentBlockNumber = await provider.getBlockNumber().catch((error) => {
      logWarn('chain-tx-sync:block-number', error, { networkId, chainId })
      return null
    })
    if (currentBlockNumber === null) {
      continue
    }

    const results = await Promise.allSettled(
      networkRows.map((row) => syncRow(provider, row, currentBlockNumber)),
    )
    processedCount += networkRows.length
    succeededCount += results.filter((result) => result.status === 'fulfilled').length
    failedCount += results.filter((result) => result.status === 'rejected').length
  }

  return {
    processedCount,
    succeededCount,
    failedCount,
  }
}

export async function markReplacedTransferAttempts(replacedTxHashes: string[], replacedByTxHash: string) {
  await replaceTransferAttemptsByTxHashes(replacedTxHashes, replacedByTxHash)
  await markNonceReservationsFailedByTxHashes(replacedTxHashes)
}
