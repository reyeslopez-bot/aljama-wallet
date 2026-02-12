// app/api/wallets/route.ts
import { getWallets, getWalletsByIds } from "@/services/wallet.service"
import { requireSession, isAdminEmail } from "@/lib/security/session"
import { getWalletIdsForUser } from "@/services/wallet-ownership.service"
import { buildRateLimitKey, rateLimit } from "@/lib/security/rate-limit"

export async function GET(req?: Request) {
  const session = await requireSession()
  if (!session) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 })
  }

  const request = req ?? new Request("http://localhost")
  const rateKey = buildRateLimitKey(request, session.user.id)
  const limit = rateLimit({
    bucket: "wallets",
    key: rateKey,
    limit: 60,
    windowMs: 60_000,
  })
  if (!limit.ok) {
    return Response.json(
      { error: "RATE_LIMITED", retryAfter: limit.retryAfter },
      { status: 429, headers: { "retry-after": String(limit.retryAfter) } },
    )
  }

  const email = session.user?.email ?? null
  if (isAdminEmail(email)) {
    const wallets = await getWallets()
    return Response.json(wallets)
  }

  const walletIds = await getWalletIdsForUser(session.user.id)
  const wallets = await getWalletsByIds(walletIds)
  return Response.json(wallets)
}
