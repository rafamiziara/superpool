/**
 * Manual integration test for interest that accrues with time held.
 *
 * Drives real loans through a live local Hardhat node and moves its clock:
 * one held half a term, one to the due date, one well past it, one paid down
 * early. Then checks the three things that only exist together on a real
 * chain — what the contract charges, what the indexer stores, and whether the
 * app's own projection of the stored snapshot agrees with the chain.
 *
 * The unit suites mock ethers entirely and the contract suite cannot see the
 * indexer, so this is the only place the accrual rule is checked end to end.
 * The checks that matter most are the last two groups: a settlement quoted for
 * *now* must fail to settle, and a loan made before accrual existed must still
 * be priced on the terms it was made under.
 *
 * Prerequisites:
 *   Terminal 1 → cd packages/contracts && pnpm node:local
 *   Terminal 2 → cd packages/contracts && pnpm deploy:local
 *   Terminal 3 → cd config             && npx firebase-tools emulators:start --only firestore --project genesis-super-pool
 *   Terminal 4 → cd packages/backend   && pnpm testAccrual
 *
 * Required .env values:
 *   POOL_FACTORY_ADDRESS=<address printed by deploy:local>
 *   CHAIN_ID=31337
 *   RPC_URL=http://127.0.0.1:8545
 *
 * Note this advances the node's clock by several loan terms. That is the only
 * way to accrue interest without waiting, and it is irreversible for the run of
 * the node — harmless on a local chain, and worth knowing before wondering why
 * other pools' due dates moved.
 */

// ── Must be set before any firebase-admin import ──────────────────────────────
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080'

import * as dotenv from 'dotenv'
dotenv.config()

import { BaseContract, Contract, JsonRpcProvider, parseEther, Wallet, ZeroAddress } from 'ethers'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { LendingPoolABI, PoolFactoryABI } from '../src/constants/abis'
import { LOANS_COLLECTION } from '../src/constants/firestore'
import { indexLoansByTxHash, loanDocId } from '../src/services/loanIndexer'

// ── Config ────────────────────────────────────────────────────────────────────

const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545'
const CHAIN_ID = parseInt(process.env.CHAIN_ID || '31337')
const FACTORY_ADDRESS = process.env.POOL_FACTORY_ADDRESS || ''

/** Thirty days, and 1000bp — so a full term costs a round 10%. */
const TERM = 30 * 24 * 60 * 60
const RATE = 1000

/**
 * Hardhat's published accounts. Safe here by construction and nowhere else —
 * these keys are in every Hardhat README on the internet.
 */
const KEYS = {
  owner: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  lender: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  halfTerm: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  fullTerm: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  overdue: '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
  earlyPayer: '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba',
}

const PROJECT_ID = `verify-accrual-${Date.now()}`
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

/** Within a wei tolerance, since a block or two of accrual lands either way. */
function near(actual: bigint, expected: bigint, tolerance = parseEther('0.0005')): boolean {
  const difference = actual > expected ? actual - expected : expected - actual

  return difference <= tolerance
}

// ── Chain setup ───────────────────────────────────────────────────────────────

function as(contract: BaseContract): Contract {
  return contract as Contract
}

const nonces = new Map<string, number>()

async function nextNonce(provider: JsonRpcProvider, address: string): Promise<number> {
  if (!nonces.has(address)) {
    nonces.set(address, await provider.getTransactionCount(address, 'latest'))
  }

  const nonce = nonces.get(address)!
  nonces.set(address, nonce + 1)

  return nonce
}

/** Mines the next block at an exact moment, so accrual assertions can be exact. */
async function mineAt(provider: JsonRpcProvider, timestamp: number | bigint): Promise<void> {
  await provider.send('evm_setNextBlockTimestamp', [Number(timestamp)])
  await provider.send('evm_mine', [])
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
      interestRate: RATE,
      loanDuration: TERM,
      name: `${name}-${Date.now()}`,
      description: 'accrual verification',
      requiresMembership: true,
      // Native POL. Appended to `PoolParams` in the ERC-20 work, and positional —
      // omitting it makes ethers reject the struct rather than default it.
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

async function pay(provider: JsonRpcProvider, pool: PoolHandle, borrower: Wallet, loanId: number, amount: bigint) {
  const tx = await as(pool.contract.connect(borrower)).repayLoan(loanId, {
    value: amount,
    nonce: await nextNonce(provider, borrower.address),
  })
  const receipt = await tx.wait()

  return { txHash: receipt.hash as string, blockNumber: receipt.blockNumber as number }
}

/**
 * The app's own projection of a stored snapshot, restated here on purpose.
 *
 * A copy of `PoolStore.accruedInterestNow`. If the two ever disagree the app is
 * showing a figure the chain will not charge, and this is the only place that
 * can be caught — the mobile suite has no chain to compare against.
 */
function projectInterest(record: FirebaseFirestore.DocumentData, at: Date): bigint {
  const snapshot = BigInt(record.interestOutstanding as string)
  const principal = BigInt(record.principalOutstanding as string)

  if (!record.accruedAt || principal === 0n || record.duration === 0) return snapshot

  const elapsed = Math.floor((at.getTime() - record.accruedAt.toDate().getTime()) / 1000)

  if (elapsed <= 0) return snapshot

  return snapshot + (principal * BigInt(record.interestRate as number) * BigInt(elapsed)) / (10_000n * BigInt(record.duration as number))
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!FACTORY_ADDRESS) {
    console.error('POOL_FACTORY_ADDRESS is not set in packages/backend/.env')
    process.exitCode = 1
    return
  }

  // `cacheTimeout: -1` disables ethers' 250ms read cache. A verification script
  // is exactly where that matters — two reads either side of a transaction come
  // back identical without it, which reads as a contract bug and is not one.
  const provider = new JsonRpcProvider(RPC_URL, undefined, { cacheTimeout: -1 })

  const owner = new Wallet(KEYS.owner, provider)
  const lender = new Wallet(KEYS.lender, provider)
  const halfTermBorrower = new Wallet(KEYS.halfTerm, provider)
  const fullTermBorrower = new Wallet(KEYS.fullTerm, provider)
  const overdueBorrower = new Wallet(KEYS.overdue, provider)
  const earlyPayer = new Wallet(KEYS.earlyPayer, provider)

  console.log(`\nFactory:    ${FACTORY_ADDRESS}`)
  console.log(`Chain:      ${CHAIN_ID}`)
  console.log(`Firestore:  ${process.env.FIRESTORE_EMULATOR_HOST} (project ${PROJECT_ID})`)

  const pool = await createPool(provider, owner, 'accrual')
  for (const member of [lender, halfTermBorrower, fullTermBorrower, overdueBorrower, earlyPayer]) {
    await admit(provider, pool, owner, member)
  }

  const deposit = await as(pool.contract.connect(lender)).depositFunds({
    value: parseEther('80'),
    nonce: await nextNonce(provider, lender.address),
  })
  await deposit.wait()

  // ---------------------------------------------------------------------------
  separator('What the rate buys')
  // ---------------------------------------------------------------------------
  const loan = await borrow(provider, pool, halfTermBorrower, parseEther('10'))
  const { startTime } = await pool.contract.getLoan(loan.loanId)
  const fullTermInterest = parseEther('1') // 10 POL at 1000bp

  const quote: bigint = await pool.contract.calculateRepaymentAmount(loan.loanId)
  check('the quote is principal plus the full term’s rate', quote === parseEther('11'), `got ${quote}`)

  const atStart: bigint = await pool.contract.outstandingBalanceAt(loan.loanId, startTime)
  const atHalf: bigint = await pool.contract.outstandingBalanceAt(loan.loanId, startTime + BigInt(TERM / 2))
  const atTerm: bigint = await pool.contract.outstandingBalanceAt(loan.loanId, startTime + BigInt(TERM))
  const atDouble: bigint = await pool.contract.outstandingBalanceAt(loan.loanId, startTime + BigInt(TERM * 2))
  const atTriple: bigint = await pool.contract.outstandingBalanceAt(loan.loanId, startTime + BigInt(TERM * 3))

  check('nothing is owed but principal at the start', atStart === parseEther('10'), `got ${atStart}`)
  check('half the rate at half the term', atHalf === parseEther('10') + fullTermInterest / 2n, `got ${atHalf}`)
  check('exactly the rate at the due date', atTerm === parseEther('11'), `got ${atTerm}`)
  check('and the quote agrees with it there', atTerm === quote)

  // The decision this model turns on: no cap, no cliff.
  check('twice the rate at twice the term', atDouble === parseEther('12'), `got ${atDouble}`)
  check('three times at three times', atTriple === parseEther('13'), `got ${atTriple}`)
  check('so another day always costs the same', atDouble - atTerm === atTriple - atDouble)

  // ---------------------------------------------------------------------------
  separator('A payment settles interest before principal')
  // ---------------------------------------------------------------------------
  await mineAt(provider, startTime + BigInt(TERM / 2))

  const [principalBefore, interestBefore] = await pool.contract.loanBalance(loan.loanId)
  check('half a term has accrued', near(interestBefore, fullTermInterest / 2n), `got ${interestBefore}`)
  check('and the principal is untouched', principalBefore === parseEther('10'))

  // A payment smaller than the accrued interest must not touch principal.
  await pay(provider, pool, halfTermBorrower, loan.loanId, parseEther('0.2'))
  const [principalAfterSmall, interestAfterSmall] = await pool.contract.loanBalance(loan.loanId)

  check('a payment under the interest leaves the principal alone', principalAfterSmall === parseEther('10'), `got ${principalAfterSmall}`)
  check('and comes off the interest', near(interestAfterSmall, fullTermInterest / 2n - parseEther('0.2')), `got ${interestAfterSmall}`)

  // A payment larger than it clears the interest and bites into principal.
  await pay(provider, pool, halfTermBorrower, loan.loanId, parseEther('5.3'))
  const [principalAfterLarge, interestAfterLarge] = await pool.contract.loanBalance(loan.loanId)

  check('a larger payment clears the interest', near(interestAfterLarge, 0n, parseEther('0.00002')), `got ${interestAfterLarge}`)
  check('and the rest reduces the principal', near(principalAfterLarge, parseEther('5')), `got ${principalAfterLarge}`)

  // ---------------------------------------------------------------------------
  separator('Paying principal down makes the rest cheaper')
  // ---------------------------------------------------------------------------
  // Half the principal is out for the second half of the term, so it earns a
  // quarter of the stated rate rather than a half.
  const beforeSecondHalf: bigint = await pool.contract.outstandingBalanceAt(loan.loanId, startTime + BigInt(TERM))
  const accruedInSecondHalf = beforeSecondHalf - principalAfterLarge

  check(
    'half the principal over half the term earns a quarter of the rate',
    near(accruedInSecondHalf, fullTermInterest / 4n),
    `got ${accruedInSecondHalf}`
  )

  // The comparison that makes it concrete: the same loan held whole.
  const untouched = await borrow(provider, pool, fullTermBorrower, parseEther('10'))
  const untouchedStart = (await pool.contract.getLoan(untouched.loanId)).startTime
  const untouchedAtTerm: bigint = await pool.contract.outstandingBalanceAt(untouched.loanId, untouchedStart + BigInt(TERM))

  check('while a loan left whole owes the full rate', untouchedAtTerm === parseEther('11'), `got ${untouchedAtTerm}`)

  // ---------------------------------------------------------------------------
  separator('Settling needs a quote for later, not for now')
  // ---------------------------------------------------------------------------
  // The trap the app's buffer exists for, seen from the chain: send exactly
  // what is owed *this instant* and the block mines a second later, leaving the
  // loan open by a few seconds of interest. It looks like success.
  const owedNow: bigint = await pool.contract.outstandingBalance(untouched.loanId)
  await pay(provider, pool, fullTermBorrower, untouched.loanId, owedNow)
  const afterExact = await pool.contract.getLoan(untouched.loanId)

  check('an exact payment does not settle the loan', afterExact.isRepaid === false)
  check('leaving a sliver owed', (await pool.contract.outstandingBalance(untouched.loanId)) > 0n)

  // Quoted an hour ahead, as the app does. The excess comes back.
  const latest = await provider.getBlock('latest')
  const quoted: bigint = await pool.contract.outstandingBalanceAt(untouched.loanId, latest!.timestamp + 3600)
  const balanceBefore = await provider.getBalance(fullTermBorrower.address)
  const settleTx = await as(pool.contract.connect(fullTermBorrower)).repayLoan(untouched.loanId, {
    value: quoted,
    nonce: await nextNonce(provider, fullTermBorrower.address),
  })
  const settleReceipt = await settleTx.wait()
  const gas = BigInt(settleReceipt.gasUsed) * BigInt(settleReceipt.gasPrice)
  const balanceAfter = await provider.getBalance(fullTermBorrower.address)
  const settled = await pool.contract.getLoan(untouched.loanId)

  check('a quote for an hour ahead settles it', settled.isRepaid === true)
  check(
    'and the head-room comes back',
    balanceBefore - balanceAfter - gas < quoted,
    `wallet moved by ${balanceBefore - balanceAfter - gas}`
  )
  check('the borrower’s slot is free again', (await pool.contract.activeLoanId(fullTermBorrower.address)) === 0n)

  // ---------------------------------------------------------------------------
  separator('Lenders are credited the interest that was actually paid')
  // ---------------------------------------------------------------------------
  const claimable: bigint = await pool.contract.claimable(lender.address)
  const distributed: bigint = await pool.contract.accInterestPerShare()

  check('the lender has earned something', claimable > 0n)
  check('the accumulator moved with it', distributed > 0n)

  // Against the pool's own logs rather than a re-derivation of the payments:
  // `InterestDistributed` carries exactly the interest each payment covered,
  // and the pool cannot credit what no borrower handed over. The lender is the
  // only contributor, so their claimable is the whole of it bar rounding dust.
  const distributions = await pool.contract.queryFilter(pool.contract.filters.InterestDistributed())
  // Both parameters are indexed, so the amount is topic 2 and `data` is empty.
  const totalDistributed = distributions.reduce(
    (sum: bigint, log: { topics: readonly string[] }) => sum + BigInt(log.topics[2]),
    0n as bigint
  )

  console.log(`  distributed  ${totalDistributed} wei across ${distributions.length} payments`)
  console.log(`  claimable    ${claimable} wei`)

  check('never more than was distributed', claimable <= totalDistributed, `claimable ${claimable}, distributed ${totalDistributed}`)
  check('and all of it bar rounding dust', near(claimable, totalDistributed, 1000n), `off by ${totalDistributed - claimable}`)

  // ---------------------------------------------------------------------------
  separator('The index carries a snapshot the app can project')
  // ---------------------------------------------------------------------------
  const running = await borrow(provider, pool, overdueBorrower, parseEther('10'))
  await indexLoansByTxHash(running.txHash, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)

  const doc = await firestore
    .collection(LOANS_COLLECTION)
    .doc(loanDocId(CHAIN_ID, pool.poolId, running.loanId))
    .get()
  const record = doc.data() ?? {}

  check(
    'the record stores the principal still out',
    record.principalOutstanding === parseEther('10').toString(),
    `got ${record.principalOutstanding}`
  )
  check('and the interest snapshot', record.interestOutstanding === '0', `got ${record.interestOutstanding}`)
  check('and when it was taken', record.accruedAt !== undefined)

  // Run the clock forward and compare the app's projection against the chain.
  const runningStart = (await pool.contract.getLoan(running.loanId)).startTime
  const at = Number(runningStart) + TERM + TERM / 3
  await mineAt(provider, at)

  const [, chainInterest] = await pool.contract.loanBalance(running.loanId)
  const projected = projectInterest(record, new Date(at * 1000))

  console.log(`  chain says    ${chainInterest} wei`)
  console.log(`  the app says  ${projected} wei`)
  check('the app’s projection of the snapshot matches the chain', projected === chainInterest, `off by ${chainInterest - projected}`)
  check('and it is past the term without being capped', chainInterest > fullTermInterest, `got ${chainInterest}`)

  // ---------------------------------------------------------------------------
  separator('A loan made before accrual is priced on its own terms')
  // ---------------------------------------------------------------------------
  // Simulated by blanking the two words accrual added, which is the only way to
  // hold a pre-upgrade loan on a node running the current implementation.
  const legacy = await borrow(provider, pool, earlyPayer, parseEther('10'))
  const legacySlot = await findLoanSlot(provider, pool.address, legacy.loanId, earlyPayer.address)
  const zero = `0x${'0'.repeat(64)}`

  await provider.send('hardhat_setStorageAt', [pool.address, `0x${(legacySlot + 6n).toString(16)}`, zero])
  await provider.send('hardhat_setStorageAt', [pool.address, `0x${(legacySlot + 7n).toString(16)}`, zero])

  const [legacyPrincipal, legacyInterest] = await pool.contract.loanBalance(legacy.loanId)

  check('its principal is not read as already returned', legacyPrincipal === parseEther('10'), `got ${legacyPrincipal}`)
  check('and it owes the flat interest it was made with', legacyInterest === fullTermInterest, `got ${legacyInterest}`)

  // A full term passes and it must not be charged twice for time already
  // covered by the flat rate.
  await mineAt(provider, Number((await pool.contract.getLoan(legacy.loanId)).startTime) + TERM)
  const legacyLater: bigint = await pool.contract.outstandingBalance(legacy.loanId)

  check('a term passing does not charge it twice', legacyLater === parseEther('11'), `got ${legacyLater}`)

  await indexLoansByTxHash(legacy.txHash, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)
  const legacyDoc = await firestore
    .collection(LOANS_COLLECTION)
    .doc(loanDocId(CHAIN_ID, pool.poolId, legacy.loanId))
    .get()
  const legacyRecord = legacyDoc.data() ?? {}

  check(
    'the index prices it from the chain, not from the zeroes',
    legacyRecord.principalOutstanding === parseEther('10').toString(),
    `got ${legacyRecord.principalOutstanding}`
  )
  check('and leaves it without a snapshot date', legacyRecord.accruedAt === undefined)
  check(
    'so the app holds it still rather than projecting it',
    projectInterest(legacyRecord, new Date((at + TERM * 5) * 1000)) === fullTermInterest
  )

  // ---------------------------------------------------------------------------
  separator(`${passed} passed, ${failed} failed`)
  // ---------------------------------------------------------------------------
  if (failed > 0) {
    console.log('\nFailures:')
    failures.forEach((failure) => console.log(`  • ${failure}`))
    process.exitCode = 1
  }
}

/**
 * Where `loans[loanId]` starts in storage, found rather than hardcoded.
 *
 * The declaration index of the mapping moves whenever a state variable is added
 * above it, and a stale constant would blank some unrelated word.
 */
async function findLoanSlot(provider: JsonRpcProvider, poolAddress: string, loanId: number, borrower: string): Promise<bigint> {
  const { solidityPackedKeccak256 } = await import('ethers')

  for (let declared = 0; declared < 32; declared++) {
    const slot = BigInt(solidityPackedKeccak256(['uint256', 'uint256'], [loanId, declared]))
    const word = BigInt(await provider.getStorage(poolAddress, slot))

    if ((word & ((1n << 160n) - 1n)) === BigInt(borrower)) return slot
  }

  throw new Error(`No storage slot holds loan ${loanId} for ${borrower}`)
}

main().catch((error) => {
  console.error('\nVerification crashed:', error)
  process.exitCode = 1
})
