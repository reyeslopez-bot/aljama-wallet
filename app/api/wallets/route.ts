// app/api/wallets/route.ts
import { getWallets } from "@/services/wallet.service"

export async function GET() {
  console.log("HIT app/api/wallets")
  const wallets = await getWallets()
  return Response.json(wallets)
}
