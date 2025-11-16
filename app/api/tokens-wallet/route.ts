import { NextResponse } from 'next/server'
import { getTokensByWallet } from '@/lib/getTokensByWallet'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const address = searchParams.get('address') ?? ''
  const tokens = await getTokensByWallet(address)
  return NextResponse.json({ address, tokens })
}