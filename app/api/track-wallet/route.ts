// app/api/track-wallet/route.ts
import { NextResponse } from 'next/server'

// Simple in-memory log for dev (survives only per server instance)
const events: any[] = []

export async function POST(req: Request) {
  try {
    const body = await req.json()

    // REAL USAGE (not silencing)
    events.push({
      ...body,
      receivedAt: Date.now(),
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('track-wallet error', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
