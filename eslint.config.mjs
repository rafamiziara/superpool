import js from '@eslint/js'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'
import prettier from 'eslint-config-prettier'
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'
import globals from 'globals'
import customPrettier from './prettier.config.mjs'

export default [
  eslintPluginPrettierRecommended,

  // Global ignores - applies to all configurations
  {
    ignores: [
      // Build artifacts and dependencies
      '**/dist/**',
      '**/node_modules/**',
      '**/lib/**',
      '**/build/**',
      '**/.next/**',
      '**/.expo/**',

      // Generated files
      '**/typechain-types/**',
      '**/artifacts/**',
      '**/cache/**',

      // Coverage reports
      '**/coverage/**',
      '**/lcov-report/**',

      // Config files that don't need linting
      '**/scripts/dev-start.js',
      '**/merge-coverage.js',
      'packages/backend/scripts/generateKey.ts',
      'packages/backend/scripts/signMessage.ts',

      // Build configs outside of TypeScript projects
      '**/tsup.config.ts',
      '**/tailwind.config.js',
      '**/jest.config.ts',
      '**/jest.config.js',

      // Packages without TypeScript files
      'packages/assets/**',
      'packages/design/**',
    ],
  },

  // JavaScript files configuration (no TypeScript parser needed)
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2022,
        __DEV__: 'readonly',
        jest: 'readonly',
      },
    },
    rules: {
      ...js.configs.recommended.rules,
    },
  },

  // TypeScript files configuration with project references
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: [
          './tsconfig.json',
          './apps/*/tsconfig.json',
          './packages/backend/tsconfig.json',
          './packages/contracts/tsconfig.json',
          './packages/types/tsconfig.json',
          './packages/ui/tsconfig.json',
        ],
      },
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.es2022,
        __DEV__: 'readonly',
        NodeJS: 'readonly',
        React: 'readonly',
        jest: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,

      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/triple-slash-reference': 'off', // Allow for Next.js and React Native
      '@typescript-eslint/no-require-imports': 'off', // Allow for React Native assets

      // Import sorting configuration (relaxed for now)
      'sort-imports': [
        'warn',
        {
          ignoreCase: true,
          ignoreDeclarationSort: true, // Don't sort import declarations
          ignoreMemberSort: false,
          memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
          allowSeparatedGroups: true,
        },
      ],
    },
  },

  // Specific overrides for test files
  {
    files: ['**/*.test.{js,ts,tsx}', '**/__mocks__/**/*.{js,ts}'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
        ...globals.mocha,
        jest: 'readonly',
        expect: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        before: 'readonly',
        after: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-expressions': 'off', // Allow chai expect statements
      'no-unused-expressions': 'off', // Allow chai expect statements
    },
  },

  {
    rules: {
      'prettier/prettier': ['error', customPrettier],
    },
  },

  // Prettier config to disable conflicting rules
  prettier,
]
