import globals from 'globals'
import rootConfig from '../../eslint.config.mjs'

export default [
  // Extend root configuration
  ...rootConfig,

  // Mobile app specific configuration
  {
    files: ['**/*.{js,ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2022,
        __DEV__: 'readonly',
        React: 'readonly',
        NodeJS: 'readonly',
      },
    },
  },

  // Jest configuration for test files
  {
    files: ['**/__tests__/**/*', '**/*.test.*', '**/*.spec.*', '**/__mocks__/**/*', '**/setupTests.*'],
    languageOptions: {
      globals: {
        ...globals.jest,
        ...globals.node,
        jest: 'readonly',
      },
    },
  },

  // Configuration files need CommonJS require() syntax
  {
    files: [
      '*.config.cjs',
      '*.cjs',
      'babel.config.cjs',
      'metro.config.cjs',
      'tailwind.config.cjs',
      'jest.config.cjs',
      'jest.babel.config.cjs',
    ],
    languageOptions: {
      sourceType: 'commonjs',
    },
    rules: {
      '@typescript-eslint/no-var-requires': 'off',
    },
  },

  // Additional ignores for mobile app
  {
    ignores: ['dist/**', 'node_modules/**', 'lib/**', '.expo/**', 'coverage/**'],
  },
]
