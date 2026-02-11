'use client'
import type { ReactNode } from 'react'
import { Suspense } from 'react'
import { SessionProvider } from 'next-auth/react'
import type { Session } from 'next-auth'
import Web3Providers from './Web3Providers.client'
import TelemetryProvider from '@/components/telemetry/TelemetryProvider.client'
import ConsentBanner from '@/components/telemetry/ConsentBanner.client'
import DevReset from '@/components/telemetry/DevReset.client'

export default function Providers({
  children,
  session,
}: {
  children: ReactNode
  session?: Session | null
}) {
  return (
    <SessionProvider session={session}>
      <Web3Providers>
        <DevReset />
        <Suspense fallback={null}>
          <TelemetryProvider>
            {children}
            <ConsentBanner />
          </TelemetryProvider>
        </Suspense>
      </Web3Providers>
    </SessionProvider>
  )
}
