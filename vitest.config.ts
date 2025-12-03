import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node', // since you're testing wallet logic, not React components
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'), // lets you import "@/lib/..." in tests
    },
  },
})
