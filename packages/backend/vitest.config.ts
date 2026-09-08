import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/lib/**'],

    setupFiles: ['./src/__tests__/setup.ts'],
    testTimeout: 10000,
    clearMocks: true,

    coverage: {
      enabled: process.env.SKIP_COVERAGE !== 'true',
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.ts',
        'src/__tests__/**',
        'src/constants/**',
        'src/config/**',
        // emulator-only helpers; index.ts never exports these in production
        'src/functions/dev/**',
        'src/**/index.ts',
        'lib/**',
      ],
      reportsDirectory: '../../coverage/backend',
      reporter: ['lcov', 'text', 'html'],
      thresholds: { branches: 90, functions: 90, lines: 90, statements: 90 },
    },
  },
  resolve: {
    alias: [{ find: /^@superpool\/(.*)$/, replacement: path.resolve(__dirname, '../$1/src') }],
  },
})
