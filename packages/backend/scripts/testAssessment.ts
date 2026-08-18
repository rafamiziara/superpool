/**
 * Manual integration test for loan assessment — the whole path, model included.
 *
 * Drives a real request through a live Hardhat node, indexes it, and has the
 * agent read it. **This one spends money**: it makes real model calls, three
 * or four per run. That is the point — everything up to the model is covered
 * by unit tests, and what those cannot see is whether the facts we assemble
 * produce a reading a pool owner could act on.
 *
 * Prerequisites:
 *   Terminal 1 → cd packages/contracts && pnpm node:local
 *   Terminal 2 → cd packages/contracts && pnpm deploy:local
 *   Terminal 3 → cd config             && npx firebase-tools emulators:start --only firestore --project genesis-super-pool
 *   Terminal 4 → cd packages/agents    && pnpm dev
 *   Terminal 5 → cd packages/backend   && pnpm testAssessment
 *
 * Required .env values (packages/backend/.env):
 *   POOL_FACTORY_ADDRESS=<address printed by deploy:local>
 *   CHAIN_ID=31337
 *   RPC_URL=http://127.0.0.1:8545
 *   AGENT_SERVICE_URL=http://localhost:4111
 *   MASTRA_JWT_SECRET=<the same value as packages/agents/.env>
 *
 * And in packages/agents/.env: `ANTHROPIC_API_KEY`. Without it every reading
 * comes back `unavailable: 'unreachable'` — which is itself one of the checks,
 * so a keyless run still proves the degraded path.
 *
 * Unlike the other scripts this one uses the **shared** Firestore instance
 * rather than a project of its own, because it drives the callables and they
 * hold that instance. Each run creates its own pool, so the assertions are
 * scoped to this run's ids regardless of what earlier runs left behind.
 */

// ── Must be set before any firebase-admin import ──────────────────────────────
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080'

import * as dotenv from 'dotenv'
dotenv.config()

import { BaseContract, Contract, JsonRpcProvider, parseEther, Wallet, ZeroAddress } from 'ethers'
import type { CallableRequest } from 'firebase-functions/v2/https'
import type { AssessLoanRequest, GetAssessmentRequest } from '@superpool/types'
import { LendingPoolABI, PoolFactoryABI } from '../src/constants/abis'
import { assessLoanHandler } from '../src/functions/assessments/assessLoan'
import { getAssessmentHandler } from '../src/functions/assessments/getAssessment'
import { firestore } from '../src/services'
import { pingAgentService } from '../src/services/agentClient'
import { indexPoolByTxHash } from '../src/services/eventIndexer'
import { indexLoansByTxHash, loanDocId } from '../src/services/loanIndexer'
import { indexMembershipsByTxHash } from '../src/services/membershipIndexer'
import { stagedRecordId, stageNote } from '../src/services/notes'

// ── Config ────────────────────────────────────────────────────────────────────

const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545'
const CHAIN_ID = parseInt(process.env.CHAIN_ID || '31337')
const FACTORY_ADDRESS = process.env.POOL_FACTORY_ADDRESS || ''

const TERM_SECONDS = 30 * 24 * 60 * 60

/** Hardhat's published accounts — see the note in `testDefaults.ts`. */
const KEYS = {
  owner: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  lender: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  borrower: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  newcomer: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
}

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

// ── Chain setup ───────────────────────────────────────────────────────────────

/** See `testBorrowerHistory.ts`: the narrowing ethers expects, not a cast to `any`. */
function as(contract: BaseContract): Contract {
  return contract as Contract
}

const nonces = new Map<string, number>()

async function nextNonce(provider: JsonRpcProvider, address: string): Promise<number> {
  if (!nonces.has(address)) nonces.set(address, await provider.getTransactionCount(address, 'latest'))

  const nonce = nonces.get(address)!
  nonces.set(address, nonce + 1)

  return nonce
}

interface PoolHandle {
  poolId: number
  address: string
  contract: Contract
}

async function createPool(provider: JsonRpcProvider, owner: Wallet, name: string): Promise<PoolHandle> {
  const factory = new Contract(FACTORY_ADDRESS, PoolFactoryABI, owner)

  const tx = await factory.createPool(
    {
      maxLoanAmount: parseEther('100'),
      interestRate: 500,
      loanDuration: TERM_SECONDS,
      name: `${name}-${Date.now()}`,
      description: 'assessment verification',
      requiresMembership: true,
      loanToken: ZeroAddress,
    },
    { nonce: await nextNonce(provider, owner.address) }
  )
  const receipt = await tx.wait()

  const created = receipt.logs
    .map((log: { topics: string[]; data: string }) => {
      try {
        return factory.interface.parseLog(log)
      } catch {
        return null
      }
    })
    .find((parsed: { name: string } | null) => parsed?.name === 'PoolCreated')

  await indexPoolByTxHash(receipt.hash as string, CHAIN_ID, provider, firestore)

  return {
    poolId: Number(created.args.poolId),
    address: created.args.poolAddress as string,
    contract: new Contract(created.args.poolAddress as string, LendingPoolABI, owner),
  }
}

async function admit(provider: JsonRpcProvider, pool: PoolHandle, owner: Wallet, member: Wallet) {
  const request = await as(pool.contract.connect(member)).requestMembership({ nonce: await nextNonce(provider, member.address) })
  const requestReceipt = await request.wait()
  await indexMembershipsByTxHash(requestReceipt.hash as string, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)

  const approve = await pool.contract.approveMember(member.address, { nonce: await nextNonce(provider, owner.address) })
  const approveReceipt = await approve.wait()
  await indexMembershipsByTxHash(approveReceipt.hash as string, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)
}

/** A request, with an optional stated purpose, indexed and ready to assess. */
async function request(provider: JsonRpcProvider, pool: PoolHandle, borrower: Wallet, amount: bigint, purpose?: string): Promise<string> {
  const tx = await as(pool.contract.connect(borrower)).requestLoan(amount, { nonce: await nextNonce(provider, borrower.address) })
  const receipt = await tx.wait()
  const loanId = Number((await pool.contract.nextLoanId()) - 1n)

  if (purpose) {
    await stageNote(
      {
        recordId: stagedRecordId(CHAIN_ID, receipt.hash as string),
        kind: 'loan_purpose',
        text: purpose,
        author: borrower.address,
        subject: borrower.address,
        chainId: CHAIN_ID,
        poolId: 0,
      },
      firestore
    )
  }

  await indexLoansByTxHash(receipt.hash as string, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)

  return loanDocId(CHAIN_ID, pool.poolId, loanId)
}

/** A `CallableRequest` with only the fields these handlers read. */
function callable<T>(uid: string, data: T): CallableRequest<T> {
  return { auth: { uid, token: {} }, data } as unknown as CallableRequest<T>
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!FACTORY_ADDRESS) {
    console.error('POOL_FACTORY_ADDRESS is not set in packages/backend/.env')
    process.exitCode = 1
    return
  }

  const provider = new JsonRpcProvider(RPC_URL, undefined, { cacheTimeout: -1 })

  const owner = new Wallet(KEYS.owner, provider)
  const lender = new Wallet(KEYS.lender, provider)
  const borrower = new Wallet(KEYS.borrower, provider)
  const newcomer = new Wallet(KEYS.newcomer, provider)

  console.log(`\nFactory:   ${FACTORY_ADDRESS}`)
  console.log(`Chain:     ${CHAIN_ID}`)
  console.log(`Agent:     ${process.env.AGENT_SERVICE_URL}`)

  const reachable = await pingAgentService('assessment')
  console.log(`Reachable: ${reachable.status}\n`)

  // ---------------------------------------------------------------------------
  separator('A pool that reviews requests, funded and joined')
  // ---------------------------------------------------------------------------
  const pool = await createPool(provider, owner, 'assess')
  await admit(provider, pool, owner, lender)
  await admit(provider, pool, owner, borrower)
  await admit(provider, pool, owner, newcomer)

  const deposit = await as(pool.contract.connect(lender)).depositFunds({
    value: parseEther('80'),
    nonce: await nextNonce(provider, lender.address),
  })
  await deposit.wait()

  const requireApproval = await pool.contract.setRequiresApproval(true, { nonce: await nextNonce(provider, owner.address) })
  await requireApproval.wait()

  console.log(`  pool #${pool.poolId}, 80 POL to lend`)

  // ---------------------------------------------------------------------------
  separator('Only the pool’s owner may ask')
  // ---------------------------------------------------------------------------
  const loanDoc = await request(provider, pool, borrower, parseEther('10'), 'A new roof before the winter rains.')

  // Checked before a chain read or a model call, which is what stops an
  // unentitled caller from spending money as well as from reading anything.
  const refusedBorrower = await assessLoanHandler(callable<AssessLoanRequest>(borrower.address, { loanId: loanDoc })).then(
    () => null,
    (error: Error) => error.message
  )

  check('the borrower is refused', refusedBorrower !== null && /only the pool/i.test(refusedBorrower), String(refusedBorrower))

  const borrowerRead = await getAssessmentHandler(callable<GetAssessmentRequest>(borrower.address, { loanId: loanDoc }))

  // Nothing rather than a refusal: an error would confirm one exists, which is
  // itself something they are not entitled to know.
  check('and shown nothing, without being told why', Object.keys(borrowerRead).length === 0, JSON.stringify(borrowerRead))

  // ---------------------------------------------------------------------------
  separator('The owner asks, and a model answers')
  // ---------------------------------------------------------------------------
  const first = await assessLoanHandler(callable<AssessLoanRequest>(owner.address, { loanId: loanDoc }))

  if (!first.assessment) {
    check('an assessment came back', false, JSON.stringify(first))
    console.log('\n  Skipping the rest: set ANTHROPIC_API_KEY in packages/agents/.env to exercise the model.')
  } else {
    const reading = first.assessment

    console.log(`\n  ${reading.risk.toUpperCase()} — ${reading.summary}\n`)
    reading.observations.forEach((line) => console.log(`    · ${line}`))
    reading.limitations.forEach((line) => console.log(`    ? ${line}`))
    console.log()

    check('an assessment came back, freshly made', first.cached === false)
    check('the risk is one of the three bands', ['low', 'medium', 'high'].includes(reading.risk), reading.risk)
    check('it says something', reading.summary.length > 0)

    // An assessment that never says what it could not see reads as complete.
    check('and says what it could not see', reading.limitations.length > 0, JSON.stringify(reading.limitations))

    // Three bands exist so that nothing can be thresholded into a gate. A
    // number in the prose would reintroduce exactly that.
    const scored = /\b\d{1,3}\s*(?:\/\s*100|% (?:risk|confiden|likel|probab))/i.test(reading.summary)
    check('and quotes no score', !scored, reading.summary)

    // The figures it was told, kept beside the answer so a surprising reading
    // can be explained rather than argued with.
    check(
      'the inputs it read are stored beside it',
      reading.inputs.amount === 10 && reading.inputs.symbol === 'POL',
      JSON.stringify(reading.inputs)
    )
    check('including the pool’s liquidity as the chain reported it', reading.inputs.liquidity === 80, String(reading.inputs.liquidity))
    check(
      'and that a purpose was stated, without copying it',
      reading.inputs.hadPurpose === true && !JSON.stringify(reading.inputs).includes('roof')
    )

    // ---------------------------------------------------------------------------
    separator('Read again, and it says the same thing')
    // ---------------------------------------------------------------------------
    const second = await assessLoanHandler(callable<AssessLoanRequest>(owner.address, { loanId: loanDoc }))

    // An LLM judgement is not reproducible, so a decision surface that recomputed
    // on every open would say something different each time it was opened.
    check('the second call is served from storage', second.cached === true)
    check('and says exactly what the first did', second.assessment?.summary === reading.summary)

    const refreshed = await assessLoanHandler(callable<AssessLoanRequest>(owner.address, { loanId: loanDoc, refresh: true }))

    check('an explicit refresh makes a new one', refreshed.cached === false)
    check(
      'and keeps the previous reading, so a change is visible',
      (refreshed.assessment?.history?.length ?? 0) >= 1,
      JSON.stringify(refreshed.assessment?.history)
    )
  }

  // ---------------------------------------------------------------------------
  separator('A first-time borrower is new, not risky')
  // ---------------------------------------------------------------------------
  // The single failure mode that would make this product unusable for the
  // people it exists for. Asserted against a real model, on a modest request
  // at a well-funded pool, where there is nothing else to hold against them.
  const newcomerLoan = await request(provider, pool, newcomer, parseEther('5'), 'Stock for the market stall.')
  const newcomerReading = await assessLoanHandler(callable<AssessLoanRequest>(owner.address, { loanId: newcomerLoan }))

  if (newcomerReading.assessment) {
    const reading = newcomerReading.assessment

    console.log(`\n  ${reading.risk.toUpperCase()} — ${reading.summary}\n`)

    check('the borrower is recorded as new', reading.inputs.borrower.isNew === true, JSON.stringify(reading.inputs.borrower))
    check('and a modest ask from them is not called high risk', reading.risk !== 'high', `${reading.risk}: ${reading.summary}`)
    check(
      'the missing record is named as a limitation rather than held against them',
      reading.limitations.some((line) => /no|never|first|record|histor/i.test(line)),
      JSON.stringify(reading.limitations)
    )
  } else {
    check('a first-time borrower could be assessed', false, JSON.stringify(newcomerReading))
  }

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
