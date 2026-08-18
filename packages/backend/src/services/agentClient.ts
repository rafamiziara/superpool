import { MastraClient } from '@mastra/client-js'
import * as jwt from 'jsonwebtoken'
import { logger } from 'firebase-functions/v2'

/**
 * How the backend talks to the agent service (`packages/agents`).
 *
 * The app never does. Every call to the agent originates here, after this
 * backend has decided who the caller is and what they may see — which is why
 * the agent itself holds no entitlement rules and reads nothing about a pool.
 * See `.dev/old/AI_ASSESSMENT_PLAN.md` §3.
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
 * How long to wait before giving up — and it is **not one number**.
 *
 * The probe and the assessment want opposite things, which a single timeout
 * got wrong in a way only a live run showed: `ping` calls no model and should
 * fail fast, while an assessment waits on one and routinely needs longer than
 * ten seconds. Sharing a ten-second bound made a working model call look like
 * an unreachable agent, intermittently — the worst shape of bug, because the
 * fallback path it lands in is silent by design.
 */
const PING_TIMEOUT_MS = 10_000

/**
 * Bounded under `assessLoan`'s own `timeoutSeconds`, so this fires first and
 * the caller gets "no assessment available" rather than a dead callable.
 */
const ASSESSMENT_TIMEOUT_MS = 90_000

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

export function clientFor(config: AgentServiceConfig, timeoutMs: number): MastraClient {
  return new MastraClient({
    baseUrl: config.baseUrl,
    headers: { Authorization: `Bearer ${signServiceToken(config.secret)}` },
    // No retries. The caller is a callable with someone waiting, and a retried
    // timeout is just a longer timeout — the sweep-and-retry patterns this
    // backend uses elsewhere exist for indexing, which nobody is watching.
    retries: 0,
    abortSignal: AbortSignal.timeout(timeoutMs),
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
    const run = await clientFor(config, PING_TIMEOUT_MS).getWorkflow('pingWorkflow').createRun()
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

/**
 * What the assessment workflow is sent.
 *
 * Mirrors `assessmentFactsSchema` in `packages/agents`, which validates it at
 * the HTTP boundary — so a drift between these two shapes is a 400 naming the
 * field, not a confident judgement about `undefined`. Every figure is in whole
 * units of the pool's asset; see `gatherFacts`.
 */
export interface AgentAssessmentFacts extends Record<string, unknown> {
  request: { amount: number; termDays: number; interestRatePercent: number; repaymentTotal: number; purpose?: string }
  pool: { name: string; symbol: string; liquidity: number; maxLoanAmount: number; pendingRequests: number }
  borrower: {
    isNew: boolean
    total: number
    repaid: number
    onTime: number
    late: number
    undated: number
    outstanding: number
    overdue: number
    defaulted: number
  }
}

/**
 * What the assessment workflow returns, when it returns.
 *
 * Mirrors `assessmentSchema` in `packages/agents`. Duplicated rather than
 * imported: the two packages talk over HTTP and one is ESM, so the schema on
 * the wire is the contract — and Mastra validates the *input* half of it at the
 * boundary, which is where a mismatch would actually be caught.
 */
export interface AgentAssessment {
  risk: 'low' | 'medium' | 'high'
  summary: string
  observations: string[]
  questions: string[]
  limitations: string[]
}

export type AssessResult =
  | { status: 'ok'; assessment: AgentAssessment }
  | { status: 'unreachable'; reason: string }
  | { status: 'not-configured' }

/**
 * Ask the agent to read one loan request.
 *
 * Never throws, for the same reason `pingAgentService` does not: the approvals
 * queue worked before this existed and has to keep working while the agent is
 * down. A caller gets a state to act on rather than an exception to handle.
 *
 * **A failed run does not explain itself across the wire.** Mastra returns the
 * status and an opaque error; the reason — a missing provider key, a rate
 * limit, a model refusal — is in the agent service's own logs. Worth knowing
 * before going looking for it here.
 */
export async function assessLoanWithAgent(facts: AgentAssessmentFacts): Promise<AssessResult> {
  const config = agentServiceConfig()

  if (!config) return { status: 'not-configured' }

  try {
    const run = await clientFor(config, ASSESSMENT_TIMEOUT_MS).getWorkflow('assessLoanWorkflow').createRun()
    const outcome = await run.startAsync({ inputData: facts })

    if (outcome.status !== 'success') {
      logger.warn('The assessment workflow did not succeed; its reason is in the agent service logs', {
        status: outcome.status,
      })

      return { status: 'unreachable', reason: `The assessment ended as ${outcome.status}` }
    }

    return { status: 'ok', assessment: outcome.result as AgentAssessment }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)

    logger.warn('The agent service did not answer an assessment', { baseUrl: config.baseUrl, reason })

    return { status: 'unreachable', reason }
  }
}
