import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    // Pure-logic tests only: adapter fetch/pagination, filter helpers and
    // utility functions. No React rendering, so the default Node environment
    // is enough (@sanity/ui imports are SSR-safe).
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
