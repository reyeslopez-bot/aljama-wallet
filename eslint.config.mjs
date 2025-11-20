import { dirname } from "path";
import { fileURLToPath } from "url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

let nextConfigs = [];

try {
  nextConfigs = compat.extends("next/core-web-vitals", "next/typescript");
} catch (error) {
  console.warn(
    `⚠️  Falling back to base ESLint config: ${error instanceof Error ? error.message : String(error)}`,
  );
  nextConfigs = [
    js.configs.recommended,
    {
      ignores: ["**/*.ts", "**/*.tsx"],
    },
  ];
}

const eslintConfig = [
  {
    ignores: ["generated/**"],
  },
  ...nextConfigs,
];

export default eslintConfig;
