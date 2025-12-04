// app/api/track-wallet/route.ts
import { NextRequest, NextResponse } from 'next/server'

export type TrackWalletEvent = {
  address?: string
  chainId?: number
  connector?: string
  userAgent?: string
  timestamp?: string
  // allow extra fields without using `any`
  [key: string]: unknown
}

// Simple in-memory log for dev (per server instance only)
const events: TrackWalletEvent[] = []

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as TrackWalletEvent

    events.push({
      ...body,
      receivedAt: Date.now(),
    })

    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    // keep the error visible for debugging
    console.error('track-wallet error', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
