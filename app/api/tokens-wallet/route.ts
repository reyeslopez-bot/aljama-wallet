// app/api/tokens/route.ts
import { getTokensByWallet } from '@/lib/getTokensByWallet'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { address } = await req.json()

  if (!address) {
    return NextResponse.json({ error: 'Missing address' }, { status: 400 })
  }

  const data = await getTokensByWallet({ address })

  return NextResponse.json({ data })
}

