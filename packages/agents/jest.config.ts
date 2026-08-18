import type { Config } from 'jest'

/**
 * Only the parts of this package that can be tested without a model.
 *
 * `testMatch` deliberately covers the prompt and schema modules rather than
 * the whole of `src`: the agent and the Mastra instance need a provider key
 * and a running server, and what they produce is judged by scorers (Phase 5 of
 * the assessment plan) rather than by assertions.
 *
 * No coverage threshold for the same reason — a percentage over a package that
 * is mostly a prompt would measure the wrong thing.
 */
const config: Config = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/.mastra/'],

  transform: {
    '^.+\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: { module: 'esnext', target: 'es2022' },
      },
    ],
  },

  extensionsToTreatAsEsm: ['.ts'],
  clearMocks: true,
}

export default config
