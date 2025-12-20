// next.config.mjs
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.alias = {
        ...(config.resolve.alias || {}),

        // Force pino to browser build.
        pino: require.resolve("pino/browser"),

        // Block node-only deps from entering client graph.
        "thread-stream": false,
        tap: false,
        tape: false,
      };
    }
    return config;
  },
};

export default nextConfig;
