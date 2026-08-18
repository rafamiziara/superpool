/**
 * Manual integration test for default handling — the loan state nobody can derive.
 *
 * Drives real loans through a live local Hardhat node: one declared in default,
 * one recovered by paying after the declaration, one inside a grace period the
 * owner published, and one still comfortably inside its term. Then indexes them
 * and checks that the stored records say what the chain says.
 *
 * The unit suites mock ethers entirely, so this is the only place the shipped
 * ABI, the chain's own clock and the document shape are exercised together —
 * and the clock is the whole point of this one. Being late is a fact about
 * *time*, and a local node's time is nothing like this machine's.
 *
 * Prerequisites:
 *   Terminal 1 → cd packages/contracts && pnpm node:local
 *   Terminal 2 → cd packages/contracts && pnpm deploy:local
 *   Terminal 3 → cd config             && npx firebase-tools emulators:start --only firestore --project genesis-super-pool
 *   Terminal 4 → cd packages/backend   && pnpm testDefaults
 *
 * Required .env values:
 *   POOL_FACTORY_ADDRESS=<address printed by deploy:local>
 *   CHAIN_ID=31337
 *   RPC_URL=http://127.0.0.1:8545
 *
 * Note this advances the node's clock by several hours, irreversibly for the
 * run of the node. That is the only way to be overdue without waiting.
 *
 * Nothing is sent to Expo: no push token is registered for any of these
 * wallets, so `notifyWallet` finds no recipients and returns without a request.
 * What *is* verified is everything up to that point — the transition, the
 * idempotency marker, and the chain-time judgement the reminder scan makes.
 */

// ── Must be set before any firebase-admin import ──────────────────────────────
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080'

import * as dotenv from 'dotenv'
dotenv.config()

import { BaseContract, Contract, id, JsonRpcProvider, parseEther, Wallet, ZeroAddress } from 'ethers'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { LendingPoolABI, PoolFactoryABI } from '../src/constants/abis'
import { LOANS_COLLECTION, NOTIFICATIONS_SENT_COLLECTION } from '../src/constants/firestore'
import { remindChain } from '../src/services/dueReminders'
import { sweepBlockRange } from '../src/services/eventSweeper'
import { indexLoansByTxHash, loanDocId } from '../src/services/loanIndexer'

// ── Config ────────────────────────────────────────────────────────────────────

const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545'
const CHAIN_ID = parseInt(process.env.CHAIN_ID || '31337')
const FACTORY_ADDRESS = process.env.POOL_FACTORY_ADDRESS || ''

/** A short term, so a loan can be pushed past it without waiting. */
const SHORT_TERM_SECONDS = 60
const LONG_TERM_SECONDS = 30 * 24 * 60 * 60

/**
 * Hardhat's published accounts. Safe here by construction and nowhere else —
 * these keys are in every Hardhat README on the internet.
 */
const KEYS = {
  owner: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  lender: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  declared: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  recovered: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  protected: '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
  punctual: '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba',
}

/** A Firestore of this run's own; see `testBorrowerHistory.ts` for why. */
const PROJECT_ID = `verify-defaults-${Date.now()}`
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

/**
 * Next nonce for an address, tracked here rather than left to the provider.
 *
 * ethers caches `eth_getTransactionCount`, so a burst of awaited sends from one
 * wallet can still be assigned a nonce already used.
 */
const nonces = new Map<string, number>()

async function nextNonce(provider: JsonRpcProvider, address: string): Promise<number> {
  if (!nonces.has(address)) {
    nonces.set(address, await provider.getTransactionCount(address, 'latest'))
  }

  const nonce = nonces.get(address)!
  nonces.set(address, nonce + 1)

  return nonce
}

/**
 * Hand a nonce back after a transaction that never reached the chain.
 *
 * A call that fails gas estimation is rejected before it is broadcast, so the
 * counter above must not count it — otherwise every later send from that wallet
 * carries a nonce one too high and hangs. This script expects several reverts
 * deliberately, so the trap is guaranteed rather than hypothetical.
 */
function releaseNonce(address: string) {
  nonces.set(address, nonces.get(address)! - 1)
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

async function createPool(provider: JsonRpcProvider, owner: Wallet, name: string, loanDuration: number): Promise<PoolHandle> {
  const factory = new Contract(FACTORY_ADDRESS, PoolFactoryABI, owner)

  const tx = await factory.createPool(
    {
      maxLoanAmount: parseEther('100'),
      interestRate: 1000,
      loanDuration,
      name: `${name}-${Date.now()}`,
      description: 'default handling verification',
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

  return {
    poolId: Number(created.args.poolId),
    address: created.args.poolAddress as string,
    contract: new Contract(created.args.poolAddress as string, LendingPoolABI, owner),
  }
}

async function admit(provider: JsonRpcProvider, pool: PoolHandle, owner: Wallet, member: Wallet) {
  const request = await as(pool.contract.connect(member)).requestMembership({ nonce: await nextNonce(provider, member.address) })
  await request.wait()

  const approve = await pool.contract.approveMember(member.address, { nonce: await nextNonce(provider, owner.address) })
  await approve.wait()
}

async function borrow(provider: JsonRpcProvider, pool: PoolHandle, borrower: Wallet, amount: bigint) {
  const tx = await as(pool.contract.connect(borrower)).createLoan(amount, { nonce: await nextNonce(provider, borrower.address) })
  const receipt = await tx.wait()

  return {
    txHash: receipt.hash as string,
    blockNumber: receipt.blockNumber as number,
    loanId: Number((await pool.contract.nextLoanId()) - 1n),
  }
}

/** Settles a loan, quoting an hour ahead — see `testBorrowerHistory.ts`. */
async function repay(provider: JsonRpcProvider, pool: PoolHandle, borrower: Wallet, loanId: number) {
  const latest = await provider.getBlock('latest')
  const due = await pool.contract.outstandingBalanceAt(loanId, latest!.timestamp + 3600)
  const tx = await as(pool.contract.connect(borrower)).repayLoan(loanId, {
    value: due,
    nonce: await nextNonce(provider, borrower.address),
  })
  const receipt = await tx.wait()

  return { txHash: receipt.hash as string, blockNumber: receipt.blockNumber as number }
}

async function loanRecord(poolId: number, loanId: number) {
  const doc = await firestore
    .collection(LOANS_COLLECTION)
    .doc(loanDocId(CHAIN_ID, poolId, loanId))
    .get()

  return doc.data() ?? {}
}

/**
 * Whether a call reverts **with a named custom error**, with the nonce handed
 * back if the transaction never left.
 *
 * Matched on the four-byte selector rather than on ethers' message. Two reasons,
 * and the first is what this script is for: a revert raised during gas
 * estimation frequently comes back as `unknown custom error` even when the ABI
 * carries the definition, so a message match would fail on a contract that
 * behaved perfectly. The second is that the selector is the fact worth
 * pinning — it says *which* guard fired, where a substring match would pass on
 * a different error whose name happened to contain the same letters.
 */
async function revertsWith(address: string, signature: string, send: () => Promise<unknown>): Promise<{ ok: boolean; detail: string }> {
  const selector = id(signature).slice(0, 10)

  try {
    await send()

    return { ok: false, detail: 'the call went through' }
  } catch (error) {
    releaseNonce(address)

    const message = error instanceof Error ? error.message : String(error)

    // Either ethers decoded it, or the raw data is in the message.
    return { ok: message.includes(signature.replace('()', '')) || message.includes(selector), detail: message }
  }
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
  const declared = new Wallet(KEYS.declared, provider)
  const recovered = new Wallet(KEYS.recovered, provider)
  const guarded = new Wallet(KEYS.protected, provider)
  const punctual = new Wallet(KEYS.punctual, provider)

  console.log(`\nFactory:    ${FACTORY_ADDRESS}`)
  console.log(`Chain:      ${CHAIN_ID}`)
  console.log(`Firestore:  ${process.env.FIRESTORE_EMULATOR_HOST} (project ${PROJECT_ID})`)

  // ---------------------------------------------------------------------------
  separator('A pool with a short term, and four borrowers')
  // ---------------------------------------------------------------------------
  const pool = await createPool(provider, owner, 'defaults', SHORT_TERM_SECONDS)
  await admit(provider, pool, owner, lender)
  await admit(provider, pool, owner, declared)
  await admit(provider, pool, owner, recovered)
  await admit(provider, pool, owner, guarded)

  const deposit = await as(pool.contract.connect(lender)).depositFunds({
    value: parseEther('60'),
    nonce: await nextNonce(provider, lender.address),
  })
  await deposit.wait()

  const declaredLoan = await borrow(provider, pool, declared, parseEther('2'))
  const recoveredLoan = await borrow(provider, pool, recovered, parseEther('2'))
  console.log(`  pool #${pool.poolId}, loans ${declaredLoan.loanId} and ${recoveredLoan.loanId}`)

  check('the grace period starts at zero', (await pool.contract.defaultGracePeriod()) === 0n)

  // ---------------------------------------------------------------------------
  separator('A loan inside its term cannot be declared')
  // ---------------------------------------------------------------------------
  const tooEarly = await revertsWith(owner.address, 'LoanNotOverdue()', async () =>
    pool.contract.markDefaulted(declaredLoan.loanId, { nonce: await nextNonce(provider, owner.address) })
  )

  check('the contract refuses it, with LoanNotOverdue', tooEarly.ok, tooEarly.detail)

  // ---------------------------------------------------------------------------
  separator('Past its term, the owner declares it')
  // ---------------------------------------------------------------------------
  await advanceTime(provider, 2 * 60 * 60)

  const owedBefore = await pool.contract.outstandingBalance(declaredLoan.loanId)

  const declareTx = await pool.contract.markDefaulted(declaredLoan.loanId, { nonce: await nextNonce(provider, owner.address) })
  const declareReceipt = await declareTx.wait()
  const declareBlock = await provider.getBlock(declareReceipt.blockNumber)

  const chainDeclared = await pool.contract.getLoan(declaredLoan.loanId)

  check('the chain records the state', Number(chainDeclared.status) === 3, `status ${chainDeclared.status}`)
  check('and stamps when', Number(chainDeclared.defaultedAt) === declareBlock!.timestamp, `${chainDeclared.defaultedAt}`)
  check('the debt is not repaid', chainDeclared.isRepaid === false)

  // The trap this whole milestone turns on: every valuation used to be gated on
  // `Disbursed` alone, so declaring a default reported the debt as zero.
  const owedAfter = await pool.contract.outstandingBalance(declaredLoan.loanId)

  check('the debt survives the declaration', owedAfter > 0n, `outstandingBalance ${owedAfter}`)
  check('and has only grown', owedAfter >= owedBefore, `${owedBefore} → ${owedAfter}`)

  const [principalOut, interestOut] = await pool.contract.loanBalance(declaredLoan.loanId)
  check('loanBalance still splits it', principalOut + interestOut === owedAfter, `${principalOut} + ${interestOut} vs ${owedAfter}`)

  // The other half of the design: the borrower is still held to one loan.
  const stillHeld = await pool.contract.activeLoanId(declared.address)
  check('the borrower’s slot is still held', Number(stillHeld) === declaredLoan.loanId, `activeLoanId ${stillHeld}`)

  const secondLoan = await revertsWith(declared.address, 'LoanOutstanding()', async () =>
    as(pool.contract.connect(declared)).createLoan(parseEther('1'), { nonce: await nextNonce(provider, declared.address) })
  )
  check('so they cannot borrow again', secondLoan.ok, secondLoan.detail)

  // ---------------------------------------------------------------------------
  separator('The index follows')
  // ---------------------------------------------------------------------------
  const { results } = await indexLoansByTxHash(declareReceipt.hash, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)
  const declaredData = await loanRecord(pool.poolId, declaredLoan.loanId)

  check('the record says defaulted', declaredData.status === 'defaulted', `got ${declaredData.status}`)
  check('defaultedAt is stored as a timestamp', declaredData.defaultedAt instanceof Timestamp, `got ${typeof declaredData.defaultedAt}`)
  check(
    'and matches the stamp the contract wrote',
    declaredData.defaultedAt?.toDate().getTime() === Number(chainDeclared.defaultedAt) * 1000,
    `stored ${declaredData.defaultedAt?.toDate().toISOString()}, chain ${chainDeclared.defaultedAt}`
  )
  check('it is reported as a transition worth telling somebody about', results[0]?.transition === 'defaulted', `${results[0]?.transition}`)
  check('and still reads as an open debt', declaredData.isRepaid === false)

  // Re-indexing the same transaction must be free, which is what makes the
  // sweep's deliberate re-scans harmless.
  const again = await indexLoansByTxHash(declareReceipt.hash, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)
  check('re-indexing writes nothing', again.results[0]?.alreadyIndexed === true)
  check('and reports no news', again.results[0]?.transition === null, `${again.results[0]?.transition}`)

  // ---------------------------------------------------------------------------
  separator('A declaration cannot be made twice')
  // ---------------------------------------------------------------------------
  const twice = await revertsWith(owner.address, 'LoanAlreadyDefaulted()', async () =>
    pool.contract.markDefaulted(declaredLoan.loanId, { nonce: await nextNonce(provider, owner.address) })
  )
  check('the contract refuses it, with LoanAlreadyDefaulted', twice.ok, twice.detail)

  // ---------------------------------------------------------------------------
  separator('Paying after a declaration: recovery, not erasure')
  // ---------------------------------------------------------------------------
  const declareRecovered = await pool.contract.markDefaulted(recoveredLoan.loanId, { nonce: await nextNonce(provider, owner.address) })
  await declareRecovered.wait()

  const claimBefore = await pool.contract.claimable(lender.address)
  const settlement = await repay(provider, pool, recovered, recoveredLoan.loanId)
  const chainRecovered = await pool.contract.getLoan(recoveredLoan.loanId)

  check('the debt closes', chainRecovered.isRepaid === true)
  check('it is dated', Number(chainRecovered.repaidAt) > 0)
  // Both facts survive, and the pair is what "recovered" means.
  check('and the declaration is not undone', Number(chainRecovered.status) === 3, `status ${chainRecovered.status}`)
  check('the borrower is freed', Number(await pool.contract.activeLoanId(recovered.address)) === 0)

  const claimAfter = await pool.contract.claimable(lender.address)
  check('the lenders earned from the recovery', claimAfter > claimBefore, `${claimBefore} → ${claimAfter}`)

  await indexLoansByTxHash(settlement.txHash, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)
  const recoveredData = await loanRecord(pool.poolId, recoveredLoan.loanId)

  check('the record keeps both halves', recoveredData.status === 'defaulted' && recoveredData.isRepaid === true)
  check('and both dates', recoveredData.defaultedAt instanceof Timestamp && recoveredData.repaidAt instanceof Timestamp)

  // ---------------------------------------------------------------------------
  separator('A grace period the owner published')
  // ---------------------------------------------------------------------------
  const graced = await createPool(provider, owner, 'grace', SHORT_TERM_SECONDS)
  await admit(provider, graced, owner, lender)
  await admit(provider, graced, owner, guarded)

  const graceDeposit = await as(graced.contract.connect(lender)).depositFunds({
    value: parseEther('30'),
    nonce: await nextNonce(provider, lender.address),
  })
  await graceDeposit.wait()

  const setGrace = await graced.contract.setDefaultGracePeriod(7 * 24 * 60 * 60, { nonce: await nextNonce(provider, owner.address) })
  await setGrace.wait()

  const guardedLoan = await borrow(provider, graced, guarded, parseEther('1'))
  await advanceTime(provider, 2 * 60 * 60)

  const chainNow = (await provider.getBlock('latest'))!.timestamp
  const declarableAt = await graced.contract.defaultableAt(guardedLoan.loanId)

  check('the loan is past its term', chainNow > Number((await graced.contract.getLoan(guardedLoan.loanId)).startTime) + SHORT_TERM_SECONDS)
  check('but not yet declarable', Number(declarableAt) > chainNow, `declarable at ${declarableAt}, now ${chainNow}`)

  const insideGrace = await revertsWith(owner.address, 'LoanNotOverdue()', async () =>
    graced.contract.markDefaulted(guardedLoan.loanId, { nonce: await nextNonce(provider, owner.address) })
  )
  check('and the contract holds the owner to it', insideGrace.ok, insideGrace.detail)

  await advanceTime(provider, 8 * 24 * 60 * 60)

  const afterGrace = await graced.contract.markDefaulted(guardedLoan.loanId, { nonce: await nextNonce(provider, owner.address) })
  await afterGrace.wait()

  check('once it has run out, the declaration goes through', Number((await graced.contract.getLoan(guardedLoan.loanId)).status) === 3)

  // ---------------------------------------------------------------------------
  separator('The reminder scan, on the chain’s clock')
  // ---------------------------------------------------------------------------
  // Everything above has to be in the index for the scan to find it, and the
  // pool documents have to exist for a reminder to name the pool.
  const head = await provider.getBlockNumber()
  await sweepBlockRange({ chainId: CHAIN_ID, factoryAddress: FACTORY_ADDRESS, fromBlock: 0, toBlock: head, provider, firestore })

  // A loan that is nowhere near its term, to prove the scan is selective.
  const calm = await createPool(provider, owner, 'punctual', LONG_TERM_SECONDS)
  await admit(provider, calm, owner, lender)
  await admit(provider, calm, owner, punctual)
  const calmDeposit = await as(calm.contract.connect(lender)).depositFunds({
    value: parseEther('20'),
    nonce: await nextNonce(provider, lender.address),
  })
  await calmDeposit.wait()
  const calmLoan = await borrow(provider, calm, punctual, parseEther('1'))
  await indexLoansByTxHash(calmLoan.txHash, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)

  // The check this script exists for on this side: the node's clock has been
  // pushed more than eight days ahead of this machine's, so a scan run against
  // `Date.now()` would report every one of these loans as comfortably inside
  // its term.
  const wallClock = Math.floor(Date.now() / 1000)
  const chainClock = (await provider.getBlock('latest'))!.timestamp

  console.log(`  wall clock ${new Date(wallClock * 1000).toISOString()}, chain ${new Date(chainClock * 1000).toISOString()}`)
  check('the two clocks genuinely disagree', chainClock > wallClock + 8 * 24 * 60 * 60, `${chainClock - wallClock}s apart`)

  const firstRun = await remindChain(CHAIN_ID, provider, firestore)

  check('the scan found the late loans', firstRun.overdue >= 2, `overdue ${firstRun.overdue} of ${firstRun.scanned} scanned`)
  check('and warned nobody prematurely', firstRun.dueSoon === 0, `dueSoon ${firstRun.dueSoon}`)

  const overdueMarker = await firestore
    .collection(NOTIFICATIONS_SENT_COLLECTION)
    .doc(`${loanDocId(CHAIN_ID, pool.poolId, declaredLoan.loanId)}-loan_overdue`)
    .get()
  check('a marker was claimed for the declared loan', overdueMarker.exists)

  // The whole discipline of a scheduled job that runs against a standing
  // condition: it must not send an hour, for as long as the debt stands.
  const secondRun = await remindChain(CHAIN_ID, provider, firestore)
  check('running it again tells nobody anything', secondRun.overdue === 0 && secondRun.dueSoon === 0, JSON.stringify(secondRun))

  // A settled debt is not chased, whether or not it was declared.
  const recoveredMarker = await firestore
    .collection(NOTIFICATIONS_SENT_COLLECTION)
    .doc(`${loanDocId(CHAIN_ID, pool.poolId, recoveredLoan.loanId)}-loan_overdue`)
    .get()
  check('a loan that was paid off is left alone', recoveredMarker.exists === false)

  const calmMarker = await firestore
    .collection(NOTIFICATIONS_SENT_COLLECTION)
    .doc(`${loanDocId(CHAIN_ID, calm.poolId, calmLoan.loanId)}-loan_overdue`)
    .get()
  check('and so is a loan with a month left on it', calmMarker.exists === false)

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
