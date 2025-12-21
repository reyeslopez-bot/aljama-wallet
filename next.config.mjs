// next.config.mjs
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        pino: require.resolve("pino/browser"),
        "thread-stream": false,
        tap: false,
        tape: false,
      };
    }
    return config;
  },
};

export default nextConfig;
