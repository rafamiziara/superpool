module.exports = {
  env: {
    node: true,
    es6: true,
  },
  extends: ['eslint:recommended'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  ignorePatterns: ['dist', 'node_modules', 'lib', '.expo', 'coverage'],
  globals: {
    __DEV__: 'readonly',
    React: 'readonly',
    NodeJS: 'readonly',
  },
  rules: {
    'quotes': ['error', 'single'],
    'indent': ['error', 2, { 'SwitchCase': 1 }],
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { 'argsIgnorePattern': '^_', 'varsIgnorePattern': '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  overrides: [
    {
      // Jest configuration for test files and mocks
      files: ['**/__tests__/**/*', '**/*.test.*', '**/*.spec.*', '**/__mocks__/**/*', '**/setupTests.*'],
      env: {
        jest: true,
        node: true,
      },
      globals: {
        jest: 'readonly',
      },
    },
    {
      // TypeScript files
      files: ['**/*.ts', '**/*.tsx'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-unused-vars': ['error', { 'argsIgnorePattern': '^_', 'varsIgnorePattern': '^_' }],
      },
    },
    {
      // Enum values are exported for external use
      files: ['**/errorHandling.ts'],
      rules: {
        '@typescript-eslint/no-unused-vars': 'off',
      },
    },
    {
      // Configuration files need CommonJS require() syntax
      files: ['*.config.cjs', '*.cjs', 'babel.config.cjs', 'metro.config.cjs', 'tailwind.config.cjs', 'jest.config.cjs', 'jest.babel.config.cjs'],
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
  ],
};