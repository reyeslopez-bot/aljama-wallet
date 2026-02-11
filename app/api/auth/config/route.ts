import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json(
    { inviteRequired: true },
    { headers: { 'cache-control': 'no-store' } },
  )
}
