// eslint.config.mjs
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import nextPlugin from '@next/eslint-plugin-next'

export default [
  // Global ignores – keep TS, drop generated/runtime noise
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'generated/**',
      'prisma/generated/**',
    ],
  },

  // Base JS rules
  js.configs.recommended,

  // TypeScript-aware rules
  ...tseslint.configs.recommended,

  // Next.js + core-web-vitals rules (what `next/core-web-vitals` used to do)
  ...nextPlugin.configs['core-web-vitals'],
]
