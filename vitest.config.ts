import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Ensure React uses the non-production build so `act` is available in tests.
if (process.env.NODE_ENV !== 'test') {
  process.env.NODE_ENV = 'test'
}

export default defineConfig({
  test: {
    globals: true,
    environment: 'node', // since you're testing wallet logic, not React components
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
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
