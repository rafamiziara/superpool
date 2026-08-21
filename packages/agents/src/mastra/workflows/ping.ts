import { createStep, createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'

/**
 * The seam probe: does the backend reach this service, and is it who it says?
 *
 * **Deliberately calls no model.** What this proves is the boundary — the
 * signed service token, the transport, and a structured object coming back —
 * and none of that involves an LLM. Putting a model call in here would make a
 * failing probe ambiguous between "the seam is broken" and "the provider is
 * down or unfunded", which is the one thing a probe must never be.
 *
 * It also costs nothing to run, which is what lets the backend use it as a
 * readiness check rather than only as a test.
 */
const respond = createStep({
  id: 'respond',
  inputSchema: z.object({
    /** Echoed back, so a caller can prove the response is to *its* request. */
    echo: z.string().max(64),
  }),
  outputSchema: z.object({
    ok: z.literal(true),
    service: z.literal('superpool-agents'),
    echo: z.string(),
    /** ISO 8601, from the service's clock rather than the caller's. */
    at: z.string(),
  }),
  execute: async ({ inputData }) => ({
    ok: true as const,
    service: 'superpool-agents' as const,
    echo: inputData.echo,
    at: new Date().toISOString(),
  }),
})

export const pingWorkflow = createWorkflow({
  id: 'ping',
  inputSchema: z.object({ echo: z.string().max(64) }),
  outputSchema: z.object({
    ok: z.literal(true),
    service: z.literal('superpool-agents'),
    echo: z.string(),
    at: z.string(),
  }),
})
  .then(respond)
  .commit()
