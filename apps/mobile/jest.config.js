module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  
  // File patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/android/',
    '/ios/',
    '/.expo/',
    '/src/app/', // Exclude Expo Router app directory
  ],
  
  // TypeScript transformation
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
    }],
    '^.+\\.(js|jsx)$': ['babel-jest', { configFile: './jest.babel.config.js' }],
  },
  
  // File extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  
  // Coverage settings - exclude problematic files
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/setupTests.ts',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/*.spec.{ts,tsx}',
    '!src/app/**', // Exclude Expo Router app directory
    '!src/**/+*.tsx', // Exclude Expo Router files like +not-found.tsx
    '!src/firebase.config.ts', // Exclude Firebase config that imports Expo modules
    '!src/utils/appCheckProvider.ts', // Exclude App Check provider that imports Expo modules
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  
  // Module mapping for mocks
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  
  // Ignore transform for certain files
  transformIgnorePatterns: [
    'node_modules/(?!(expo|@expo|expo-router|@react-native|react-native|@react-navigation)/)',
  ],
};