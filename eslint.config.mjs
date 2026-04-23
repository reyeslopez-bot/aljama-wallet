// eslint.config.mjs
import js from '@eslint/js'
import * as tseslint from 'typescript-eslint'
import tsParser from '@typescript-eslint/parser'
import nextPlugin from '@next/eslint-plugin-next'

export default [
  // 0) Ignore junk / build artifacts
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      '.cache/**',
      'dist/**',
      'generated/**',
      'prisma/generated/**',
      'prisma/**/generated/**',
    ],
  },

  // 1) Base JS rules
  js.configs.recommended,

  // 2) TypeScript (non type-aware; no parserOptions.project)
  ...tseslint.configs.recommended,

  // 3) Next.js + core web vitals
  nextPlugin.configs['core-web-vitals'],

  // 4) TS/TSX project-wide overrides
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      // Relax a bit
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // 5) Tests looser
  {
    files: ['tests/**/*', '**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  // 6) Do NOT run TS rules on the config file itself
  {
    files: ['eslint.config.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/*': 'off',
    },
  },

  // 7) Node-runtime scripts under scripts/**
  {
    files: ['scripts/**/*.mjs', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        URL: 'readonly',
        Buffer: 'readonly',
      },
    },
  },
]
