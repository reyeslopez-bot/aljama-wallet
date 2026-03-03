import { buildPqcBindingHashes } from '@/lib/pqc/commitment'
import { parseWalletPqcBinding } from '@/lib/pqc/types'
import { prismaCrdb } from '@/lib/prisma-crdb'

const BATCH_SIZE = Number(process.env.BACKFILL_BATCH_SIZE ?? 100)
const DRY_RUN = process.env.DRY_RUN === 'true'

async function main() {
  if (!Number.isFinite(BATCH_SIZE) || BATCH_SIZE <= 0) {
    throw new Error('BACKFILL_BATCH_SIZE must be a positive number')
  }

  let lastId: string | null = null
  let scanned = 0
  let updated = 0

  while (true) {
    const batch: Array<{ id: string; pqcBinding: unknown; pqcBindingHash: string | null }> =
      await prismaCrdb.wallet.findMany({
      take: BATCH_SIZE,
      ...(lastId ? { skip: 1, cursor: { id: lastId } } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        pqcBinding: true,
        pqcBindingHash: true,
      },
      })

    if (batch.length === 0) {
      break
    }

    for (const wallet of batch) {
      scanned += 1
      lastId = wallet.id

      if (wallet.pqcBindingHash) {
        continue
      }

      const parsed = parseWalletPqcBinding(wallet.pqcBinding)
      if (!parsed) {
        continue
      }

      const bindingHash = buildPqcBindingHashes(parsed).bindingHash
      if (!DRY_RUN) {
        await prismaCrdb.wallet.update({
          where: { id: wallet.id },
          data: { pqcBindingHash: bindingHash },
        })
      }

      updated += 1
    }

    console.log(`scanned=${scanned} updated=${updated}`)
  }
}

main()
  .catch((error) => {
    console.error('backfill failed', error)
    process.exit(1)
  })
  .finally(async () => {
    await prismaCrdb.$disconnect()
  })
