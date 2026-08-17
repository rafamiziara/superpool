/**
 * Manual integration test for repayment timing — what borrower history is made of.
 *
 * Drives real loans through a live local Hardhat node: one repaid inside its
 * term, one repaid after it, one left running past its due date, one still
 * waiting on the owner. Then indexes them and checks that the stored records
 * can tell those four apart, which is the thing that was not derivable anywhere
 * before `repaidAt` existed — in the contract or in the index.
 *
 * The unit suites mock ethers entirely, so this is the only place the shipped
 * ABI, the chain's own clock and the document shape are exercised together.
 *
 * Prerequisites:
 *   Terminal 1 → cd packages/contracts && pnpm node:local
 *   Terminal 2 → cd packages/contracts && pnpm deploy:local
 *   Terminal 3 → cd config             && npx firebase-tools emulators:start --only firestore --project genesis-super-pool
 *   Terminal 4 → cd packages/backend   && pnpm testHistory
 *
 * Required .env values:
 *   POOL_FACTORY_ADDRESS=<address printed by deploy:local>
 *   CHAIN_ID=31337
 *   RPC_URL=http://127.0.0.1:8545
 *
 * Note this advances the node's clock by a couple of hours. That is the only
 * way to produce a late repayment, and it is irreversible for the run of the
 * node — harmless on a local chain, and worth knowing before wondering why
 * other pools' due dates moved.
 */

// ── Must be set before any firebase-admin import ──────────────────────────────
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080'

import * as dotenv from 'dotenv'
dotenv.config()

import { BaseContract, Contract, JsonRpcProvider, parseEther, Wallet } from 'ethers'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { PoolFactoryABI, LendingPoolABI } from '../src/constants/abis'
import { LOANS_COLLECTION } from '../src/constants/firestore'
import { sweepBlockRange } from '../src/services/eventSweeper'
import { indexLoansByTxHash, loanDocId } from '../src/services/loanIndexer'

// ── Config ────────────────────────────────────────────────────────────────────

const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545'
const CHAIN_ID = parseInt(process.env.CHAIN_ID || '31337')
const FACTORY_ADDRESS = process.env.POOL_FACTORY_ADDRESS || ''

/** A short term, so a repayment can be pushed past it without waiting. */
const SHORT_TERM_SECONDS = 60
const LONG_TERM_SECONDS = 30 * 24 * 60 * 60

/**
 * Hardhat's published accounts. Safe here by construction and nowhere else —
 * these keys are in every Hardhat README on the internet.
 */
const KEYS = {
  owner: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  lender: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  punctual: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  late: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  overdue: '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
  waiting: '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba',
}

/**
 * A Firestore of this run's own, on a project id nobody else uses.
 *
 * Constructed and passed in rather than taken from `../src/services`: env vars
 * do not isolate a script, and a shared project id would mix this run's
 * documents with whatever the emulator already holds. Nothing here ever clears
 * a collection.
 */
const PROJECT_ID = `verify-history-${Date.now()}`
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

/**
 * `connect` is typed as returning `BaseContract`, which has no contract methods
 * on it. `Contract` carries the index signature that makes a dynamic call
 * type-check — the narrowing ethers itself expects, and not a cast to `any`.
 */
function as(contract: BaseContract): Contract {
  return contract as Contract
}

/**
 * Next nonce for an address, tracked here rather than left to the provider.
 *
 * ethers caches `eth_getTransactionCount`, so a burst of awaited sends from the
 * same wallet can still be assigned a nonce that has already been used.
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
      description: 'repayment timing verification',
      requiresMembership: true,
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

/**
 * Settles a loan, quoting an hour ahead.
 *
 * **Not `calculateRepaymentAmount`**, which is the price of the full term and
 * not the bill. Interest accrues per second and is uncapped past the due date,
 * so one of the loans below — a one-minute term repaid two hours late — owes
 * roughly a hundred and twenty times its stated rate. Sending the term's price
 * there does not settle it, and a payment that fails to settle looks like
 * success.
 */
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

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!FACTORY_ADDRESS) {
    console.error('POOL_FACTORY_ADDRESS is not set in packages/backend/.env')
    process.exitCode = 1
    return
  }

  // `cacheTimeout: -1` disables ethers' 250ms read cache. This script moves the
  // chain's clock, and a cached `getBlock('latest')` would hand back a block
  // from before the jump — quoting a repayment for a moment already in the
  // past, which under-charges and quietly fails to settle the loan.
  const provider = new JsonRpcProvider(RPC_URL, undefined, { cacheTimeout: -1 })

  const owner = new Wallet(KEYS.owner, provider)
  const lender = new Wallet(KEYS.lender, provider)
  const punctual = new Wallet(KEYS.punctual, provider)
  const late = new Wallet(KEYS.late, provider)
  const overdue = new Wallet(KEYS.overdue, provider)
  const waiting = new Wallet(KEYS.waiting, provider)
  /** Never touched. The subject for "no history is not a bad history". */
  const stranger = Wallet.createRandom()

  console.log(`\nFactory:    ${FACTORY_ADDRESS}`)
  console.log(`Chain:      ${CHAIN_ID}`)
  console.log(`Firestore:  ${process.env.FIRESTORE_EMULATOR_HOST} (project ${PROJECT_ID})`)

  // ---------------------------------------------------------------------------
  separator('A loan repaid inside its term')
  // ---------------------------------------------------------------------------
  const longPool = await createPool(provider, owner, 'timing', LONG_TERM_SECONDS)
  await admit(provider, longPool, owner, lender)
  await admit(provider, longPool, owner, punctual)

  const deposit = await as(longPool.contract.connect(lender)).depositFunds({
    value: parseEther('40'),
    nonce: await nextNonce(provider, lender.address),
  })
  await deposit.wait()

  const punctualLoan = await borrow(provider, longPool, punctual, parseEther('2'))
  const punctualRepayment = await repay(provider, longPool, punctual, punctualLoan.loanId)
  console.log(`  pool #${longPool.poolId}, loan ${punctualLoan.loanId} repaid in ${punctualRepayment.txHash}`)

  await indexLoansByTxHash(punctualRepayment.txHash, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)

  const punctualDoc = await firestore
    .collection(LOANS_COLLECTION)
    .doc(loanDocId(CHAIN_ID, longPool.poolId, punctualLoan.loanId))
    .get()
  const punctualData = punctualDoc.data() ?? {}
  const chainPunctual = await longPool.contract.getLoan(punctualLoan.loanId)

  check('the record exists', punctualDoc.exists)
  check('repaidAt is stored as a timestamp', punctualData.repaidAt instanceof Timestamp, `got ${typeof punctualData.repaidAt}`)
  check(
    'and matches the stamp the contract wrote',
    punctualData.repaidAt?.toDate().getTime() === Number(chainPunctual.repaidAt) * 1000,
    `stored ${punctualData.repaidAt?.toDate().toISOString()}, chain ${chainPunctual.repaidAt}`
  )

  const punctualDue = punctualData.startedAt.toDate().getTime() + punctualData.duration * 1000
  check('and falls inside the term, so the repayment reads as on time', punctualData.repaidAt.toDate().getTime() <= punctualDue)

  // ---------------------------------------------------------------------------
  separator('A loan repaid after its term')
  // ---------------------------------------------------------------------------
  // The check the whole milestone turns on: before `repaidAt`, this record and
  // the one above were indistinguishable.
  const shortPool = await createPool(provider, owner, 'overdue', SHORT_TERM_SECONDS)
  await admit(provider, shortPool, owner, lender)
  await admit(provider, shortPool, owner, late)
  await admit(provider, shortPool, owner, overdue)

  const shortDeposit = await as(shortPool.contract.connect(lender)).depositFunds({
    value: parseEther('40'),
    nonce: await nextNonce(provider, lender.address),
  })
  await shortDeposit.wait()

  const lateLoan = await borrow(provider, shortPool, late, parseEther('2'))
  const overdueLoan = await borrow(provider, shortPool, overdue, parseEther('2'))

  await advanceTime(provider, 2 * 60 * 60)

  const lateRepayment = await repay(provider, shortPool, late, lateLoan.loanId)
  console.log(`  pool #${shortPool.poolId}, loan ${lateLoan.loanId} repaid two hours into a one-minute term`)

  await indexLoansByTxHash(lateRepayment.txHash, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)

  const lateDoc = await firestore
    .collection(LOANS_COLLECTION)
    .doc(loanDocId(CHAIN_ID, shortPool.poolId, lateLoan.loanId))
    .get()
  const lateData = lateDoc.data() ?? {}
  const lateDue = lateData.startedAt.toDate().getTime() + lateData.duration * 1000

  check('it is repaid', lateData.isRepaid === true)
  check(
    'and its stamp falls after the term, so the two records differ',
    lateData.repaidAt.toDate().getTime() > lateDue,
    `repaid ${lateData.repaidAt.toDate().toISOString()}, due ${new Date(lateDue).toISOString()}`
  )

  // ---------------------------------------------------------------------------
  separator('A loan still running past its due date')
  // ---------------------------------------------------------------------------
  await indexLoansByTxHash(overdueLoan.txHash, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)

  const overdueDoc = await firestore
    .collection(LOANS_COLLECTION)
    .doc(loanDocId(CHAIN_ID, shortPool.poolId, overdueLoan.loanId))
    .get()
  const overdueData = overdueDoc.data() ?? {}
  const overdueDue = overdueData.startedAt.toDate().getTime() + overdueData.duration * 1000

  check('it is disbursed and unsettled', overdueData.status === 'disbursed' && overdueData.isRepaid === false)
  check('it carries no repayment date at all', overdueData.repaidAt === undefined, `got ${overdueData.repaidAt}`)

  // Against the chain's clock, not this machine's. The app compares the due
  // date with `Date.now()`, which is right in production — block timestamps
  // track real time — and wrong on a node whose clock has been pushed forward,
  // as it has been two lines above. Worth knowing before reading an app screen
  // against a local chain and concluding nothing is overdue.
  const chainNow = (await provider.getBlock('latest'))!.timestamp * 1000

  check(
    'and its due date is in the chain’s past, computed from the startTime it recorded',
    overdueDue < chainNow,
    `due ${new Date(overdueDue).toISOString()}, chain now ${new Date(chainNow).toISOString()}`
  )

  // ---------------------------------------------------------------------------
  separator('A request nobody has decided on')
  // ---------------------------------------------------------------------------
  const approvalPool = await createPool(provider, owner, 'approval', LONG_TERM_SECONDS)
  await admit(provider, approvalPool, owner, lender)
  await admit(provider, approvalPool, owner, waiting)

  const approvalDeposit = await as(approvalPool.contract.connect(lender)).depositFunds({
    value: parseEther('40'),
    nonce: await nextNonce(provider, lender.address),
  })
  await approvalDeposit.wait()

  const requireApproval = await approvalPool.contract.setRequiresApproval(true, { nonce: await nextNonce(provider, owner.address) })
  await requireApproval.wait()

  const requestTx = await as(approvalPool.contract.connect(waiting)).requestLoan(parseEther('1'), {
    nonce: await nextNonce(provider, waiting.address),
  })
  const requestReceipt = await requestTx.wait()
  const requestedLoanId = Number((await approvalPool.contract.nextLoanId()) - 1n)

  await indexLoansByTxHash(requestReceipt.hash, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)

  const requestDoc = await firestore
    .collection(LOANS_COLLECTION)
    .doc(loanDocId(CHAIN_ID, approvalPool.poolId, requestedLoanId))
    .get()
  const requestData = requestDoc.data() ?? {}

  check('it is stored as requested', requestData.status === 'requested')
  // `isRepaid` is false on a request too, which is exactly why nothing may read
  // it without checking `status` first — a queue of requests would otherwise
  // read as a pile of unpaid debts.
  check('it is not repaid, and not a debt either', requestData.isRepaid === false)
  check('and has no repayment date', requestData.repaidAt === undefined)

  // ---------------------------------------------------------------------------
  separator('Approval restamps the loan, and the record follows it')
  // ---------------------------------------------------------------------------
  const requestedStartedAt = requestData.startedAt.toDate().getTime()

  const approveTx = await approvalPool.contract.approveLoan(requestedLoanId, { nonce: await nextNonce(provider, owner.address) })
  const approveReceipt = await approveTx.wait()

  await indexLoansByTxHash(approveReceipt.hash, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)

  const approvedDoc = await firestore
    .collection(LOANS_COLLECTION)
    .doc(loanDocId(CHAIN_ID, approvalPool.poolId, requestedLoanId))
    .get()
  const approvedData = approvedDoc.data() ?? {}

  check('the loan is disbursed now', approvedData.status === 'disbursed')
  check('its date moved to the approval', approvedData.startedAt.toDate().getTime() >= requestedStartedAt)
  check(
    'and the transaction it points at moved with the date',
    approvedData.transactionHash === approveReceipt.hash,
    `stored ${approvedData.transactionHash}, approval ${approveReceipt.hash}`
  )

  // ---------------------------------------------------------------------------
  separator('Re-indexing does not lose the repayment date')
  // ---------------------------------------------------------------------------
  // The trap: a sweep sees `LoanCreated` on every pass forever, long after the
  // loan was settled. Re-indexing the *creating* transaction must report the
  // loan as it is now, stamp included.
  await indexLoansByTxHash(punctualLoan.txHash, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)

  const afterRerun = await firestore
    .collection(LOANS_COLLECTION)
    .doc(loanDocId(CHAIN_ID, longPool.poolId, punctualLoan.loanId))
    .get()
  const afterRerunData = afterRerun.data() ?? {}

  check('the loan is still repaid', afterRerunData.isRepaid === true)
  check(
    'and still carries the same repayment date',
    afterRerunData.repaidAt?.toDate().getTime() === punctualData.repaidAt.toDate().getTime(),
    `now ${afterRerunData.repaidAt?.toDate().toISOString()}`
  )
  // This loan was first seen at its repayment, so the record pointed there
  // until the creating transaction turned up. Live-found: without the earlier
  // block winning, the reference stays on whichever event arrived first and a
  // row shows a disbursement date beside a link to the settlement.
  check(
    'and the reference has settled on the transaction that created the loan',
    afterRerunData.transactionHash === punctualLoan.txHash,
    `stored ${afterRerunData.transactionHash}, creation ${punctualLoan.txHash}`
  )

  const settled = await indexLoansByTxHash(punctualLoan.txHash, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)

  check('a further re-index writes nothing at all', settled.results[0]?.stored === false)
  check('and says the record was already current', settled.results[0]?.alreadyIndexed === true)

  // ---------------------------------------------------------------------------
  separator('The block sweep sees the same thing')
  // ---------------------------------------------------------------------------
  const sweepPool = await createPool(provider, owner, 'sweep', LONG_TERM_SECONDS)
  await admit(provider, sweepPool, owner, lender)
  await admit(provider, sweepPool, owner, punctual)

  const sweepDeposit = await as(sweepPool.contract.connect(lender)).depositFunds({
    value: parseEther('40'),
    nonce: await nextNonce(provider, lender.address),
  })
  await sweepDeposit.wait()

  const sweptLoan = await borrow(provider, sweepPool, punctual, parseEther('2'))
  const sweptRepayment = await repay(provider, sweepPool, punctual, sweptLoan.loanId)

  const counts = await sweepBlockRange({
    provider,
    firestore,
    chainId: CHAIN_ID,
    factoryAddress: FACTORY_ADDRESS,
    fromBlock: sweptLoan.blockNumber,
    toBlock: sweptRepayment.blockNumber,
  })

  check('the sweep counts the loan', counts.loans >= 1, `counted ${counts.loans}`)

  const sweptDoc = await firestore
    .collection(LOANS_COLLECTION)
    .doc(loanDocId(CHAIN_ID, sweepPool.poolId, sweptLoan.loanId))
    .get()
  const sweptData = sweptDoc.data() ?? {}
  const chainSwept = await sweepPool.contract.getLoan(sweptLoan.loanId)

  check('and stored the repayment date without ever seeing the receipt', sweptData.repaidAt instanceof Timestamp)
  check(
    'matching the contract',
    sweptData.repaidAt?.toDate().getTime() === Number(chainSwept.repaidAt) * 1000,
    `stored ${sweptData.repaidAt?.toDate().toISOString()}, chain ${chainSwept.repaidAt}`
  )

  // ---------------------------------------------------------------------------
  separator('What each borrower’s history is made of')
  // ---------------------------------------------------------------------------
  // The same counting the app does, over the records this run produced. Read
  // per wallet, because that is how a pool owner reads it.
  async function loansOf(address: string) {
    const snapshot = await firestore.collection(LOANS_COLLECTION).where('borrower', '==', address.toLowerCase()).get()

    return snapshot.docs.map((doc) => doc.data())
  }

  const punctualLoans = (await loansOf(punctual.address)).filter((loan) => loan.status === 'disbursed')
  const lateLoans = (await loansOf(late.address)).filter((loan) => loan.status === 'disbursed')
  const strangerLoans = await loansOf(stranger.address)

  const onTime = punctualLoans.filter(
    (loan) => loan.isRepaid && loan.repaidAt && loan.repaidAt.toDate().getTime() <= loan.startedAt.toDate().getTime() + loan.duration * 1000
  )
  const overdueOnes = lateLoans.filter(
    (loan) => loan.isRepaid && loan.repaidAt && loan.repaidAt.toDate().getTime() > loan.startedAt.toDate().getTime() + loan.duration * 1000
  )

  check('the punctual borrower has repayments, all inside their terms', onTime.length === punctualLoans.length && onTime.length >= 2)
  check('the late one has a repayment outside it', overdueOnes.length === 1, `found ${overdueOnes.length}`)
  check('a wallet nobody has lent to has no record at all, rather than a bad one', strangerLoans.length === 0)

  // ---------------------------------------------------------------------------
  separator(`${passed} passed, ${failed} failed`)
  // ---------------------------------------------------------------------------
  if (failed > 0) {
    console.log('\nFailures:')
    failures.forEach((failure) => console.log(`  • ${failure}`))
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error('\nVerification crashed:', error)
  process.exitCode = 1
})
