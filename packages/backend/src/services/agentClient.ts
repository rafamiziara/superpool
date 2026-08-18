import { MastraClient } from '@mastra/client-js'
import * as jwt from 'jsonwebtoken'
import { logger } from 'firebase-functions/v2'

/**
 * How the backend talks to the agent service (`packages/agents`).
 *
 * The app never does. Every call to the agent originates here, after this
 * backend has decided who the caller is and what they may see — which is why
 * the agent itself holds no entitlement rules and reads nothing about a pool.
 * See `.dev/features/AI_ASSESSMENT_PLAN.md` §3.
 *
 * Three states, and they are not the same thing:
 *
 * - **Not configured** — no URL or no secret. The ordinary state of this repo
 *   today, and of any checkout that has not set the agent up. Not an error.
 * - **Unreachable** — configured and it did not answer. An error, but never
 *   one that fails the caller's real work: the approvals queue worked before
 *   any of this existed and has to keep working when the agent is down.
 * - **Reachable** — it answered.
 */

/** How long the service token is good for. Long enough for one call, and no longer. */
const TOKEN_TTL_SECONDS = 60

/**
 * How long to wait before giving up.
 *
 * Short on purpose. A caller is a Cloud Function with a person waiting on the
 * other end of it, and "the assistant is not available" arrives faster and
 * reads better than a timeout.
 */
const REQUEST_TIMEOUT_MS = 10_000

export interface AgentServiceConfig {
  baseUrl: string
  secret: string
}

/**
 * The agent service's address and shared secret, or nothing.
 *
 * Both or neither: a URL with no secret would send unauthenticated calls that
 * are refused, and a secret with no URL has nowhere to go. Returning `null`
 * rather than throwing is what makes the agent an optional dependency of this
 * backend rather than a required one.
 */
export function agentServiceConfig(): AgentServiceConfig | null {
  const baseUrl = process.env.AGENT_SERVICE_URL
  const secret = process.env.MASTRA_JWT_SECRET

  if (!baseUrl || !secret) return null

  return { baseUrl, secret }
}

/**
 * A short-lived bearer token proving the call came from this backend.
 *
 * HS256 on a secret only these two services hold. There is no user in it and
 * there must not be: the agent's question at this boundary is "is this our
 * backend", and giving it a wallet address would invite it to make decisions
 * that belong on this side.
 *
 * Signed per call rather than cached. It costs microseconds, and a cached
 * token is a token that outlives the request it was minted for.
 */
export function signServiceToken(secret: string): string {
  return jwt.sign({ sub: 'superpool-backend' }, secret, { expiresIn: TOKEN_TTL_SECONDS, algorithm: 'HS256' })
}

function clientFor(config: AgentServiceConfig): MastraClient {
  return new MastraClient({
    baseUrl: config.baseUrl,
    headers: { Authorization: `Bearer ${signServiceToken(config.secret)}` },
    // No retries. The caller is a callable with someone waiting, and a retried
    // timeout is just a longer timeout — the sweep-and-retry patterns this
    // backend uses elsewhere exist for indexing, which nobody is watching.
    retries: 0,
    abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
}

/** What the `ping` workflow answers with. Mirrors its output schema. */
export interface AgentPing {
  ok: true
  service: 'superpool-agents'
  echo: string
  at: string
}

export type AgentPingResult =
  | { status: 'reachable'; ping: AgentPing; latencyMs: number }
  | { status: 'unreachable'; reason: string }
  | { status: 'not-configured' }

/**
 * Ask the agent service whether it is there.
 *
 * Runs the `ping` workflow, which **calls no model** — so a failure here means
 * the seam is broken, never that a provider is down or unfunded. That
 * separation is the whole point of having a probe at all.
 *
 * Never throws. Reachability is a fact the caller wants to act on, not an
 * exception to handle.
 */
export async function pingAgentService(echo: string): Promise<AgentPingResult> {
  const config = agentServiceConfig()

  if (!config) return { status: 'not-configured' }

  const startedAt = Date.now()

  try {
    const run = await clientFor(config).getWorkflow('pingWorkflow').createRun()
    const outcome = await run.startAsync({ inputData: { echo } })

    if (outcome.status !== 'success') {
      return { status: 'unreachable', reason: `The ping workflow ended as ${outcome.status}` }
    }

    return { status: 'reachable', ping: outcome.result as AgentPing, latencyMs: Date.now() - startedAt }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)

    logger.warn('The agent service did not answer', { baseUrl: config.baseUrl, reason })

    return { status: 'unreachable', reason }
  }
}
