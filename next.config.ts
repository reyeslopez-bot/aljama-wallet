import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@base-org/account': path.resolve(__dirname, 'shims/empty.js'),
    }
    return config
  },
}
export default nextConfig
