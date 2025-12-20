/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.alias = {
        ...(config.resolve.alias || {}),

        // Force pino to its browser implementation.
        pino: require.resolve("pino/browser"),

        // Hard-block node-only dependency used by pino transports.
        "thread-stream": false,

        // If Next traverses tests anyway, block these dev test runners.
        tap: false,
        tape: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
export default nextConfig;