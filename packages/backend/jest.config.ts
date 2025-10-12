import type { Config } from 'jest'

const config: Config = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  testPathIgnorePatterns: ['/lib/', '/node_modules/'],

  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: { module: 'esnext', target: 'es2022' },
      },
    ],
  },

  // Simplified coverage
  collectCoverage: process.env.SKIP_COVERAGE !== 'true',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/__tests__/**',
    '!src/constants/**',
    '!src/config/**',
    '!src/**/index.ts',
    '!lib/**',
  ],

  coverageDirectory: '<rootDir>/../../coverage/backend',
  coverageReporters: ['lcov', 'text', 'html'],

  // No aggressive thresholds yet (build coverage gradually)
  coverageThreshold: {
    global: { branches: 90, functions: 90, lines: 90, statements: 90 },
  },

  testTimeout: 10000,
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],

  moduleNameMapper: {
    '^@superpool/(.*)$': '<rootDir>/../../packages/$1/src',
  },

  extensionsToTreatAsEsm: ['.ts'],
  clearMocks: true,
  maxWorkers: '50%',
}

export default config
