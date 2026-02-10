'use client'
import type { ReactNode } from 'react'
import Web3Providers from './Web3Providers.client'
import TelemetryProvider from '@/components/telemetry/TelemetryProvider.client'
import ConsentBanner from '@/components/telemetry/ConsentBanner.client'

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <Web3Providers>
      <TelemetryProvider>
        {children}
        <ConsentBanner />
      </TelemetryProvider>
    </Web3Providers>
  )
}
