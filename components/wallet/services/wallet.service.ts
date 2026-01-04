// components/wallet/services/wallet.service.ts
import { prismaCrdb } from "@/lib/prisma-crdb"

export const getWallets = async () => {
  return prismaCrdb().wallet.findMany()
}