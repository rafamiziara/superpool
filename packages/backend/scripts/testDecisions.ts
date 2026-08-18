/**
 * Manual integration test for loan decisions — what an owner decided, and when.
 *
 * Drives real approvals, refusals, withdrawals and declarations through a live
 * local Hardhat node, sweeps them, and checks that each one is recorded as what
 * it actually was.
 *
 * The check this script exists for is the third one: `cancelLoanRequest` emits
 * `LoanRejected` and leaves the loan in exactly the state `rejectLoan` does, so
 * the two are indistinguishable from the record and only the transaction's
 * **sender** separates them. That is invisible to a mocked test, because a mock
 * has whatever sender the fixture says.
 *
 * Two more that only a real chain can show: a declaration's `outstanding` is
 * the debt *at that block*, so it is larger than the principal once interest
 * has accrued; and re-sweeping a range rebuilds exactly what is already there,
 * which is the property that makes backfilling possible at all.
 *
 * Prerequisites:
 *   Terminal 1 → cd packages/contracts && pnpm node:local
 *   Terminal 2 → cd packages/contracts && pnpm deploy:local
 *   Terminal 3 → cd config             && npx firebase-tools emulators:start --only firestore --project genesis-super-pool
 *   Terminal 4 → cd packages/backend   && pnpm testDecisions
 *
 * Required .env values:
 *   POOL_FACTORY_ADDRESS=<address printed by deploy:local>
 *   CHAIN_ID=31337
 *   RPC_URL=http://127.0.0.1:8545
 */

// ── Must be set before any firebase-admin import ──────────────────────────────
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080'

import * as dotenv from 'dotenv'
dotenv.config()

import { BaseContract, Contract, JsonRpcProvider, parseEther, Wallet, ZeroAddress } from 'ethers'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { LendingPoolABI, PoolFactoryABI } from '../src/constants/abis'
import { LOAN_DECISIONS_COLLECTION } from '../src/constants/firestore'
import { sweepBlockRange } from '../src/services/eventSweeper'
import { indexLoanDecisionsByTxHash, loanDecisionDocId } from '../src/services/loanDecisionIndexer'

// ── Config ────────────────────────────────────────────────────────────────────

const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545'
const CHAIN_ID = parseInt(process.env.CHAIN_ID || '31337')
const FACTORY_ADDRESS = process.env.POOL_FACTORY_ADDRESS || ''

/** Short enough that a loan can be pushed past its term inside one run. */
const TERM_SECONDS = 60

/**
 * Hardhat's published accounts. Safe here by construction and nowhere else —
 * these keys are in every Hardhat README on the internet.
 */
const KEYS = {
  owner: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  lender: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  approved: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  declined: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  withdrawn: '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
}

/** A Firestore of this run's own; see `testBorrowerHistory.ts` for why. */
const PROJECT_ID = `verify-decisions-${Date.now()}`
const firestore = getFirestore(initializeApp({ projectId: PROJECT_ID }, PROJECT_ID))

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

/** ethers caches `eth_getTransactionCount`; see `testDefaults.ts`. */
const nonces = new Map<string, number>()

async function nextNonce(provider: JsonRpcProvider, address: string): Promise<number> {
  if (!nonces.has(address)) {
    nonces.set(address, await provider.getTransactionCount(address, 'latest'))
  }

  const nonce = nonces.get(address)!
  nonces.set(address, nonce + 1)

  return nonce
}

/** Move the chain's clock forward. The only way to be late without waiting. */
async function advanceTime(provider: JsonRpcProvider, seconds: number) {
  await provider.send('evm_increaseTime', [seconds])
  await provider.send('evm_mine', [])
}

interface PoolHandle {
  poolId: number
  address: string
  contract: Contract
}

async function createPool(provider: JsonRpcProvider, owner: Wallet, name: string, reviewsRequests: boolean): Promise<PoolHandle> {
  const factory = new Contract(FACTORY_ADDRESS, PoolFactoryABI, owner)

  const tx = await factory.createPool(
    {
      maxLoanAmount: parseEther('100'),
      interestRate: 1000,
      loanDuration: TERM_SECONDS,
      name: `${name}-${Date.now()}`,
      description: 'decision verification',
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

  const pool = {
    poolId: Number(created.args.poolId),
    address: created.args.poolAddress as string,
    contract: new Contract(created.args.poolAddress as string, LendingPoolABI, owner),
  }

  if (reviewsRequests) {
    const setting = await pool.contract.setRequiresApproval(true, { nonce: await nextNonce(provider, owner.address) })
    await setting.wait()
  }

  return pool
}

async function admit(provider: JsonRpcProvider, pool: PoolHandle, owner: Wallet, member: Wallet) {
  const request = await as(pool.contract.connect(member)).requestMembership({ nonce: await nextNonce(provider, member.address) })
  await request.wait()

  const approve = await pool.contract.approveMember(member.address, { nonce: await nextNonce(provider, owner.address) })
  await approve.wait()
}

/** Ask for a loan at a pool that reviews requests. */
async function request(provider: JsonRpcProvider, pool: PoolHandle, borrower: Wallet, amount: bigint): Promise<number> {
  const tx = await as(pool.contract.connect(borrower)).requestLoan(amount, { nonce: await nextNonce(provider, borrower.address) })
  await tx.wait()

  return Number((await pool.contract.nextLoanId()) - 1n)
}

// ── Reading back ──────────────────────────────────────────────────────────────

interface StoredDecision {
  loanId: number
  poolId: number
  borrower: string
  amount: string
  outcome: string
  decidedBy: string
  blockNumber: number
  decidedAt: { toDate: () => Date }
}

async function decisionsFor(poolId: number): Promise<StoredDecision[]> {
  const snapshot = await firestore
    .collection(LOAN_DECISIONS_COLLECTION)
    .where('chainId', '==', CHAIN_ID)
    .where('poolId', '==', poolId)
    .get()

  return snapshot.docs.map((doc) => doc.data() as StoredDecision)
}

/** Every decision about one loan, oldest first — a loan can carry several. */
async function decisionsOn(poolId: number, loanId: number): Promise<StoredDecision[]> {
  const decisions = await decisionsFor(poolId)

  return decisions.filter((decision) => decision.loanId === loanId).sort((a, b) => a.blockNumber - b.blockNumber)
}

async function sweepFrom(provider: JsonRpcProvider, fromBlock: number): Promise<number> {
  const toBlock = await provider.getBlockNumber()

  const counts = await sweepBlockRange({
    provider,
    firestore,
    chainId: CHAIN_ID,
    factoryAddress: FACTORY_ADDRESS,
    fromBlock,
    toBlock,
  })

  return counts.loanDecisions
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!FACTORY_ADDRESS) {
    console.error('POOL_FACTORY_ADDRESS is not set in packages/backend/.env')
    process.exitCode = 1
    return
  }

  // `cacheTimeout: -1` disables ethers' 250ms read cache. This script moves the
  // chain's clock, and a cached read would answer from before the jump — which
  // looks exactly like a contract bug.
  const provider = new JsonRpcProvider(RPC_URL, undefined, { cacheTimeout: -1 })

  const owner = new Wallet(KEYS.owner, provider)
  const lender = new Wallet(KEYS.lender, provider)
  const approvedBorrower = new Wallet(KEYS.approved, provider)
  const declinedBorrower = new Wallet(KEYS.declined, provider)
  const withdrawnBorrower = new Wallet(KEYS.withdrawn, provider)

  console.log(`\nFactory:    ${FACTORY_ADDRESS}`)
  console.log(`Chain:      ${CHAIN_ID}`)
  console.log(`Firestore:  ${process.env.FIRESTORE_EMULATOR_HOST} (project ${PROJECT_ID})`)

  const startBlock = await provider.getBlockNumber()

  // ---------------------------------------------------------------------------
  separator('A pool that reviews its requests, with three borrowers')
  // ---------------------------------------------------------------------------
  const pool = await createPool(provider, owner, 'decisions', true)
  await admit(provider, pool, owner, lender)
  await admit(provider, pool, owner, approvedBorrower)
  await admit(provider, pool, owner, declinedBorrower)
  await admit(provider, pool, owner, withdrawnBorrower)

  const deposit = await as(pool.contract.connect(lender)).depositFunds({
    value: parseEther('30'),
    nonce: await nextNonce(provider, lender.address),
  })
  await deposit.wait()

  check('the pool reviews requests before lending', (await pool.contract.requiresApproval()) === true)

  // ---------------------------------------------------------------------------
  separator('An approval')
  // ---------------------------------------------------------------------------
  const approvedLoan = await request(provider, pool, approvedBorrower, parseEther('2'))

  await sweepFrom(provider, startBlock)
  check('a request on its own decides nothing', (await decisionsOn(pool.poolId, approvedLoan)).length === 0)

  const approval = await pool.contract.approveLoan(approvedLoan, { nonce: await nextNonce(provider, owner.address) })
  const approvalReceipt = await approval.wait()

  await sweepFrom(provider, startBlock)
  const [approvalRecord] = await decisionsOn(pool.poolId, approvedLoan)

  check('the approval is recorded', approvalRecord !== undefined)
  check('as an approval', approvalRecord?.outcome === 'approved', approvalRecord?.outcome)
  check('by the owner who sent it', approvalRecord?.decidedBy === owner.address.toLowerCase(), approvalRecord?.decidedBy)
  check('about the borrower who asked', approvalRecord?.borrower === approvedBorrower.address.toLowerCase())
  check('for the amount that was lent', approvalRecord?.amount === parseEther('2').toString(), approvalRecord?.amount)

  const approvalBlock = await provider.getBlock(approvalReceipt.blockNumber)
  check(
    'dated by its own block, not by the sweep',
    approvalRecord?.decidedAt.toDate().getTime() === approvalBlock!.timestamp * 1000,
    `${approvalRecord?.decidedAt.toDate().toISOString()} vs block ${approvalBlock!.timestamp}`
  )

  // ---------------------------------------------------------------------------
  separator('A refusal, and a request its borrower took back')
  // ---------------------------------------------------------------------------
  const declinedLoan = await request(provider, pool, declinedBorrower, parseEther('1'))
  const refusal = await pool.contract.rejectLoan(declinedLoan, { nonce: await nextNonce(provider, owner.address) })
  await refusal.wait()

  const withdrawnLoan = await request(provider, pool, withdrawnBorrower, parseEther('1'))
  const withdrawal = await as(pool.contract.connect(withdrawnBorrower)).cancelLoanRequest(withdrawnLoan, {
    nonce: await nextNonce(provider, withdrawnBorrower.address),
  })
  await withdrawal.wait()

  await sweepFrom(provider, startBlock)

  const [refusalRecord] = await decisionsOn(pool.poolId, declinedLoan)
  const [withdrawalRecord] = await decisionsOn(pool.poolId, withdrawnLoan)

  // The check this script exists for. Both are `LoanRejected`, and both leave
  // the loan in exactly the same state, so only the sender tells them apart.
  check('the owner refusing reads as a refusal', refusalRecord?.outcome === 'rejected', refusalRecord?.outcome)
  check('the borrower withdrawing reads as a withdrawal', withdrawalRecord?.outcome === 'cancelled', withdrawalRecord?.outcome)
  check('and is attributed to the borrower, not the owner', withdrawalRecord?.decidedBy === withdrawnBorrower.address.toLowerCase())
  check('while the refusal is attributed to the owner', refusalRecord?.decidedBy === owner.address.toLowerCase())

  // ---------------------------------------------------------------------------
  separator('A declaration of default')
  // ---------------------------------------------------------------------------
  await advanceTime(provider, TERM_SECONDS * 3)

  const owedNow = (await pool.contract.outstandingBalance(approvedLoan)) as bigint
  const declaration = await pool.contract.markDefaulted(approvedLoan, { nonce: await nextNonce(provider, owner.address) })
  await declaration.wait()

  await sweepFrom(provider, startBlock)
  const onApprovedLoan = await decisionsOn(pool.poolId, approvedLoan)

  check('a loan approved and later declared keeps both decisions', onApprovedLoan.length === 2, `${onApprovedLoan.length}`)
  check('the first is still the approval', onApprovedLoan[0]?.outcome === 'approved')
  check('the second is the declaration', onApprovedLoan[1]?.outcome === 'defaulted')

  // `outstanding`, not `amount`: what was owed at that block, after accrual.
  // Decoding the event by the wrong field name would store zero here, and
  // reading the principal instead would understate the debt.
  check(
    'the declaration carries the debt at that block, not the principal',
    BigInt(onApprovedLoan[1]?.amount ?? '0') > parseEther('2'),
    `${onApprovedLoan[1]?.amount} vs ${owedNow}`
  )

  // ---------------------------------------------------------------------------
  separator('Re-sweeping changes nothing, and rebuilds everything')
  // ---------------------------------------------------------------------------
  const beforeRescan = (await decisionsFor(pool.poolId)).length
  const writtenOnRescan = await sweepFrom(provider, startBlock)

  check('a re-scan writes no new decisions', writtenOnRescan === 0, `${writtenOnRescan}`)
  check('and leaves the collection as it was', (await decisionsFor(pool.poolId)).length === beforeRescan)

  // The property a transition-based record could not have: every field comes
  // from the log, the block and the transaction, so the history is rebuildable
  // from nothing — which is also how decisions made before this existed are
  // backfilled.
  const existing = await firestore.collection(LOAN_DECISIONS_COLLECTION).get()
  await Promise.all(existing.docs.map((doc) => doc.ref.delete()))

  check('the collection is empty', (await decisionsFor(pool.poolId)).length === 0)

  const rebuilt = await sweepFrom(provider, 0)

  check('a sweep from genesis rebuilds every decision', (await decisionsFor(pool.poolId)).length === beforeRescan, `${rebuilt} written`)

  // ---------------------------------------------------------------------------
  separator('The callable path agrees with the sweep')
  // ---------------------------------------------------------------------------
  const byTxHash = await indexLoanDecisionsByTxHash(approvalReceipt.hash as string, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)

  check('it finds the same decision', byTxHash.decisions.length === 1)
  check('and writes nothing, because the sweep already did', byTxHash.results[0]?.stored === false)
  check(
    'under the same document id',
    byTxHash.results[0]?.id === loanDecisionDocId(CHAIN_ID, approvalReceipt.hash as string, byTxHash.decisions[0].logIndex)
  )

  // ---------------------------------------------------------------------------
  separator('A pool that lends on demand decides nothing')
  // ---------------------------------------------------------------------------
  const openPool = await createPool(provider, owner, 'on-demand', false)
  await admit(provider, openPool, owner, lender)
  await admit(provider, openPool, owner, approvedBorrower)

  const openDeposit = await as(openPool.contract.connect(lender)).depositFunds({
    value: parseEther('10'),
    nonce: await nextNonce(provider, lender.address),
  })
  await openDeposit.wait()

  const straightToMoney = await as(openPool.contract.connect(approvedBorrower)).createLoan(parseEther('1'), {
    nonce: await nextNonce(provider, approvedBorrower.address),
  })
  const straightReceipt = await straightToMoney.wait()

  const openLoanId = Number((await openPool.contract.nextLoanId()) - 1n)
  const repayment = await as(openPool.contract.connect(approvedBorrower)).repayLoan(openLoanId, {
    value: parseEther('2'),
    nonce: await nextNonce(provider, approvedBorrower.address),
  })
  await repayment.wait()

  await sweepFrom(provider, startBlock)

  // Nobody decided anything here: the money went out on demand and came back.
  check('lending and repaying decide nothing', (await decisionsFor(openPool.poolId)).length === 0)

  const onDemandByTx = await indexLoanDecisionsByTxHash(straightReceipt.hash as string, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)
  check('and the callable path says so quietly', onDemandByTx.decisions.length === 0)

  // ---------------------------------------------------------------------------
  separator('Reading the history back')
  // ---------------------------------------------------------------------------
  const newestFirst = await firestore
    .collection(LOAN_DECISIONS_COLLECTION)
    .where('chainId', '==', CHAIN_ID)
    .where('poolId', '==', pool.poolId)
    .orderBy('decidedAt', 'desc')
    .get()

  check('the pool has four decisions', newestFirst.docs.length === 4, `${newestFirst.docs.length}`)
  check('the newest is the declaration', newestFirst.docs[0]?.data().outcome === 'defaulted')

  const refusalsOnly = await firestore
    .collection(LOAN_DECISIONS_COLLECTION)
    .where('chainId', '==', CHAIN_ID)
    .where('poolId', '==', pool.poolId)
    .where('outcome', '==', 'rejected')
    .get()

  // Asking for refusals must never return the requests borrowers took back.
  check('asking for refusals returns one', refusalsOnly.docs.length === 1, `${refusalsOnly.docs.length}`)
  check('and it is the one the owner refused', refusalsOnly.docs[0]?.data().loanId === declinedLoan)

  const byDecider = await firestore
    .collection(LOAN_DECISIONS_COLLECTION)
    .where('chainId', '==', CHAIN_ID)
    .where('decidedBy', '==', owner.address.toLowerCase())
    .get()

  check('the owner is credited with three decisions', byDecider.docs.length === 3, `${byDecider.docs.length}`)

  const byBorrower = await firestore
    .collection(LOAN_DECISIONS_COLLECTION)
    .where('chainId', '==', CHAIN_ID)
    .where('borrower', '==', approvedBorrower.address.toLowerCase())
    .get()

  check('the approved borrower has two decisions about them', byBorrower.docs.length === 2, `${byBorrower.docs.length}`)

  // ── Summary ────────────────────────────────────────────────────────────────
  separator('Summary')
  console.log(`  ${passed} passed, ${failed} failed`)

  if (failed > 0) {
    console.log('\n  Failed:')
    failures.forEach((label) => console.log(`   • ${label}`))
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
