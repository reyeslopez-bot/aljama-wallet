// app/api/xrpl/dev-account/route.ts
import { NextResponse } from 'next/server'
import { getDevXrplAccount } from '@/lib/xrpl'

export async function GET() {
  try {
    const account = await getDevXrplAccount()
    return NextResponse.json({ ok: true, account })
  } catch (error: any) {
    console.error('XRPL dev-account error', error)
    return NextResponse.json(
      { ok: false, error: error?.message ?? 'XRPL error' },
      { status: 500 },
    )
  }
}
