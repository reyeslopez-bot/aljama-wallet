import type { Metadata } from 'next'
import ConsentEntryGate from '@/components/home/ConsentEntryGate.client'

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
}

export default function ConsentPage() {
  return <ConsentEntryGate />
}
