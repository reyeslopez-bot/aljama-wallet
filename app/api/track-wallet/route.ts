import { NextResponse } from 'next/server'
import { getAddress, isAddress } from 'ethers'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const a = searchParams.get('address') ?? ''
  const valid = isAddress(a)
  const checksum = valid ? getAddress(a) : null
  return NextResponse.json({ address: a, valid, checksum })
}