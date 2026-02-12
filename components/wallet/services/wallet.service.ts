// services/wallet.service.ts
import { prismaCrdb } from '@/lib/prisma-crdb'
import { getAddress } from 'ethers'

function ensure0xHex(pk: string): string {
  const trimmed = pk.trim()
  return trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`
}

export async function getWallets() {
  return prismaCrdb.wallet.findMany({
    select: {
      id: true,
      address: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function createWalletRecord(input: {
  address: string
  privateKey: string
}) {
  const { encryptPrivateKey } = await import('@/lib/crypto/wallet-crypto')
  const address = getAddress(input.address.trim())
  const encrypted = encryptPrivateKey(ensure0xHex(input.privateKey), { address })

  return prismaCrdb.wallet.create({
    data: {
      address,
      encryptedPrivateKey: encrypted.encryptedPrivateKey,
      encryptionIv: encrypted.encryptionIv,
      keyVersion: encrypted.keyVersion,
    },
    select: {
      id: true,
      address: true,
      createdAt: true,
    },
  })
}
