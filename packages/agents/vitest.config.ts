import { defineConfig } from 'vitest/config'

/**
 * Only the parts of this package that can be tested without a model.
 *
 * `include` deliberately covers the prompt and schema modules rather than the whole of
 * `src`: the agent and the Mastra instance need a provider key and a running server, and
 * what they produce is judged by scorers (Phase 5 of the assessment plan) rather than by
 * assertions.
 *
 * No coverage threshold for the same reason — a percentage over a package that is mostly
 * a prompt would measure the wrong thing.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.mastra/**'],
    clearMocks: true,
  },
})
