// services/wallet.service.ts
import { getAddress } from 'ethers'
import { prismaCrdb } from '@/lib/prisma-crdb'
import { decryptPrivateKey, encryptPrivateKey } from '@/lib/crypto/wallet-crypto'
import { incrementDailySummary } from '@/services/summary.service'

function ensure0xHex(pk: string): string {
  const trimmed = pk.trim()
  return trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`
}

function normalizeAddress(address: string): string {
  return getAddress(address.trim())
}

export async function getWallets() {
  // NOTE: this assumes `prismaCrdb` is a PrismaClient INSTANCE (not a function).
  // If your lib exports a factory `prismaCrdb()`, change to `const prisma = prismaCrdb()` and use `prisma.wallet...`.
  return prismaCrdb.wallet.findMany({
    select: {
      id: true,
      address: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getWalletById(walletId: string) {
  return prismaCrdb.wallet.findUnique({
    where: { id: walletId },
    select: {
      id: true,
      address: true,
      encryptedPrivateKey: true,
      encryptionIv: true,
      keyVersion: true,
      createdAt: true,
    },
  })
}

export async function getWalletByAddress(address: string) {
  const normalized = normalizeAddress(address)
  return prismaCrdb.wallet.findUnique({
    where: { address: normalized },
    select: {
      id: true,
      address: true,
      encryptedPrivateKey: true,
      encryptionIv: true,
      keyVersion: true,
      createdAt: true,
    },
  })
}

export async function createWalletRecord(input: { address: string; privateKey: string }) {
  const address = normalizeAddress(input.address)
  const privateKey = ensure0xHex(input.privateKey)

  if (!address) throw new Error('address is required')
  if (!privateKey) throw new Error('privateKey is required')

  const encrypted = encryptPrivateKey(privateKey)

  return prismaCrdb.wallet.create({
    data: {
      address,
      encryptedPrivateKey: encrypted.encryptedPrivateKey,
      encryptionIv: encrypted.encryptionIv,
      keyVersion: encrypted.keyVersion, // stored for future rotations
    },
    select: {
      id: true,
      address: true,
      createdAt: true,
    },
  })
}

export async function getDecryptedWallet(walletId: string) {
  const record = await getWalletById(walletId)
  if (!record) throw new Error('WALLET_NOT_FOUND')

  const encrypted = Buffer.from(record.encryptedPrivateKey)
  const iv = Buffer.from(record.encryptionIv)

  const privateKey = decryptPrivateKey(encrypted, iv, record.keyVersion)

  return {
    id: record.id,
    address: record.address,
    privateKey: ensure0xHex(privateKey),
  }
}

export async function getSpentTodayWei(walletId: string, chainId: number) {
  const chainKey = String(chainId)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const spentToday = await prismaCrdb.transaction.aggregate({
    where: { fromWalletId: walletId, blockchain: chainKey, createdAt: { gte: since } },
    _sum: { valueWei: true },
  })

  return (spentToday._sum?.valueWei ?? 0n) as bigint
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
    console.warn('daily summary update failed', error)
  }

  return record
}
