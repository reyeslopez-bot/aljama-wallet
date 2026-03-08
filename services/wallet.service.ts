import { getAddress } from 'ethers'
import { Prisma } from '@/prisma/generated/prisma-crdb'
import { buildPqcBindingHashes } from '@/lib/pqc/commitment'
import { prismaCrdb } from '@/lib/prisma-crdb'
import { logWarn } from '@/lib/security/logging'
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

function normalizeAddress(address: string): string {
  return getAddress(address.trim())
}

function normalizePubKey(value?: string | null): string | null {
  if (!value?.trim()) return null
  return value.trim()
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
    | { address: string }
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

export type CreateWalletRecordInput = {
  address: string
  chain?: SigningChain
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
  const normalized = normalizeAddress(address)
  return selectWalletByUnique({ address: normalized })
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

  return prismaCrdb.wallet.create({
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
}

export async function getSpentTodayWei(walletId: string, chainId: number) {
  const networkId = String(chainId)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [chainSpentToday, legacySpentToday] = await Promise.all([
    prismaCrdb.chainTransaction.aggregate({
      where: {
        fromWalletId: walletId,
        chainType: 'EVM',
        networkId,
        status: { in: ['broadcast', 'settled', 'validated'] },
        createdAt: { gte: since },
      },
      _sum: { valueBaseUnits: true },
    }),
    prismaCrdb.transaction.aggregate({
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
  status?: string
  blockHeight?: bigint | null
}) {
  const record = await prismaCrdb.chainTransaction.create({
    data: {
      chainType: 'EVM',
      networkId: String(params.chainId),
      txHash: params.txHash,
      status: params.status ?? 'broadcast',
      asset: params.asset ?? 'native',
      valueBaseUnits: params.valueBaseUnits,
      blockHeight: params.blockHeight ?? null,
      fromWalletId: params.fromWalletId,
      toWalletId: params.toWalletId ?? null,
      fromAddress: normalizeAddress(params.fromAddress),
      toAddress: normalizeAddress(params.toAddress),
    },
  })

  try {
    await incrementDailySummary(new Date())
  } catch (error) {
    logWarn('wallet:daily-summary', error)
  }

  return record
}

export async function recordTransaction(params: {
  chainId: number
  fromWalletId: string
  toWalletId: string
  valueWei: bigint
  asset?: string
}) {
  const record = await prismaCrdb.transaction.create({
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
