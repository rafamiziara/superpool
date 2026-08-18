import { MastraJwtAuth } from '@mastra/auth'
import { Mastra } from '@mastra/core/mastra'
import { LibSQLStore } from '@mastra/libsql'
import { PinoLogger } from '@mastra/loggers'
import { assessmentAgent } from './agents/assessment-agent'
import { assessLoanWorkflow } from './workflows/assess-loan'
import { pingWorkflow } from './workflows/ping'

/**
 * The SuperPool agent service.
 *
 * **Its only client is `packages/backend`.** The mobile app never reaches this
 * service, which is the one thing that differs from `superwallet/packages/agents`
 * and the reason this file is so much shorter than that one: there is no user
 * here, no thread, no memory and no per-wallet data. The backend decides who
 * may ask for what, gathers the facts, and sends them. This side receives facts
 * and returns a judgement.
 *
 * The consequence worth stating: **nothing in this package may read Firestore,
 * the chain, or anything else about a pool.** If it ever needs to, the
 * entitlement rules have leaked out of the backend and into a second place.
 *
 * See `.dev/old/AI_ASSESSMENT_PLAN.md` §3.
 */

/**
 * Auth is on by default, because the alternative is an unauthenticated endpoint
 * that spends money.
 *
 * `MASTRA_DISABLE_AUTH=true` turns it off for local Studio, which cannot sign a
 * token — the same escape hatch superwallet uses, and the same rule: it must
 * never be set anywhere a real key is.
 */
const disableAuth = process.env.MASTRA_DISABLE_AUTH === 'true'

/**
 * One shared secret, and every caller that holds it is the backend.
 *
 * `authorizeUser` in `MastraJwtAuth` accepts any token that verifies, which
 * would be far too loose for a user-facing service and is exactly right here:
 * this boundary has one question, and it is "did this come from our backend".
 *
 * Passed explicitly rather than left to the library's own `JWT_AUTH_SECRET`
 * fallback, so the name in the environment matches the name in the plan and a
 * missing value fails loudly at boot instead of silently authenticating
 * against an empty string.
 */
const auth = disableAuth ? undefined : new MastraJwtAuth({ secret: requireSecret() })

function requireSecret(): string {
  const secret = process.env.MASTRA_JWT_SECRET

  if (!secret) {
    throw new Error('MASTRA_JWT_SECRET is not set. Set it, or set MASTRA_DISABLE_AUTH=true for local Studio.')
  }

  return secret
}

export const mastra = new Mastra({
  agents: { assessmentAgent },
  workflows: { assessLoanWorkflow, pingWorkflow },
  // In memory, deliberately. Nothing this service does is stateful: there are
  // no threads, no memory and no conversation to resume, and the assessment
  // itself is stored by the backend rather than here. What is lost on a
  // restart is the run history Studio reads, which is a local-development
  // convenience — revisit alongside the hosted deployment, not before.
  storage: new LibSQLStore({ id: 'agents-storage', url: ':memory:' }),
  logger: new PinoLogger({ name: 'superpool-agents', level: 'info' }),
  server: {
    ...(auth ? { auth } : {}),
  },
})
