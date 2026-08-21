/**
 * Manual integration test for the backend → agent-service seam.
 *
 * Phase 0 of [`.dev/old/AI_ASSESSMENT_PLAN.md`](../../../.dev/old/AI_ASSESSMENT_PLAN.md).
 * It proves the boundary and nothing else: a signed service token, the
 * transport, a structured object coming back, and each of the ways it can
 * fail. **No model is involved** — the `ping` workflow calls none — so a
 * failure here is unambiguously the seam rather than a provider being down or
 * unfunded. That separation is the reason the probe exists.
 *
 * Prerequisites:
 *   Terminal 1 → cd packages/agents  && pnpm dev
 *   Terminal 2 → cd packages/backend && pnpm testAgentSeam
 *
 * Required .env values (packages/backend/.env):
 *   AGENT_SERVICE_URL=http://localhost:4111
 *   MASTRA_JWT_SECRET=<the same value as packages/agents/.env>
 *
 * Nothing is written to Firestore and nothing costs money, so this is safe to
 * run as often as you like.
 */

import * as dotenv from 'dotenv'
dotenv.config()

import { agentServiceConfig, pingAgentService, signServiceToken } from '../src/services/agentClient'

// ── Reporting ─────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

function separator(title: string) {
  console.log(`\n${'─'.repeat(64)}`)
  console.log(`  ${title}`)
  console.log('─'.repeat(64))
}

function check(label: string, condition: boolean, detail = '') {
  if (condition) {
    passed++
    console.log(`  ✅ ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

/** Run one case with the environment the case is about, then put it back. */
async function withEnv<T>(overrides: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
  const previous = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]))

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }

  try {
    return await run()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const configured = agentServiceConfig()

  if (!configured) {
    console.error('AGENT_SERVICE_URL or MASTRA_JWT_SECRET is not set in packages/backend/.env')
    process.exitCode = 1
    return
  }

  console.log(`\nAgent:  ${configured.baseUrl}`)
  console.log(`Secret: set (${configured.secret.length} characters)`)

  // ---------------------------------------------------------------------------
  separator('The service answers a signed request')
  // ---------------------------------------------------------------------------
  const result = await pingAgentService('phase-0')

  check('the seam is reachable', result.status === 'reachable', JSON.stringify(result))

  if (result.status === 'reachable') {
    // Echo is what proves the answer belongs to *this* request rather than to
    // any request — a health check that cannot tell those apart is a ping to
    // something, not to the thing you asked.
    check('it echoes what was sent', result.ping.echo === 'phase-0', result.ping.echo)
    check('it names itself', result.ping.service === 'superpool-agents', result.ping.service)
    check('and dates itself from its own clock', !Number.isNaN(Date.parse(result.ping.at)), result.ping.at)
    check('the round trip is quick enough to sit in a callable', result.latencyMs < 5000, `${result.latencyMs}ms`)
  }

  // ---------------------------------------------------------------------------
  separator('An absent agent is not an error')
  // ---------------------------------------------------------------------------
  // The ordinary state of a checkout that has not set the agent up, and it must
  // stay distinguishable from "configured and broken" — one needs no attention
  // and the other needs somebody's.
  const noUrl = await withEnv({ AGENT_SERVICE_URL: undefined }, () => pingAgentService('phase-0'))
  const noSecret = await withEnv({ MASTRA_JWT_SECRET: undefined }, () => pingAgentService('phase-0'))

  check('no URL reads as not configured', noUrl.status === 'not-configured', noUrl.status)
  check('no secret reads as not configured, not as unauthorized', noSecret.status === 'not-configured', noSecret.status)

  // ---------------------------------------------------------------------------
  separator('A broken seam fails cleanly, and says how')
  // ---------------------------------------------------------------------------
  // Nothing here may throw: the approvals queue worked before any of this
  // existed and has to keep working while the agent is down.
  const wrongPort = await withEnv({ AGENT_SERVICE_URL: 'http://localhost:4199' }, () => pingAgentService('phase-0'))

  check('an agent that is not listening is unreachable', wrongPort.status === 'unreachable', JSON.stringify(wrongPort))

  const wrongSecret = await withEnv({ MASTRA_JWT_SECRET: 'not-the-shared-secret' }, () => pingAgentService('phase-0'))

  check('a token signed with the wrong secret is refused', wrongSecret.status === 'unreachable', JSON.stringify(wrongSecret))

  // The check that says the auth is doing something. If this passed with an
  // unsigned request, the service would be open to anyone who found the port.
  const unsigned = await fetch(`${configured.baseUrl}/api/workflows`)

  check('an unsigned request is refused outright', unsigned.status === 401, `HTTP ${unsigned.status}`)

  // ---------------------------------------------------------------------------
  separator('The token carries a service, and no user')
  // ---------------------------------------------------------------------------
  // Deliberate: the agent's only question at this boundary is whether the call
  // came from this backend. A wallet address in here would invite it to make
  // decisions that belong on this side.
  const [, payload] = signServiceToken(configured.secret).split('.')
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<string, unknown>

  check('the subject is the backend', claims.sub === 'superpool-backend', String(claims.sub))
  check('it expires', typeof claims.exp === 'number', JSON.stringify(claims))
  check('and it expires soon', Number(claims.exp) - Number(claims.iat) <= 60, `${Number(claims.exp) - Number(claims.iat)}s`)
  check('it carries no wallet', !('walletAddress' in claims) && !('address' in claims), JSON.stringify(claims))

  // ---------------------------------------------------------------------------
  separator(`Result: ${passed} passed, ${failed} failed`)
  // ---------------------------------------------------------------------------
  if (failed > 0) {
    console.log('\nFailures:')
    failures.forEach((failure) => console.log(`  • ${failure}`))
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error('\nVerification run failed:', error)
  process.exitCode = 1
})
