module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.(ts|tsx|js)', '**/*.(test|spec).(ts|tsx|js)'],
  testEnvironment: 'jsdom',
  transformIgnorePatterns: [
    'node_modules/(?!(?:.pnpm/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@wagmi|wagmi|@tanstack|viem|@reown))',
  ],
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@superpool/(.*)$': '<rootDir>/../../packages/$1/src',
    '^@mocks/(.*)$': '<rootDir>/__mocks__/$1',
  },
  moduleDirectories: ['node_modules', '<rootDir>/src'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/setupTests.ts',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/*.spec.{ts,tsx}',
    '!src/app/**', // App screens excluded for now
    '!src/**/+*.tsx', // Expo router files
    '!src/firebase.config.ts', // Configuration file
    '!src/config/**', // Configuration directory
    '!src/globals.d.ts', // Type definitions
    '!src/assets/**', // Static assets
  ],
  coverageDirectory: '<rootDir>/../../coverage/mobile',
  coverageReporters: ['lcov', 'text'],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95,
    },
    // Specific thresholds for critical areas
    'src/stores/**': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95,
    },
    'src/services/**': {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95,
    },
    'src/hooks/**': {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95,
    },
  },
  globals: {
    __DEV__: true,
  },
}
