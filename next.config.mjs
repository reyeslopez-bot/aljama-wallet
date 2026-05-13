// next.config.mjs

import { createRequire } from "node:module";
import process from "node:process";
import createNextIntlPlugin from "next-intl/plugin";
const require = createRequire(import.meta.url);

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  turbopack: {
    // The wagmi v3 tempoWallet connector lazily imports 'accounts', a
    // workspace-internal package that is never published to npm.  Alias it to
    // an empty stub so Turbopack (used by `next dev`) resolves the module
    // without error.  The app uses only injected() and walletConnect(), so
    // tempoWallet is never actually invoked at runtime.
    resolveAlias: {
      accounts: "./lib/stubs/accounts.js",
    },
  },
  outputFileTracingIncludes: {
    "/*": ["./prisma/generated/**/*"],
  },
  async headers() {
    const baseHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "no-referrer" },
      {
        key: "Permissions-Policy",
        value:
          "camera=(), microphone=(), geolocation=(self), payment=(), usb=(), screen-wake-lock=(), interest-cohort=()",
      },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    ];

    if (process.env.NODE_ENV === "production") {
      baseHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      });
    }

    return [
      {
        source: "/(.*)",
        headers: baseHeaders,
      },
    ];
  },
  webpack: (config, { webpack }) => {

    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      pino: require.resolve("pino/browser"),
      "thread-stream": false,
      tap: false,
      tape: false,
      "pino-pretty": false,
      "@react-native-async-storage/async-storage": false,
      "@metamask/sdk": false,
      "@metamask/connect-evm": false,
      // wagmi v3 tempoWallet workspace-internal package — never published
      accounts: false,
    };

    config.plugins = config.plugins || [];
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp:
          /^pino-pretty$|^@react-native-async-storage\/async-storage$|^@metamask\/sdk$|^@metamask\/connect-evm$|^accounts$/,
      }),
    );

    config.externals = [
      ...(config.externals || []),
      {
        "pino-pretty": "commonjs pino-pretty",
        "@react-native-async-storage/async-storage":
          "commonjs @react-native-async-storage/async-storage",
        "@metamask/sdk": "commonjs @metamask/sdk",
        "@metamask/connect-evm": "commonjs @metamask/connect-evm",
        accounts: "commonjs accounts",
      },
    ];

    return config;
  },
};

export default withNextIntl(nextConfig);
