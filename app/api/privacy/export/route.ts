import { prismaPg } from '@/lib/prisma-pg'
import { usePgAuth } from '@/lib/auth/store'
import { errorJson, okJson } from '@/lib/security/api-response'
import { withApiRoute } from '@/lib/security/api-route'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { requireSession } from '@/lib/security/session'

async function getPrivacyExport(req: Request) {
  const session = await requireSession()
  if (!session?.user?.id) {
    return errorJson(401, 'unauthorized', 'UNAUTHORIZED')
  }
  if (!usePgAuth()) {
    return errorJson(503, 'privacy_export_unavailable', 'PERSISTENT_ACCOUNT_STORAGE_REQUIRED')
  }

  const limit = await rateLimit({
    bucket: 'privacy-export',
    key: buildRateLimitKey(req, session.user.id),
    limit: 5,
    windowMs: 60 * 60_000,
  })
  if (!limit.ok) {
    return errorJson(
      429,
      'rate_limited',
      'RATE_LIMITED',
      { retryAfter: limit.retryAfter },
      { headers: { 'retry-after': String(limit.retryAfter) } },
    )
  }

  const user = await prismaPg.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      image: true,
      createdAt: true,
      updatedAt: true,
    },
  })
  if (!user) {
    return errorJson(404, 'account_not_found', 'ACCOUNT_NOT_FOUND')
  }

  const memberships = await prismaPg.userWallet.findMany({
    where: { userId: user.id },
    select: { walletId: true, createdAt: true },
  })
  const walletIds = memberships.map(({ walletId }) => walletId)

  const [wallets, contactRequests, transfers, signingIntents, privacyRequests] = await Promise.all([
    walletIds.length
      ? prismaPg.wallet.findMany({
          where: { id: { in: walletIds } },
          select: { id: true, address: true, chain: true, createdAt: true },
        })
      : Promise.resolve([]),
    prismaPg.contactRequest.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        name: true,
        email: true,
        category: true,
        message: true,
        locale: true,
        source: true,
        pagePath: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    prismaPg.walletTransferLog.findMany({
      where: {
        OR: [{ userId: user.id }, ...(walletIds.length ? [{ walletId: { in: walletIds } }] : [])],
      },
      select: {
        id: true,
        walletId: true,
        chainId: true,
        toAddress: true,
        amountWei: true,
        status: true,
        txHash: true,
        txType: true,
        blockHeight: true,
        confirmedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    prismaPg.walletSigningIntent.findMany({
      where: {
        OR: [{ userId: user.id }, ...(walletIds.length ? [{ walletId: { in: walletIds } }] : [])],
      },
      select: {
        id: true,
        chain: true,
        actionType: true,
        status: true,
        walletId: true,
        chainId: true,
        txHash: true,
        errorCode: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    prismaPg.privacyRequest.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        type: true,
        description: true,
        status: true,
        resolution: true,
        resolvedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  return okJson({
    exportedAt: new Date().toISOString(),
    scope: 'Account-linked records in the configured PostgreSQL database',
    exclusions: [
      'Anonymous telemetry and records not linked to this account are not included.',
      'Authentication secrets, signing payloads, and private keys are excluded.',
    ],
    account: user,
    walletMemberships: memberships,
    wallets,
    contactRequests,
    transfers: transfers.map((transfer) => ({
      ...transfer,
      amountWei: transfer.amountWei.toString(),
      blockHeight: transfer.blockHeight?.toString() ?? null,
    })),
    signingIntents,
    privacyRequests,
  })
}

export const GET = withApiRoute({ scope: 'api:privacy-export', timeoutMs: 15_000 }, getPrivacyExport)
