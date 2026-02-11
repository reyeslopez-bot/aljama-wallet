// next.config.mjs

import { createRequire } from "node:module";
import createNextIntlPlugin from "next-intl/plugin";
const require = createRequire(import.meta.url);
const webpack = require("webpack");

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {

    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      pino: require.resolve("pino/browser"),
      "thread-stream": false,
      tap: false,
      tape: false,
      "pino-pretty": false,
      "@react-native-async-storage/async-storage": false,
    };

    config.plugins = config.plugins || [];
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp:
          /^pino-pretty$|^@react-native-async-storage\/async-storage$/,
      }),
    );

    config.externals = [
      ...(config.externals || []),
      {
        "pino-pretty": "commonjs pino-pretty",
        "@react-native-async-storage/async-storage":
          "commonjs @react-native-async-storage/async-storage",
      },
    ];

    return config;
  },
};

export default withNextIntl(nextConfig);
