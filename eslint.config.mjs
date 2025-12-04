// eslint.config.mjs
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import nextPlugin from '@next/eslint-plugin-next'

export default [
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

  // TypeScript-aware rules (this is an array → spread is correct)
  ...tseslint.configs.recommended,

  // Next.js + core-web-vitals rules (this is a SINGLE config object)
  nextPlugin.configs['core-web-vitals'],
]
