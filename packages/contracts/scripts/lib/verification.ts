import { network, run } from 'hardhat'

/**
 * Explorer verification, in one place.
 *
 * This was written four times: `deploy.ts`, `deploy-local.ts` and
 * `verify-contracts.ts` each carried the same retry loop with the same
 * exponential backoff and the same "already verified" string match, and
 * `verify-proxy.ts` carried the error handling without the retry. A fix to the
 * backoff or to the match had to be made in three places or it was not made.
 *
 * See `.dev/contracts/CONTRACTS_BACKLOG.md` §4.
 */

/**
 * Networks with no explorer behind them.
 *
 * The fork networks are in here because they are a local node wearing another
 * chain's id: `polygonAmoyFork` answers on 127.0.0.1 and nothing it deploys
 * exists on Amoy. Verifying against them burned three retries and printed a
 * manual command that could never work.
 */
const LOCAL_NETWORKS = new Set(['hardhat', 'localhost', 'hardhatFork', 'polygonAmoyFork', 'polygonMainnetFork'])

export function isLocalNetwork(name: string = network.name): boolean {
  return LOCAL_NETWORKS.has(name)
}

/** One thing to verify: an implementation, a proxy, or a plain contract. */
export interface VerifyTarget {
  /** What to call it in the log — a contract name, not an identifier. */
  label: string
  address: string
  constructorArguments?: unknown[]
}

/**
 * `already-verified` is a success and is reported separately because the
 * callers say different things about it, not because they act differently.
 */
export type VerificationOutcome = 'verified' | 'already-verified'

/** Etherscan's phrasing has varied; the match is on the part that has not. */
function isAlreadyVerified(message: string): boolean {
  return message.toLowerCase().includes('already verified')
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

/** The line a human can paste when automated verification has given up. */
export function manualVerifyCommand(address: string, constructorArguments: unknown[] = []): string {
  const args = constructorArguments.length > 0 ? ` ${constructorArguments.join(' ')}` : ''

  return `pnpm hardhat verify --network ${network.name} ${address}${args}`
}

/**
 * Why verification cannot run at all, or `undefined` when it can.
 *
 * Returned rather than logged so the two kinds of caller can differ on it: a
 * deploy script carries on regardless, a verify script exits.
 */
export function verificationBlocker(): string | undefined {
  if (isLocalNetwork()) return `local network (${network.name}) has no explorer`

  if (!process.env.ETHERSCAN_API_KEY) return 'ETHERSCAN_API_KEY is not configured'

  return undefined
}

const DEFAULT_MAX_RETRIES = 3

/**
 * Verify one address, retrying with exponential backoff.
 *
 * Throws when the retries are exhausted — the caller decides whether that ends
 * anything. Applies no guards: `verificationBlocker` is the caller's to check,
 * because a deploy script checks it once per deployment and a verify script
 * checks it once per run.
 */
export async function verifyWithRetry(target: VerifyTarget, maxRetries: number = DEFAULT_MAX_RETRIES): Promise<VerificationOutcome> {
  const constructorArguments = target.constructorArguments ?? []

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`   🔄 Retry attempt ${attempt}/${maxRetries}...`)
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000))
      }

      await run('verify:verify', { address: target.address, constructorArguments })

      return 'verified'
    } catch (error: unknown) {
      const message = messageOf(error)

      if (isAlreadyVerified(message)) return 'already-verified'

      if (attempt === maxRetries) throw error

      console.log(`   ⚠️ Attempt ${attempt} failed: ${message}`)
    }
  }

  // Unreachable: the loop either returns or throws on its final pass.
  throw new Error(`Verification of ${target.label} ended without a result`)
}

/**
 * Verify several addresses, each retried on its own.
 *
 * Per target rather than per attempt, which is the bug this replaces: a proxy
 * whose implementation verified on the first pass and whose proxy then failed
 * was retried as a pair, the implementation answered "already verified", and
 * that was read as the **whole set** having succeeded — so the contract that
 * actually failed was reported as verified.
 */
export async function verifyAllWithRetry(
  targets: VerifyTarget[],
  maxRetries: number = DEFAULT_MAX_RETRIES
): Promise<VerificationOutcome[]> {
  const outcomes: VerificationOutcome[] = []

  for (const target of targets) {
    outcomes.push(await verifyWithRetry(target, maxRetries))
  }

  return outcomes
}

/**
 * The deploy scripts' shape: guarded, chatty, and it never throws.
 *
 * A deployment that succeeded must not be reported as a failure because an
 * explorer was rate-limiting, so an exhausted verification prints the manual
 * command and returns.
 */
export async function verifyContract(
  contractName: string,
  address: string,
  constructorArguments: unknown[] = [],
  maxRetries: number = DEFAULT_MAX_RETRIES
): Promise<VerificationOutcome | 'skipped' | 'failed'> {
  const blocker = verificationBlocker()

  if (blocker) {
    console.log(`   ⏭️ Skipping verification for ${contractName}: ${blocker}`)

    return 'skipped'
  }

  console.log(`\n🔍 Verifying ${contractName} at ${address}...`)

  try {
    const outcome = await verifyWithRetry({ label: contractName, address, constructorArguments }, maxRetries)

    console.log(outcome === 'already-verified' ? `   ✅ ${contractName} is already verified` : `   ✅ ${contractName} verified successfully`)

    return outcome
  } catch (error: unknown) {
    console.log(`   ❌ Failed to verify ${contractName}: ${messageOf(error)}`)
    console.log(`   🔧 Manual verification command:`)
    console.log(`      ${manualVerifyCommand(address, constructorArguments)}`)

    return 'failed'
  }
}
