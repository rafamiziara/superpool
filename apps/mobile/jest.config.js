module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  moduleDirectories: ['node_modules', '<rootDir>/src'],

  // Use jsdom environment to avoid React Native native module issues
  testEnvironment: 'jsdom',

  // Transform ES6 modules from node_modules
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|expo|@expo|expo-.*|@reown|@walletconnect|wagmi|viem|@tanstack|mobx|mobx-react-lite|react-native-toast-message|@react-native-async-storage|@react-native-community)/)',
  ],

  // Module mapping for workspace dependencies
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@superpool/assets/(.*)$': '<rootDir>/../../packages/assets/$1',
    '^@superpool/(.*)$': '<rootDir>/../../packages/$1/src',
  },

  // Test files are co-located with implementation files
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}', '<rootDir>/app/**/*.test.{ts,tsx}'],

  // Ignore problematic paths
  testPathIgnorePatterns: ['/node_modules/', '/build/', '/.expo/'],

  // Coverage configuration
  coverageDirectory: '../../coverage/mobile-v2',
  coverageReporters: ['text', 'lcov', 'html'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    'app/**/*.{ts,tsx}',
    '!src/**/*.test.{ts,tsx}',
    '!app/**/*.test.{ts,tsx}',
    '!src/__tests__/**',
    '!src/**/*.d.ts',
    '!app/**/+*.tsx', // Expo router files
    '!src/config/**', // Configuration directory
    '!src/assets/**', // Static assets
    '!src/**/index.ts', // Barrel export files
    '!src/**/types/**', // TypeScript interface definitions only
  ],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },

  // Avoid Expo runtime issues in tests
  globals: {
    __DEV__: true,
  },

  // Set longer timeout for tests
  testTimeout: 10000,
}
