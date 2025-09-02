import globals from 'globals'
import rootConfig from '../../eslint.config.mjs'

export default [
  // Extend root configuration
  ...rootConfig,

  // Contracts specific configuration
  {
    files: ['**/*.{js,ts}'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.mocha,
      },
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },
    rules: {
      // Contracts specific rules
      'prefer-const': 'error',
    },
  },
]
