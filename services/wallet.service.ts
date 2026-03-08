import { getAddress } from 'ethers'
import type { ChainTransactionStatus, ChainTransactionType } from '@/lib/chain-transactions'
import {
  ACTIVE_SPEND_CHAIN_TRANSACTION_STATUSES,
  normalizeChainTransactionStatus,
  normalizeChainTransactionType,
} from '@/lib/chain-transactions'
import { Prisma } from '@/prisma/generated/prisma-crdb'
import { buildPqcBindingHashes } from '@/lib/pqc/commitment'
import { prismaCrdb } from '@/lib/prisma-crdb'
import { logWarn } from '@/lib/security/logging'
import { seedDefaultWalletPolicies } from '@/services/policy.service'
import {
  buildAccountRef,
  normalizeSignerBackend,
  normalizeSigningChain,
  normalizeSigningCurve,
  normalizeVaultScope,
  normalizeWalletAccountPolicy,
  parseWalletPqcBinding,
  type ResolvedSigningAccount,
  type SignerBackend,
  type SigningAccountRecord,
  type SigningChain,
  type SigningCurve,
  type VaultScope,
  type WalletAccountPolicy,
  type WalletPqcBinding,
} from '@/lib/signing/types'
import { incrementDailySummary } from '@/services/summary.service'

const WALLET_ADDRESS_ANY_NETWORK = '*'

function normalizeAddress(address: string): string {
  return getAddress(address.trim())
}

function normalizePubKey(value?: string | null): string | null {
  if (!value?.trim()) return null
  return value.trim()
}

function startOfDayUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function normalizeNullableString(value?: string | number | bigint | null): string | null {
  if (value === undefined || value === null) return null
  const normalized = String(value).trim()
  return normalized ? normalized : null
}

function mapWalletRecord(record: {
  id: string
  accountRef: string
  chain: string
  address: string
  pubKey: string | null
  keyType: string
  signerBackend: string
  vaultId: string
  derivationPath: string | null
  policy: unknown
  pqcBinding: unknown
  pqcBindingHash: string | null
  encryptedPrivateKey: Uint8Array | null
  encryptionIv: Uint8Array | null
  keyVersion: number | null
  createdAt: Date
}): SigningAccountRecord {
  return {
    id: record.id,
    accountRef: record.accountRef,
    chain: normalizeSigningChain(record.chain),
    address: record.address,
    pubKey: normalizePubKey(record.pubKey),
    keyType: normalizeSigningCurve(record.keyType),
    signerBackend: normalizeSignerBackend(record.signerBackend),
    vaultId: normalizeVaultScope(record.vaultId),
    derivationPath: record.derivationPath?.trim() || null,
    policy:
      record.policy && typeof record.policy === 'object'
        ? normalizeWalletAccountPolicy(record.policy as Partial<WalletAccountPolicy>)
        : normalizeWalletAccountPolicy(),
    pqcBinding: parseWalletPqcBinding(record.pqcBinding),
    pqcBindingHash: record.pqcBindingHash?.trim() || null,
    encryptedPrivateKey: record.encryptedPrivateKey ? new Uint8Array(record.encryptedPrivateKey) : null,
    encryptionIv: record.encryptionIv ? new Uint8Array(record.encryptionIv) : null,
    keyVersion: record.keyVersion ?? null,
    createdAt: record.createdAt,
  }
}

function withoutSignerMaterial(record: SigningAccountRecord): ResolvedSigningAccount {
  const { encryptedPrivateKey, encryptionIv, keyVersion, ...rest } = record
  void encryptedPrivateKey
  void encryptionIv
  void keyVersion
  return rest
}

async function selectWalletByUnique(
  where:
    | { id: string }
    | { accountRef: string }
    | { pqcBindingHash: string },
) {
  const record = await prismaCrdb.wallet.findUnique({
    where,
    select: {
      id: true,
      accountRef: true,
      chain: true,
      address: true,
      pubKey: true,
      keyType: true,
      signerBackend: true,
      vaultId: true,
      derivationPath: true,
      policy: true,
      pqcBinding: true,
      pqcBindingHash: true,
      encryptedPrivateKey: true,
      encryptionIv: true,
      keyVersion: true,
      createdAt: true,
    },
  })

  return record ? mapWalletRecord(record) : null
}

async function selectWalletByAddress(
  address: string,
  scope?: { chainType?: SigningChain; networkId?: string | null },
) {
  const normalizedAddress = normalizeAddress(address)
  const chainType = scope?.chainType ? normalizeSigningChain(scope.chainType) : undefined
  const networkId = scope?.networkId?.trim() || null

  const rows = await prismaCrdb.walletAddress.findMany({
    where: {
      address: normalizedAddress,
      ...(chainType ? { chainType } : {}),
      ...(networkId ? { networkId: { in: [networkId, WALLET_ADDRESS_ANY_NETWORK] } } : {}),
    },
    select: {
      networkId: true,
      wallet: {
        select: {
          id: true,
          accountRef: true,
          chain: true,
          address: true,
          pubKey: true,
          keyType: true,
          signerBackend: true,
          vaultId: true,
          derivationPath: true,
          policy: true,
          pqcBinding: true,
          pqcBindingHash: true,
          encryptedPrivateKey: true,
          encryptionIv: true,
          keyVersion: true,
          createdAt: true,
        },
      },
    },
  })

  const record = rows
    .sort((left, right) => {
      const leftSpecificity = left.networkId === networkId ? 1 : 0
      const rightSpecificity = right.networkId === networkId ? 1 : 0
      return rightSpecificity - leftSpecificity
    })[0]?.wallet

  if (record) return mapWalletRecord(record)

  return prismaCrdb.wallet
    .findUnique({
      where: { address: normalizedAddress },
      select: {
        id: true,
        accountRef: true,
        chain: true,
        address: true,
        pubKey: true,
        keyType: true,
        signerBackend: true,
        vaultId: true,
        derivationPath: true,
        policy: true,
        pqcBinding: true,
        pqcBindingHash: true,
        encryptedPrivateKey: true,
        encryptionIv: true,
        keyVersion: true,
        createdAt: true,
      },
    })
    .then((fallback) => (fallback ? mapWalletRecord(fallback) : null))
}

export type CreateWalletRecordInput = {
  address: string
  chain?: SigningChain
  networkId?: string | null
  pubKey?: string | null
  keyType?: SigningCurve
  signerBackend?: SignerBackend
  vaultId?: VaultScope
  derivationPath?: string | null
  policy?: Partial<WalletAccountPolicy>
  pqcBinding?: WalletPqcBinding | null
  pqcBindingHash?: string | null
  encryptedPrivateKey?: Uint8Array | Buffer | null
  encryptionIv?: Uint8Array | Buffer | null
  keyVersion?: number | null
}

export async function getWallets() {
  return prismaCrdb.wallet.findMany({
    select: {
      id: true,
      accountRef: true,
      chain: true,
      address: true,
      pubKey: true,
      keyType: true,
      signerBackend: true,
      vaultId: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getWalletsByIds(walletIds: string[]) {
  if (walletIds.length === 0) return []
  return prismaCrdb.wallet.findMany({
    where: { id: { in: walletIds } },
    select: {
      id: true,
      accountRef: true,
      chain: true,
      address: true,
      pubKey: true,
      keyType: true,
      signerBackend: true,
      vaultId: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getWalletById(walletId: string): Promise<SigningAccountRecord | null> {
  return selectWalletByUnique({ id: walletId })
}

export async function getWalletSigningAccount(walletId: string): Promise<ResolvedSigningAccount | null> {
  const wallet = await getWalletById(walletId)
  return wallet ? withoutSignerMaterial(wallet) : null
}

export async function deleteWalletRecord(walletId: string) {
  return prismaCrdb.wallet.delete({ where: { id: walletId } })
}

export async function getWalletByAddress(address: string): Promise<SigningAccountRecord | null> {
  return selectWalletByAddress(address)
}

export async function getWalletByChainAddress(input: {
  address: string
  chainType: SigningChain
  networkId?: string | null
}): Promise<SigningAccountRecord | null> {
  return selectWalletByAddress(input.address, input)
}

export async function getWalletByAccountRef(accountRef: string): Promise<SigningAccountRecord | null> {
  const normalized = accountRef.trim()
  if (!normalized) return null
  return selectWalletByUnique({ accountRef: normalized })
}

export async function getWalletByPqcBindingHash(
  pqcBindingHash: string,
): Promise<SigningAccountRecord | null> {
  const normalized = pqcBindingHash.trim()
  if (!normalized) return null
  return selectWalletByUnique({ pqcBindingHash: normalized })
}

export async function setWalletPqcBindingHash(walletId: string, pqcBindingHash: string) {
  return prismaCrdb.wallet.update({
    where: { id: walletId },
    data: { pqcBindingHash: pqcBindingHash.trim() },
    select: { id: true, pqcBindingHash: true },
  })
}

export async function createWalletRecord(input: CreateWalletRecordInput) {
  const chain = input.chain ?? 'EVM'
  const normalizedChain = normalizeSigningChain(chain)
  const normalizedNetworkId = input.networkId?.trim() || WALLET_ADDRESS_ANY_NETWORK
  const keyType = normalizeSigningCurve(input.keyType ?? (normalizedChain === 'XRPL' ? 'ed25519' : 'secp256k1'))
  const signerBackend = normalizeSignerBackend(input.signerBackend)
  const vaultId = normalizeVaultScope(input.vaultId)
  const address = normalizeAddress(input.address)
  const pubKey = normalizePubKey(input.pubKey)
  const pqcBinding = input.pqcBinding ?? null
  const pqcBindingHash =
    input.pqcBindingHash?.trim() ||
    (pqcBinding ? buildPqcBindingHashes(pqcBinding).bindingHash : null)

  if (
    signerBackend === 'local' &&
    (!input.encryptedPrivateKey || !input.encryptionIv || input.keyVersion === null || input.keyVersion === undefined)
  ) {
    throw new Error('encrypted signer material is required for local signer accounts')
  }

  // Guardrail: live EVM signing in this repo is classical secp256k1-only.
  if (normalizedChain === 'EVM' && keyType !== 'secp256k1') {
    throw new Error('unsupported EVM keyType; live EVM custody requires secp256k1')
  }

  if (normalizedChain === 'XRPL' && !pubKey) {
    throw new Error('pubKey is required for XRPL accounts')
  }

  const accountRef = buildAccountRef({
    chain: normalizedChain,
    keyType,
    pubKey,
    address,
  })

  return prismaCrdb.$transaction(async (tx) => {
    const record = await tx.wallet.create({
      data: {
        accountRef,
        chain: normalizedChain,
        address,
        pubKey,
        keyType,
        signerBackend,
        vaultId,
        derivationPath: input.derivationPath?.trim() || null,
        policy: normalizeWalletAccountPolicy(input.policy),
        pqcBinding: pqcBinding ?? Prisma.DbNull,
        pqcBindingHash,
        encryptedPrivateKey: input.encryptedPrivateKey ? Buffer.from(input.encryptedPrivateKey) : null,
        encryptionIv: input.encryptionIv ? Buffer.from(input.encryptionIv) : null,
        keyVersion: input.keyVersion ?? null,
      },
      select: {
        id: true,
        accountRef: true,
        chain: true,
        address: true,
        pubKey: true,
        keyType: true,
        signerBackend: true,
        vaultId: true,
        createdAt: true,
      },
    })

    await tx.walletAddress.upsert({
      where: {
        chainType_networkId_address: {
          chainType: normalizedChain,
          networkId: normalizedNetworkId,
          address,
        },
      },
      update: {
        walletId: record.id,
        publicKey: pubKey,
        derivationPath: input.derivationPath?.trim() || null,
      },
      create: {
        walletId: record.id,
        chainType: normalizedChain,
        networkId: normalizedNetworkId,
        address,
        publicKey: pubKey,
        derivationPath: input.derivationPath?.trim() || null,
      },
    })

    await seedDefaultWalletPolicies(tx, {
      walletId: record.id,
      chainType: normalizedChain,
      networkId: normalizedNetworkId,
    })

    return record
  })
}

export async function getSpentTodayWei(walletId: string, chainId: number) {
  const networkId = String(chainId)
  const since = startOfDayUtc(new Date())

  const [chainSpentToday, legacySpentToday] = await Promise.all([
    prismaCrdb.chainTransaction.aggregate({
      where: {
        fromWalletId: walletId,
        chainType: 'EVM',
        networkId,
        status: { in: [...ACTIVE_SPEND_CHAIN_TRANSACTION_STATUSES] },
        createdAt: { gte: since },
      },
      _sum: { valueBaseUnits: true },
    }),
    prismaCrdb.internalOperation.aggregate({
      where: { fromWalletId: walletId, blockchain: networkId, createdAt: { gte: since } },
      _sum: { valueWei: true },
    }),
  ])

  return ((chainSpentToday._sum?.valueBaseUnits ?? 0n) + (legacySpentToday._sum?.valueWei ?? 0n)) as bigint
}

export async function recordChainTransaction(params: {
  chainId: number
  txHash: string
  fromWalletId: string
  fromAddress: string
  toAddress: string
  toWalletId?: string | null
  valueBaseUnits: bigint
  asset?: string
  status?: ChainTransactionStatus
  txType?: ChainTransactionType
  nonce?: string | number | bigint | null
  gasLimit?: string | number | bigint | null
  gasPrice?: string | number | bigint | null
  maxFeePerGas?: string | number | bigint | null
  maxPriorityFeePerGas?: string | number | bigint | null
  gasUsed?: string | number | bigint | null
  blockHeight?: bigint | null
  blockHash?: string | null
  data?: string | null
  confirmedAt?: Date | null
}) {
  const networkId = String(params.chainId)
  const txHash = params.txHash.trim()
  const nonce = normalizeNullableString(params.nonce)
  const normalizedStatus = normalizeChainTransactionStatus(params.status ?? 'broadcasted')
  const normalizedTxType = normalizeChainTransactionType(params.txType ?? 'transfer')

  const result = await prismaCrdb.$transaction(async (tx) => {
    let replacedTxHashes: string[] = []

    if (nonce) {
      const replacedRows = await tx.chainTransaction.findMany({
        where: {
          fromWalletId: params.fromWalletId,
          chainType: 'EVM',
          networkId,
          nonce,
          txHash: { not: txHash },
          status: { in: ['broadcasted', 'pending', 'confirmed'] },
        },
        select: { txHash: true },
      })

      replacedTxHashes = replacedRows.map((row) => row.txHash)
      if (replacedTxHashes.length > 0) {
        await tx.chainTransaction.updateMany({
          where: {
            fromWalletId: params.fromWalletId,
            chainType: 'EVM',
            networkId,
            nonce,
            txHash: { in: replacedTxHashes },
          },
          data: {
            status: 'replaced',
            replacedByTxHash: txHash,
          },
        })
      }
    }

    const replacesTxHash = replacedTxHashes[0] ?? null

    const record = await tx.chainTransaction.create({
      data: {
        chainType: 'EVM',
        networkId,
        txHash,
        nonce,
        status: normalizedStatus,
        txType: normalizedTxType,
        asset: params.asset ?? 'native',
        valueBaseUnits: params.valueBaseUnits,
        gasLimit: normalizeNullableString(params.gasLimit),
        gasPrice: normalizeNullableString(params.gasPrice),
        maxFeePerGas: normalizeNullableString(params.maxFeePerGas),
        maxPriorityFeePerGas: normalizeNullableString(params.maxPriorityFeePerGas),
        gasUsed: normalizeNullableString(params.gasUsed),
        blockHeight: params.blockHeight ?? null,
        blockHash: normalizeNullableString(params.blockHash),
        fromWalletId: params.fromWalletId,
        toWalletId: params.toWalletId ?? null,
        fromAddress: normalizeAddress(params.fromAddress),
        toAddress: normalizeAddress(params.toAddress),
        data: normalizeNullableString(params.data),
        confirmedAt: params.confirmedAt ?? null,
        replacesTxHash,
        replacedByTxHash: null,
      },
    })

    return {
      record,
      replacedTxHashes,
    }
  })

  try {
    await incrementDailySummary(new Date())
  } catch (error) {
    logWarn('wallet:daily-summary', error)
  }

  return result
}

export async function recordInternalOperation(params: {
  chainId: number
  fromWalletId: string
  toWalletId: string
  valueWei: bigint
  asset?: string
}) {
  const record = await prismaCrdb.internalOperation.create({
    data: {
      blockchain: String(params.chainId),
      asset: params.asset ?? 'native',
      valueWei: params.valueWei,
      fromWalletId: params.fromWalletId,
      toWalletId: params.toWalletId,
    },
  })

  try {
    await incrementDailySummary(new Date())
  } catch (error) {
    logWarn('wallet:daily-summary', error)
  }

  return record
}

export const recordTransaction = recordInternalOperation
