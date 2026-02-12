import { prismaCrdb } from '@/lib/prisma-crdb'
import { prismaPg } from '@/lib/prisma-pg'
import { decryptPrivateKey, encryptPrivateKey } from '@/lib/crypto/wallet-crypto'

type WalletRecord = {
  id: string
  address: string
  encryptedPrivateKey: Uint8Array
  encryptionIv: Uint8Array
  keyVersion: number
}

type WalletFindManyArgs = {
  take: number
  skip?: number
  cursor?: { id: string }
  orderBy: { id: 'asc' | 'desc' }
  select: {
    id: true
    address: true
    encryptedPrivateKey: true
    encryptionIv: true
    keyVersion: true
  }
}

type WalletUpdateArgs = {
  where: { id: string }
  data: {
    encryptedPrivateKey: Uint8Array
    encryptionIv: Uint8Array
    keyVersion: number
  }
}

type Client = {
  wallet: {
    findMany: (args: WalletFindManyArgs) => Promise<WalletRecord[]>
    update: (args: WalletUpdateArgs) => Promise<unknown>
  }
}

const BATCH_SIZE = Number(process.env.MIGRATE_BATCH_SIZE ?? 50)
const DRY_RUN = process.env.DRY_RUN === 'true'
const TARGET = (process.env.MIGRATE_TARGET ?? 'crdb').toLowerCase()
const VERIFY = process.env.MIGRATE_VERIFY !== 'false'

async function migrateClient(label: string, client: Client) {
  console.log(`\n[${label}] starting migration (dryRun=${DRY_RUN})`)
  let lastId: string | null = null
  let processed = 0

  while (true) {
    const batch = await client.wallet.findMany({
      take: BATCH_SIZE,
      ...(lastId ? { skip: 1, cursor: { id: lastId } } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        address: true,
        encryptedPrivateKey: true,
        encryptionIv: true,
        keyVersion: true,
      },
    })

    if (batch.length === 0) break

    for (const wallet of batch) {
      const encrypted = Buffer.from(wallet.encryptedPrivateKey)
      const iv = Buffer.from(wallet.encryptionIv)
      const privateKey = decryptPrivateKey(encrypted, iv, wallet.keyVersion, {
        address: wallet.address,
      })

      const reencrypted = encryptPrivateKey(privateKey, { address: wallet.address })

      if (VERIFY) {
        const roundTrip = decryptPrivateKey(
          Buffer.from(reencrypted.encryptedPrivateKey),
          Buffer.from(reencrypted.encryptionIv),
          reencrypted.keyVersion,
          { address: wallet.address },
        )
        if (roundTrip !== privateKey) {
          throw new Error(`Verification failed for wallet ${wallet.id}`)
        }
      }

      if (!DRY_RUN) {
        await client.wallet.update({
          where: { id: wallet.id },
          data: {
            encryptedPrivateKey: reencrypted.encryptedPrivateKey,
            encryptionIv: reencrypted.encryptionIv,
            keyVersion: reencrypted.keyVersion,
          },
        })
      }

      processed += 1
      lastId = wallet.id
    }

    console.log(`[${label}] processed ${processed}`)
  }

  console.log(`[${label}] complete, total ${processed}`)
}

async function main() {
  if (!Number.isFinite(BATCH_SIZE) || BATCH_SIZE <= 0) {
    throw new Error('MIGRATE_BATCH_SIZE must be a positive number')
  }

  if (TARGET === 'crdb' || TARGET === 'both') {
    await migrateClient('crdb', prismaCrdb as unknown as Client)
  }

  if (TARGET === 'pg' || TARGET === 'both') {
    await migrateClient('pg', prismaPg as unknown as Client)
  }
}

main()
  .catch((error) => {
    console.error('migration failed', error)
    process.exit(1)
  })
  .finally(async () => {
    await Promise.allSettled([prismaCrdb.$disconnect(), prismaPg.$disconnect()])
  })
