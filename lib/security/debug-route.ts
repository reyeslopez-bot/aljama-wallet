type DebugRouteOptions = {
  allowInCiEnvVar?: string
}

function notFoundResponse(): Response {
  return new Response('Not found', {
    status: 404,
    headers: {
      'cache-control': 'no-store, max-age=0',
    },
  })
}

export function debugRouteDisabledResponse(options: DebugRouteOptions = {}): Response | null {
  if (process.env.NODE_ENV === 'production') {
    return notFoundResponse()
  }

  if (process.env.CI !== 'true') {
    return null
  }

  const envVar = options.allowInCiEnvVar?.trim()
  if (envVar && process.env[envVar] === 'true') {
    return null
  }

  return notFoundResponse()
}

export function canBypassDebugRouteTokenCheck(req: Request): boolean {
  if (process.env.ALLOW_UNAUTH_DEBUG_ROUTES === 'true') return true
  if (process.env.CI === 'true') return false

  const { hostname } = new URL(req.url)
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return process.env.NODE_ENV !== 'production'
  }

  return false
}
