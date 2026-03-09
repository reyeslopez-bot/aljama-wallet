import { JsonRpcProvider, getAddress, keccak256, toUtf8Bytes } from 'ethers'
import { normalizeChainTransactionStatus } from '@/lib/chain-transactions'
import { prismaCrdb } from '@/lib/prisma-crdb'
import { logWarn } from '@/lib/security/logging'
import {
  replaceTransferAttemptsByTxHashes,
  updateTransferAttemptByTxHash,
} from '@/services/transfer-log.service'
import { resolveWalletIdsByAddresses } from '@/services/wallet.service'

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
  status: 'pending' | 'dropped'
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
      status:
        params.receipt.status === null || params.receipt.status === undefined
          ? null
          : params.receipt.status === 1
            ? 'confirmed'
            : 'failed',
      fromAddress: transaction?.from ?? params.receipt.from ?? null,
      toAddress: transaction?.to ?? params.receipt.to ?? null,
      nonce: typeof transaction?.nonce === 'number' ? String(transaction.nonce) : null,
      valueBaseUnits: bigintToString(transaction?.value ?? null),
      gasLimit: bigintToString(transaction?.gasLimit ?? null),
      gasPrice: bigintToString(transaction?.gasPrice ?? null),
      effectiveGasPrice: bigintToString(params.receipt.effectiveGasPrice ?? null),
      gasUsed: bigintToString(params.receipt.gasUsed ?? null),
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
      status:
        params.receipt.status === null || params.receipt.status === undefined
          ? null
          : params.receipt.status === 1
            ? 'confirmed'
            : 'failed',
      fromAddress: transaction?.from ?? params.receipt.from ?? null,
      toAddress: transaction?.to ?? params.receipt.to ?? null,
      nonce: typeof transaction?.nonce === 'number' ? String(transaction.nonce) : null,
      valueBaseUnits: bigintToString(transaction?.value ?? null),
      gasLimit: bigintToString(transaction?.gasLimit ?? null),
      gasPrice: bigintToString(transaction?.gasPrice ?? null),
      effectiveGasPrice: bigintToString(params.receipt.effectiveGasPrice ?? null),
      gasUsed: bigintToString(params.receipt.gasUsed ?? null),
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
) {
  let normalizedStatus = normalizeChainTransactionStatus(row.status)
  const receipt = await provider.getTransactionReceipt(row.txHash).catch((error) => {
    logWarn('chain-tx-sync:receipt', error, { txHash: row.txHash })
    return null
  })

  if (receipt) {
    const nextStatus = receipt.status === 1 ? 'confirmed' : 'failed'
    const blockHash = receipt.blockHash ?? null
    const blockHeight =
      receipt.blockNumber === null || receipt.blockNumber === undefined ? null : BigInt(receipt.blockNumber)
    if (normalizedStatus === 'confirmed' && row.blockHash && blockHash && row.blockHash !== blockHash) {
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

  if (normalizedStatus === 'confirmed' && (row.blockHash || row.blockHeight !== null)) {
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
      status: 'pending',
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
    normalizedStatus = 'pending'
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
  if (!provider) {
    return {
      processedCount: 0,
      succeededCount: 0,
      failedCount: 0,
    }
  }

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
      blockHeight: true,
      createdAt: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: Math.min(Math.max(params?.limit ?? 20, 1), 50),
  })

  const results = await Promise.allSettled(rows.map((row) => syncRow(provider, row)))

  return {
    processedCount: rows.length,
    succeededCount: results.filter((result) => result.status === 'fulfilled').length,
    failedCount: results.filter((result) => result.status === 'rejected').length,
  }
}

export async function markReplacedTransferAttempts(replacedTxHashes: string[], replacedByTxHash: string) {
  await replaceTransferAttemptsByTxHashes(replacedTxHashes, replacedByTxHash)
}
