// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    'http://127.0.0.1:2998',
    'http://localhost:2998',
  ],
  turbopack: { resolveAlias: {} },
}

export default nextConfig
