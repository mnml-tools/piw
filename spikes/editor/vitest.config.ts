import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    // The 5k-paragraph benchmark takes ~10 s on a laptop; leave room for slow CI.
    testTimeout: 120_000,
  },
})
