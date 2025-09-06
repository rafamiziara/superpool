import globals from 'globals'
import rootConfig from '../../eslint.config.mjs'

export default [
  // Extend root configuration
  ...rootConfig,

  // Backend specific configuration
  {
    files: ['**/*.{js,ts}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        project: ['./tsconfig.json', '../../tsconfig.json'],
      },
    },
    rules: {
      // Backend specific rules
      'prefer-const': 'error',
    },
  },
]
