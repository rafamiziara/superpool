import type { Config } from 'jest'
import { createDefaultPreset } from 'ts-jest'

const config: Config = {
  // Use ts-jest as the preset
  preset: 'ts-jest',

  // Specify the test environment (e.g., Node.js)
  testEnvironment: 'node',

  // Tell Jest where to find your test files
  testMatch: ['**/*.test.ts'],

  // Ignore files in the lib folder
  testPathIgnorePatterns: ['/lib/'],

  // Enable collection of test coverage
  collectCoverage: true,

  // Specify where to collect coverage from
  collectCoverageFrom: ['<rootDir>/src/**/*.ts'],

  // Add the ts-jest default preset
  ...createDefaultPreset(),
}

export default config
