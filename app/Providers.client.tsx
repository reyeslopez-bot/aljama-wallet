'use client'
import type { ReactNode } from 'react'
import { Suspense } from 'react'
import Web3Providers from './Web3Providers.client'
import TelemetryProvider from '@/components/telemetry/TelemetryProvider.client'
import ConsentBanner from '@/components/telemetry/ConsentBanner.client'
import DevReset from '@/components/telemetry/DevReset.client'

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <Web3Providers>
      <DevReset />
      <Suspense fallback={null}>
        <TelemetryProvider>
          {children}
          <ConsentBanner />
        </TelemetryProvider>
      </Suspense>
    </Web3Providers>
  )
}
