// app/api/wallets/route.ts
import { NextResponse } from "next/server"
import { getWallets, getWalletsByIds } from "@/services/wallet.service"
import { requireSession, isAdminEmail } from "@/lib/security/session"
import { getWalletIdsForUser } from "@/services/wallet-ownership.service"
import { buildRateLimitKey, rateLimit } from "@/lib/security/rate-limit"
import { errorJson } from "@/lib/security/api-response"
import { isAllowedOrigin } from "@/lib/security/origin"

export async function GET(req?: Request) {
  const session = await requireSession()
  if (!session) {
    return errorJson(401, "unauthorized", "UNAUTHORIZED")
  }

  const request = req ?? new Request("http://localhost")
  if (!isAllowedOrigin(request)) {
    return errorJson(403, "invalid_origin", "INVALID_ORIGIN")
  }
  const rateKey = buildRateLimitKey(request, session.user.id)
  const limit = await rateLimit({
    bucket: "wallets",
    key: rateKey,
    limit: 60,
    windowMs: 60_000,
  })
  if (!limit.ok) {
    return errorJson(
      429,
      "rate_limited",
      "RATE_LIMITED",
      { retryAfter: limit.retryAfter },
      { headers: { "retry-after": String(limit.retryAfter) } },
    )
  }

  const email = session.user?.email ?? null
  if (isAdminEmail(email)) {
    const wallets = await getWallets()
    return NextResponse.json(wallets)
  }

  const walletIds = await getWalletIdsForUser(session.user.id)
  const wallets = await getWalletsByIds(walletIds)
  return NextResponse.json(wallets)
}
