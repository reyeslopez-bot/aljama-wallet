import { NextResponse } from 'next/server'
import { withApiRoute } from '@/lib/security/api-route'

async function getAuthConfig() {
  return NextResponse.json(
    { inviteRequired: false },
    { headers: { 'cache-control': 'no-store' } },
  )
}

export const GET = withApiRoute({ scope: 'api:auth-config', timeoutMs: 2_000 }, getAuthConfig)
