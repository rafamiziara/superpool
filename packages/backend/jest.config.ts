import type { Config } from 'jest'

const config: Config = {
  // Specify the test environment (e.g., Node.js)
  testEnvironment: 'node',

  // Tell Jest where to find your test files
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/__tests__/**/*.test.ts'],

  // Ignore files in the lib folder
  testPathIgnorePatterns: ['/lib/', '/node_modules/'],

  // Transform TypeScript files using ts-jest (modern configuration)
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'esnext',
          target: 'es2022',
        },
      },
    ],
  },

  // Enable collection of test coverage (can be disabled in development)
  collectCoverage: process.env.SKIP_COVERAGE !== 'true',

  // Specify where to collect coverage from
  collectCoverageFrom: [
    'src/**/*.ts',

    // Exclusions
    '!src/**/*.d.ts', // Type definitions
    '!src/**/*.test.ts', // Test files
    '!src/**/__tests__/**', // Test directories
    '!src/**/__mocks__/**', // Mock files
    '!src/constants/**', // Configuration constants
    '!src/index.ts', // Firebase Functions index
    '!lib/**', // Compiled output
  ],

  // Coverage output configuration
  coverageDirectory: '<rootDir>/../../coverage/backend',
  coverageReporters: ['lcov', 'text', 'text-summary', 'html'],

  // Coverage thresholds - enforce quality standards (only when coverage is enabled)
  ...(process.env.SKIP_COVERAGE !== 'true' && {
    coverageThreshold: {
      global: {
        branches: 90, // Decision paths (if/else, switch, try/catch)
        functions: 95, // Function execution (Cloud Functions, services)
        lines: 95, // Code line execution
        statements: 95, // Individual statements
      },

      // Critical Business Logic - Higher standards
      'src/functions/pools/**/*.ts': {
        branches: 95, // Pool creation decision paths
        functions: 95, // All pool-related functions
        lines: 95, // Complete pool logic coverage
        statements: 95, // All pool statements tested
      },

      'src/functions/auth/**/*.ts': {
        branches: 95, // Authentication decision paths
        functions: 95, // All auth functions
        lines: 95, // Security logic coverage
        statements: 95, // Complete auth testing
      },

      // Service Layer - Business logic services
      'src/services/**/*.ts': {
        branches: 95, // Service error handling
        functions: 95, // All service methods
        lines: 95, // Service logic coverage
        statements: 95, // Complete service testing
      },

      // Utility & Support Code - Medium priority
      'src/utils/**/*.ts': {
        branches: 90, // Utility decision paths
        functions: 95, // All utility functions
        lines: 90, // Utility coverage
        statements: 90, // Utility logic testing
      },
    },
  }),

  // Test timeout settings
  testTimeout: 10000, // 10 seconds max per test

  // Setup files - MOCK_SYSTEM.md compliant path
  setupFilesAfterEnv: ['<rootDir>/src/__mocks__/jest.setup.ts'],

  // Module resolution
  moduleNameMapper: {
    '^@superpool/(.*)$': '<rootDir>/../../packages/$1/src',
    '^@mocks/(.*)$': '<rootDir>/src/__mocks__/$1', // ✅ MOCK_SYSTEM.md requirement
  },

  // Handle ES6 modules
  extensionsToTreatAsEsm: ['.ts'],

  // Clear mocks between tests
  clearMocks: true,
  resetMocks: false,
  restoreMocks: false,

  // Performance optimization
  maxWorkers: process.env.CI ? 2 : '25%', // Lower worker count for better memory usage
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache',

  // Module file extensions (ordered by likelihood for faster resolution)
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],

  // Improved test detection and execution speed
  watchPathIgnorePatterns: ['/node_modules/', '/lib/', '/.jest-cache/', '/coverage/'],

  // Faster test execution options
  detectOpenHandles: false, // Disable for faster execution
  forceExit: false, // Let tests exit naturally
  logHeapUsage: process.env.DEBUG_MEMORY === 'true',
}

export default config
