// services/wallet.service.ts
import { prismaCrdb } from "@/lib/prisma-crdb"
import { encryptPrivateKey } from "@/lib/crypto/wallet-crypto"

export async function getWallets() {
  return prismaCrdb.wallet.findMany({
    select: {
      id: true,
      address: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  })
}

export async function createWalletRecord(input: {
  address: string
  privateKey: string
}) {
  const encrypted = encryptPrivateKey(input.privateKey)

  return prismaCrdb.wallet.create({
    data: {
      address: input.address,
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
