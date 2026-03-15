// app/[locale]/(wallet)/layout.tsx
import type { ReactNode } from 'react'
import { QueryClient, dehydrate } from '@tanstack/react-query'
import { BRAND } from '@/constants/brand'
import { redirect } from 'next/navigation'
import { getSession, isAdminEmail } from '@/lib/security/session'
import { getWallets } from '@/services/wallet.service'
import { getWalletIdsForUser } from '@/services/wallet-ownership.service'
import { getWalletSnapshotForUser } from '@/services/wallet-boundary.service'
import { walletQueryKeys } from '@/components/wallet/sync/wallet-query-keys'
import WalletSyncBoundary from '@/components/wallet/sync/WalletSyncBoundary.client'
import { logWarn } from '@/lib/security/logging'

export default async function WalletLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const session = await getSession()
  if (!session?.user?.id) {
    redirect(`/${locale}/login`)
  }

  const isAdmin = isAdminEmail(session.user?.email ?? null)
  let activeWalletId: string | null = null
  let initialSnapshot = null

  try {
    if (isAdmin) {
      const wallets = await getWallets()
      activeWalletId = wallets[0]?.id ?? null
    } else {
      const walletIds = await getWalletIdsForUser(session.user.id)
      activeWalletId = walletIds[0] ?? null
    }

    if (activeWalletId) {
      initialSnapshot = await getWalletSnapshotForUser({
        walletId: activeWalletId,
        userId: session.user.id,
        isAdmin,
      })
    }
  } catch (error) {
    logWarn('wallet-layout:prefetch', error)
  }

  const queryClient = new QueryClient()
  if (activeWalletId && initialSnapshot) {
    queryClient.setQueryData(walletQueryKeys.snapshot(activeWalletId), initialSnapshot)
  }
  const dehydratedState = dehydrate(queryClient)

  return (
    <WalletSyncBoundary walletId={activeWalletId} dehydratedState={dehydratedState}>
      <div className="min-h-screen w-full bg-black text-ivory">
        <div className="fixed inset-0 -z-20 animated-mist-bg opacity-80" />
        <div className="fixed inset-0 -z-10 bg-gradient-to-b from-black/70 via-black/55 to-black/85" />
        <div className="fixed inset-0 -z-10 shadow-[inset_0_0_180px_rgba(0,0,0,0.85)]" />

        <div className="mx-auto flex min-h-screen w-full max-w-6xl items-start justify-center px-6 py-24">
          <div className="w-full">{children}</div>
        </div>

        <div className="fixed bottom-6 left-0 right-0 text-center text-xs text-ivory/35">
          {BRAND.name}
        </div>
      </div>
    </WalletSyncBoundary>
  )
}
