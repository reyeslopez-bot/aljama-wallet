import { prismaCrdb } from '@/lib/prisma-crdb'

export const getWallets = async () => {
    return await prismaCrdb.wallet.findMany()
}

