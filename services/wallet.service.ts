// services/wallet.service.ts
import { prismaCrdb } from "@/lib/prisma-crdb"

export async function getWallets() {
  // NOTE: this assumes `prismaCrdb` is a PrismaClient INSTANCE (not a function).
  // If your lib exports a factory `prismaCrdb()`, change to `const prisma = prismaCrdb()` and use `prisma.wallet...`.
  return prismaCrdb.wallet.findMany({
    select: {
      id: true,
      address: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  })
}

export async function createWalletRecord(input: { address: string; privateKey: string }) {
  const address = input.address.trim()
  const privateKey = input.privateKey.trim()

  if (!address) throw new Error("address is required")
  if (!privateKey) throw new Error("privateKey is required")

  const { encryptPrivateKey } = await import("@/lib/crypto/wallet-crypto")
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
