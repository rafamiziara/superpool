import type { Config } from 'jest'
import { createDefaultPreset } from 'ts-jest'

const config: Config = {
  // Use ts-jest as the preset
  preset: 'ts-jest',

  // Specify the test environment (e.g., Node.js)
  testEnvironment: 'node',

  // Tell Jest where to find your test files
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/__tests__/**/*.test.ts'],

  // Ignore files in the lib folder
  testPathIgnorePatterns: ['/lib/', '/node_modules/'],

  // Enable collection of test coverage
  collectCoverage: true,

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

  // Coverage thresholds - enforce quality standards
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

  // Test timeout settings
  testTimeout: 10000, // 10 seconds max per test

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup/jest.setup.ts'],

  // Module resolution
  moduleNameMapper: {
    '^@superpool/(.*)$': '<rootDir>/../../packages/$1/src',
  },

  // Handle ES6 modules
  extensionsToTreatAsEsm: ['.ts'],
  globals: {
    'ts-jest': {
      useESM: true,
    },
  },

  // Clear mocks between tests
  clearMocks: true,
  resetMocks: false,
  restoreMocks: false,

  // Performance optimization
  maxWorkers: '50%',
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache',

  // Add the ts-jest default preset (includes transform config)
  ...createDefaultPreset(),
}

export default config
