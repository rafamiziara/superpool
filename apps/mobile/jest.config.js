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
  },
  moduleDirectories: ['node_modules', '<rootDir>/src'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/setupTests.ts',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/*.spec.{ts,tsx}',
    '!src/app/**',
    '!src/**/+*.tsx',
    '!src/firebase.config.ts',
    '!src/utils/appCheckProvider.ts',
  ],
  coverageDirectory: '<rootDir>/../../coverage/mobile',
  coverageReporters: ['lcov', 'text'],
  globals: {
    __DEV__: true,
  },
}
