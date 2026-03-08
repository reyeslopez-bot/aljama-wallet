import type { Prisma } from '@/prisma/generated/prisma-crdb'
import { prismaCrdb } from '@/lib/prisma-crdb'
import { normalizeChainTransactionType } from '@/lib/chain-transactions'
import { logWarn } from '@/lib/security/logging'
import type { XrplSubmitResult } from '@/services/xrpl-tx-submit.service'
import { getBalanceChanges, getNFTokenID, parseNFTokenID, type TransactionMetadata } from 'xrpl'

type JsonObject = Record<string, unknown>

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeXrplStatus(input: {
  validated: boolean
  engineResult: string | null
}): 'submitted' | 'validated' | 'failed' {
  if (!input.validated) return 'submitted'
  if (input.engineResult && input.engineResult !== 'tesSUCCESS') return 'failed'
  return 'validated'
}

function parseBigInt(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(value)
  if (typeof value === 'string' && value.trim()) {
    try {
      return BigInt(value)
    } catch {
      return null
    }
  }
  return null
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function decodeHexUtf8(value?: string | null): string | null {
  if (!value?.trim()) return null
  const normalized = value.trim()
  if (!/^[0-9a-fA-F]+$/.test(normalized) || normalized.length % 2 !== 0) return normalized
  try {
    return Buffer.from(normalized, 'hex').toString('utf8')
  } catch {
    return normalized
  }
}

function extractResultEnvelope(result: XrplSubmitResult) {
  const raw = result.rawResult
    ? (((result.rawResult as unknown as { result?: Record<string, unknown> }).result ?? {}) as Record<string, unknown>)
    : ({} as Record<string, unknown>)
  const txJson = isJsonObject(raw.tx_json)
    ? (raw.tx_json as JsonObject)
    : isJsonObject(raw.tx)
      ? (raw.tx as JsonObject)
      : null
  const metaValue = raw.meta ?? raw.metadata
  const meta = isJsonObject(metaValue) ? (metaValue as unknown as TransactionMetadata) : null

  return {
    raw,
    txJson,
    meta,
  }
}

function inferXrplTxType(txType: string | null): ReturnType<typeof normalizeChainTransactionType> {
  switch (txType) {
    case 'TrustSet':
      return 'trustline_set'
    case 'NFTokenMint':
      return 'nft_mint'
    case 'OfferCreate':
      return 'offer_create'
    case 'OfferCancel':
      return 'offer_cancel'
    case 'NFTokenCreateOffer':
      return 'nft_offer_create'
    case 'NFTokenCancelOffer':
      return 'nft_offer_cancel'
    case 'NFTokenAcceptOffer':
      return 'nft_offer_accept'
    default:
      return normalizeChainTransactionType('contract_call')
  }
}

async function resolveWalletIds(addresses: string[]) {
  const uniqueAddresses = Array.from(new Set(addresses.map((value) => value.trim()).filter(Boolean)))
  if (uniqueAddresses.length === 0) {
    return new Map<string, string>()
  }

  const [walletRows, addressRows] = await Promise.all([
    prismaCrdb.wallet.findMany({
      where: { address: { in: uniqueAddresses } },
      select: { id: true, address: true },
    }),
    prismaCrdb.walletAddress.findMany({
      where: { address: { in: uniqueAddresses } },
      select: { walletId: true, address: true },
    }),
  ])

  const map = new Map<string, string>()
  for (const row of walletRows) map.set(row.address, row.id)
  for (const row of addressRows) {
    if (!map.has(row.address)) map.set(row.address, row.walletId)
  }
  return map
}

function buildLedgerEvents(input: {
  transactionId: string
  networkId: string
  txHash: string
  ledgerIndex: bigint | null
  meta: TransactionMetadata | null
  engineResult: string | null
}) {
  const events: Prisma.XrplLedgerEventCreateManyInput[] = [
    {
      transactionId: input.transactionId,
      networkId: input.networkId,
      txHash: input.txHash,
      ledgerIndex: input.ledgerIndex,
      eventType: 'transaction_result',
      objectType: null,
      objectId: null,
      payloadJson: toJson({ engineResult: input.engineResult }),
    },
  ]

  if (!input.meta) return events

  try {
    const balanceChanges = getBalanceChanges(input.meta)
    if (balanceChanges.length > 0) {
      events.push({
        transactionId: input.transactionId,
        networkId: input.networkId,
        txHash: input.txHash,
        ledgerIndex: input.ledgerIndex,
        eventType: 'balance_changes',
        objectType: 'BalanceChanges',
        objectId: null,
        payloadJson: toJson(balanceChanges),
      })
    }
  } catch (error) {
    logWarn('xrpl-transaction-store:balance-changes', error, { txHash: input.txHash })
  }

  for (const node of input.meta.AffectedNodes ?? []) {
    const entry =
      'CreatedNode' in node
        ? node.CreatedNode
        : 'ModifiedNode' in node
          ? node.ModifiedNode
          : 'DeletedNode' in node
            ? node.DeletedNode
            : null

    if (!entry) continue

    const eventType = 'CreatedNode' in node ? 'ledger_created' : 'ModifiedNode' in node ? 'ledger_modified' : 'ledger_deleted'
    const payload =
      'CreatedNode' in node
        ? node.CreatedNode
        : 'ModifiedNode' in node
          ? node.ModifiedNode
          : node.DeletedNode

    events.push({
      transactionId: input.transactionId,
      networkId: input.networkId,
      txHash: input.txHash,
      ledgerIndex: input.ledgerIndex,
      eventType,
      objectType: entry.LedgerEntryType ?? null,
      objectId: entry.LedgerIndex ?? null,
      payloadJson: toJson(payload),
    })
  }

  return events
}

async function persistTrustLine(input: {
  networkId: string
  txHash: string
  ledgerIndex: bigint | null
  account: string
  walletId: string | null
  txJson: JsonObject | null
}) {
  const limitAmount = isJsonObject(input.txJson?.LimitAmount) ? input.txJson.LimitAmount : null
  if (!limitAmount || typeof limitAmount.currency !== 'string' || typeof limitAmount.issuer !== 'string') return

  await prismaCrdb.xrplTrustLine.upsert({
    where: {
      networkId_account_issuer_currency: {
        networkId: input.networkId,
        account: input.account,
        issuer: limitAmount.issuer,
        currency: limitAmount.currency,
      },
    },
    update: {
      walletId: input.walletId,
      limit: typeof limitAmount.value === 'string' ? limitAmount.value : null,
      txHash: input.txHash,
      ledgerIndex: input.ledgerIndex,
    },
    create: {
      networkId: input.networkId,
      account: input.account,
      issuer: limitAmount.issuer,
      currency: limitAmount.currency,
      walletId: input.walletId,
      limit: typeof limitAmount.value === 'string' ? limitAmount.value : null,
      txHash: input.txHash,
      ledgerIndex: input.ledgerIndex,
    },
  })
}

async function persistMintedNft(input: {
  networkId: string
  txHash: string
  ledgerIndex: bigint | null
  account: string
  ownerWalletId: string | null
  txJson: JsonObject | null
  meta: TransactionMetadata | null
  confirmedAt: Date | null
}) {
  if (!input.meta) return

  let tokenId: string
  try {
    const resolvedTokenId = getNFTokenID(input.meta)
    if (!resolvedTokenId) return
    tokenId = resolvedTokenId
  } catch {
    return
  }

  const parsedToken = parseNFTokenID(tokenId)
  await prismaCrdb.xrplNftToken.upsert({
    where: {
      networkId_tokenId: {
        networkId: input.networkId,
        tokenId,
      },
    },
    update: {
      issuer: parsedToken.Issuer,
      owner: input.account,
      ownerWalletId: input.ownerWalletId,
      uri: decodeHexUtf8(typeof input.txJson?.URI === 'string' ? input.txJson.URI : null),
      flags: parseNumber(input.txJson?.Flags) ?? parsedToken.Flags,
      taxon: parseNumber(input.txJson?.NFTokenTaxon) ?? parsedToken.Taxon,
      transferFee: parseNumber(input.txJson?.TransferFee) ?? parsedToken.TransferFee,
      txHash: input.txHash,
      ledgerIndex: input.ledgerIndex,
      mintedAt: input.confirmedAt,
    },
    create: {
      networkId: input.networkId,
      tokenId,
      issuer: parsedToken.Issuer,
      owner: input.account,
      ownerWalletId: input.ownerWalletId,
      uri: decodeHexUtf8(typeof input.txJson?.URI === 'string' ? input.txJson.URI : null),
      flags: parseNumber(input.txJson?.Flags) ?? parsedToken.Flags,
      taxon: parseNumber(input.txJson?.NFTokenTaxon) ?? parsedToken.Taxon,
      transferFee: parseNumber(input.txJson?.TransferFee) ?? parsedToken.TransferFee,
      txHash: input.txHash,
      ledgerIndex: input.ledgerIndex,
      mintedAt: input.confirmedAt,
    },
  })
}

export async function recordXrplTransactionSubmission(input: {
  actionId?: string | null
  result: XrplSubmitResult
}) {
  if (!input.result.rawResult) return null

  const { raw, txJson, meta } = extractResultEnvelope(input.result)
  const txTypeRaw = typeof txJson?.TransactionType === 'string' ? txJson.TransactionType : null
  const normalizedTxType = inferXrplTxType(txTypeRaw)
  const account = typeof txJson?.Account === 'string' ? txJson.Account : input.result.account
  const destination =
    typeof txJson?.Destination === 'string'
      ? txJson.Destination
      : typeof txJson?.Issuer === 'string'
        ? txJson.Issuer
        : null
  const feeDrops = typeof txJson?.Fee === 'string' ? txJson.Fee : null
  const ledgerHash = typeof raw.ledger_hash === 'string' ? raw.ledger_hash : null
  const ledgerIndex = input.result.ledgerIndex === null ? parseBigInt(raw.ledger_index) : BigInt(input.result.ledgerIndex)
  const status = normalizeXrplStatus({
    validated: input.result.validated,
    engineResult: input.result.engineResult,
  })
  const confirmedAt = input.result.validated ? new Date() : null
  const walletIdByAddress = await resolveWalletIds([account, destination ?? ''])
  const fromWalletId = walletIdByAddress.get(account) ?? null
  const toWalletId = destination ? walletIdByAddress.get(destination) ?? null : null

  const transaction = await prismaCrdb.xrplTransaction.upsert({
    where: {
      networkId_txHash: {
        networkId: input.result.networkId,
        txHash: input.result.txHash,
      },
    },
    update: {
      txType: normalizedTxType,
      status,
      engineResult: input.result.engineResult,
      ledgerIndex,
      ledgerHash,
      sequence: input.result.sequence,
      feeDrops,
      account,
      destination,
      actionId: input.actionId?.trim() || null,
      memosJson: toJson(txJson?.Memos),
      rawTransaction: toJson(txJson),
      rawResult: toJson(raw),
      confirmedAt,
      fromWalletId,
      toWalletId,
    },
    create: {
      networkId: input.result.networkId,
      txHash: input.result.txHash,
      txType: normalizedTxType,
      status,
      engineResult: input.result.engineResult,
      ledgerIndex,
      ledgerHash,
      sequence: input.result.sequence,
      feeDrops,
      account,
      destination,
      actionId: input.actionId?.trim() || null,
      memosJson: toJson(txJson?.Memos),
      rawTransaction: toJson(txJson),
      rawResult: toJson(raw),
      confirmedAt,
      fromWalletId,
      toWalletId,
    },
  })

  await prismaCrdb.xrplLedgerEvent.deleteMany({
    where: { transactionId: transaction.id },
  })

  const events = buildLedgerEvents({
    transactionId: transaction.id,
    networkId: input.result.networkId,
    txHash: input.result.txHash,
    ledgerIndex,
    meta,
    engineResult: input.result.engineResult,
  })

  if (events.length > 0) {
    await prismaCrdb.xrplLedgerEvent.createMany({
      data: events,
    })
  }

  if (txTypeRaw === 'TrustSet') {
    await persistTrustLine({
      networkId: input.result.networkId,
      txHash: input.result.txHash,
      ledgerIndex,
      account,
      walletId: fromWalletId,
      txJson,
    })
  }

  if (txTypeRaw === 'NFTokenMint') {
    await persistMintedNft({
      networkId: input.result.networkId,
      txHash: input.result.txHash,
      ledgerIndex,
      account,
      ownerWalletId: fromWalletId,
      txJson,
      meta,
      confirmedAt,
    })
  }

  return {
    id: transaction.id,
    txHash: transaction.txHash,
    txType: normalizedTxType,
    status,
  }
}
