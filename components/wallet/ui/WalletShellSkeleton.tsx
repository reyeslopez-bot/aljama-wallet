// components/wallet/ui/WalletShellSkeleton.tsx
import Skeleton from '@/components/ui/Skeleton'

export default function WalletShellSkeleton() {
  return (
    <main className="p-6 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>

      <div className="space-y-3">
        <Skeleton className="h-5 w-40" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-80" />
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-60" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    </main>
  )
}