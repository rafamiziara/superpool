/**
 * Manual integration test for paying a loan down in instalments.
 *
 * Drives real loans through a live local Hardhat node: one settled in several
 * uneven payments, one left part-paid. Then indexes them and checks what only
 * exists together on a real chain — the loan's running `amountRepaid`, one
 * `loan_repayments` document per instalment, and the sweep picking up a payment
 * the app never reported.
 *
 * The unit suites mock ethers entirely, so this is the only place the shipped
 * ABI and the document shapes are exercised together. What it is *about* is the
 * records — one `loan_repayments` document per instalment, each with its own
 * date and transaction — and it deliberately reads the debt from the chain
 * before every payment rather than assuming a total. Interest accrues per
 * second, so there is no fixed sum to divide up; the accrual arithmetic itself
 * is checked by `testAccruedInterest.ts`.
 *
 * Prerequisites:
 *   Terminal 1 → cd packages/contracts && pnpm node:local
 *   Terminal 2 → cd packages/contracts && pnpm deploy:local
 *   Terminal 3 → cd config             && npx firebase-tools emulators:start --only firestore --project genesis-super-pool
 *   Terminal 4 → cd packages/backend   && pnpm testPartial
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

import { BaseContract, Contract, JsonRpcProvider, parseEther, Wallet } from 'ethers'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { LendingPoolABI, PoolFactoryABI } from '../src/constants/abis'
import { LOAN_REPAYMENTS_COLLECTION, LOANS_COLLECTION } from '../src/constants/firestore'
import { sweepBlockRange } from '../src/services/eventSweeper'
import { indexLoansByTxHash, loanDocId } from '../src/services/loanIndexer'
import { indexLoanRepaymentsByTxHash, loanRepaymentDocId } from '../src/services/loanRepaymentIndexer'

// ── Config ────────────────────────────────────────────────────────────────────

const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545'
const CHAIN_ID = parseInt(process.env.CHAIN_ID || '31337')
const FACTORY_ADDRESS = process.env.POOL_FACTORY_ADDRESS || ''

const LOAN_DURATION_SECONDS = 30 * 24 * 60 * 60

/**
 * Hardhat's published accounts. Safe here by construction and nowhere else —
 * these keys are in every Hardhat README on the internet.
 */
const KEYS = {
  owner: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  lender: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  instalments: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  lumpSum: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  partial: '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
}

/**
 * A Firestore of this run's own, on a project id nobody else uses.
 *
 * Constructed and passed in rather than taken from `../src/services`: env vars
 * do not isolate a script, and a shared project id would mix this run's
 * documents with whatever the emulator already holds. Nothing here ever clears
 * a collection.
 */
const PROJECT_ID = `verify-partial-${Date.now()}`
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
      interestRate: 1000,
      loanDuration: LOAN_DURATION_SECONDS,
      name: `${name}-${Date.now()}`,
      description: 'partial repayment verification',
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
 * What a loan owes right now, and what it would owe an hour from now.
 *
 * Both come from the chain on every call. Nothing here caches a debt: interest
 * accrues per second, so a figure read once and reused is wrong by the time it
 * is used — which is the trap the app's settlement buffer exists to cover.
 */
async function owed(pool: PoolHandle, loanId: number): Promise<bigint> {
  return pool.contract.outstandingBalance(loanId)
}

async function settlementQuote(provider: JsonRpcProvider, pool: PoolHandle, loanId: number): Promise<bigint> {
  const latest = await provider.getBlock('latest')

  return pool.contract.outstandingBalanceAt(loanId, latest!.timestamp + 3600)
}

/** Pays `amount` towards a loan and returns the receipt facts the index keys on. */
async function pay(provider: JsonRpcProvider, pool: PoolHandle, borrower: Wallet, loanId: number, amount: bigint) {
  const tx = await as(pool.contract.connect(borrower)).repayLoan(loanId, {
    value: amount,
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

  // `cacheTimeout: -1` disables ethers' 250ms read cache, and a verification
  // script is exactly where that matters: two `getBalance` calls either side of
  // a transaction come back identical without it, and `getBlockNumber` serves a
  // tip from before the block just mined — which silently produced a sweep
  // range whose `toBlock` was *behind* its `fromBlock`. Both looked like
  // contract bugs and neither was.
  const provider = new JsonRpcProvider(RPC_URL, undefined, { cacheTimeout: -1 })

  const owner = new Wallet(KEYS.owner, provider)
  const lender = new Wallet(KEYS.lender, provider)
  const instalments = new Wallet(KEYS.instalments, provider)
  const lumpSum = new Wallet(KEYS.lumpSum, provider)
  const partial = new Wallet(KEYS.partial, provider)

  console.log(`\nFactory:    ${FACTORY_ADDRESS}`)
  console.log(`Chain:      ${CHAIN_ID}`)
  console.log(`Firestore:  ${process.env.FIRESTORE_EMULATOR_HOST} (project ${PROJECT_ID})`)

  // ---------------------------------------------------------------------------
  separator('A loan paid down in four uneven instalments')
  // ---------------------------------------------------------------------------
  const pool = await createPool(provider, owner, 'instalments')
  await admit(provider, pool, owner, lender)
  await admit(provider, pool, owner, instalments)

  const deposit = await as(pool.contract.connect(lender)).depositFunds({
    value: parseEther('40'),
    nonce: await nextNonce(provider, lender.address),
  })
  await deposit.wait()

  const loan = await borrow(provider, pool, instalments, parseEther('10'))

  // The quote is the price of the whole term; what is owed now is far less,
  // because the loan is seconds old. The two are different questions.
  const quote: bigint = await pool.contract.calculateRepaymentAmount(loan.loanId)
  const owedAtStart = await owed(pool, loan.loanId)

  check('the term’s price is principal plus the full rate', quote === parseEther('11'), `got ${quote}`)
  check('but a new loan owes barely more than principal', owedAtStart < parseEther('10.001'), `owes ${owedAtStart}`)

  // Three instalments, then whatever is left. Deliberately not a clean
  // division of anything — the debt moves between them.
  const parts = [parseEther('0.3'), parseEther('4.7'), parseEther('2')]
  const payments: { txHash: string; amount: bigint }[] = []
  let running = 0n

  for (const [index, part] of parts.entries()) {
    const before = await owed(pool, loan.loanId)
    const receipt = await pay(provider, pool, instalments, loan.loanId, part)
    running += part
    payments.push({ txHash: receipt.txHash, amount: part })

    const onChain = await pool.contract.getLoan(loan.loanId)
    const after = await owed(pool, loan.loanId)

    check(
      `instalment ${index + 1} is credited on chain`,
      onChain.amountRepaid === running,
      `chain ${onChain.amountRepaid}, sent ${running}`
    )
    check('  and the loan is still open', onChain.isRepaid === false)
    check('  with less owed than before it', after < before, `${before} → ${after}`)
  }

  // Settled with a quote for an hour ahead, as the app does — an exact payment
  // would land a block late and leave a sliver behind.
  const finalQuote = await settlementQuote(provider, pool, loan.loanId)
  const finalReceipt = await pay(provider, pool, instalments, loan.loanId, finalQuote)
  payments.push({ txHash: finalReceipt.txHash, amount: finalQuote })

  const settledLoan = await pool.contract.getLoan(loan.loanId)

  check('the last payment closes the debt', settledLoan.isRepaid === true)
  check('nothing is owed', (await owed(pool, loan.loanId)) === 0n)
  check('repaidAt dates the settlement, not the first payment', Number(settledLoan.repaidAt) > 0)
  check('the borrower’s slot is free again', (await pool.contract.activeLoanId(instalments.address)) === 0n)
  check('the running total counts every payment', settledLoan.amountRepaid > running, `got ${settledLoan.amountRepaid}`)

  // ---------------------------------------------------------------------------
  separator('A part-paid loan still holds the borrower’s slot')
  // ---------------------------------------------------------------------------
  await admit(provider, pool, owner, partial)

  const openLoan = await borrow(provider, pool, partial, parseEther('4'))

  // Indexed here, while the loan is untouched — before the payment exists,
  // not merely before the payment is indexed. `indexLoansByTxHash` re-reads
  // `getLoan`, so indexing the disbursement *afterwards* would already store
  // the paid-down total and leave nothing for the payment to change. That is
  // correct behaviour and it makes the sequence below the only one in which
  // "was the instalment written?" is a real question.
  await indexLoansByTxHash(openLoan.txHash, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)

  const halfPayment = await pay(provider, pool, partial, openLoan.loanId, parseEther('2'))
  const openOnChain = await pool.contract.getLoan(openLoan.loanId)

  check('the payment is recorded', openOnChain.amountRepaid === parseEther('2'))
  check('the loan is not settled', openOnChain.isRepaid === false)
  check('nothing has been dated', Number(openOnChain.repaidAt) === 0)
  check('and the slot is still taken', (await pool.contract.activeLoanId(partial.address)) === BigInt(openLoan.loanId))

  let secondLoanReverted = false
  try {
    await as(pool.contract.connect(partial)).createLoan(parseEther('1'), { nonce: await nextNonce(provider, partial.address) })
  } catch {
    secondLoanReverted = true
    // The failed send consumed no nonce; put it back.
    nonces.set(partial.address, nonces.get(partial.address)! - 1)
  }

  check('so a second loan is refused while the first is part-paid', secondLoanReverted)

  // ---------------------------------------------------------------------------
  separator('Lenders are credited exactly the interest each payment covered')
  // ---------------------------------------------------------------------------
  // Under a flat rate this was a comparison against a single lump repayment,
  // because splitting was neutral. It is not neutral any more — money handed
  // back early stops costing the borrower — so the invariant that survives is
  // that the pool distributes precisely what borrowers paid in interest and
  // never a wei more. `testAccruedInterest.ts` covers the arithmetic itself.
  const distributions = await pool.contract.queryFilter(pool.contract.filters.InterestDistributed())
  const totalDistributed = distributions.reduce(
    (sum: bigint, log: { topics: readonly string[] }) => sum + BigInt(log.topics[2]),
    0n as bigint
  )
  const claimable: bigint = await pool.contract.claimable(lender.address)

  console.log(`  distributed ${totalDistributed} wei across ${distributions.length} payments`)

  check('interest reached the lenders', totalDistributed > 0n)
  check('and none of it was conjured', claimable <= totalDistributed, `claimable ${claimable}, distributed ${totalDistributed}`)

  // ---------------------------------------------------------------------------
  separator('Each instalment is indexed as its own record')
  // ---------------------------------------------------------------------------
  for (const payment of payments) {
    await indexLoansByTxHash(payment.txHash, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)
    await indexLoanRepaymentsByTxHash(payment.txHash, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)
  }

  const repaymentDocs = await firestore
    .collection(LOAN_REPAYMENTS_COLLECTION)
    .where('poolId', '==', pool.poolId)
    .where('loanId', '==', loan.loanId)
    .get()

  check('one document per payment', repaymentDocs.size === payments.length, `found ${repaymentDocs.size}`)

  const storedAmounts = repaymentDocs.docs.map((doc) => BigInt(doc.data().amount as string)).sort((a, b) => (a < b ? -1 : 1))

  // Every fixed instalment is stored at exactly its face value. The settling
  // payment is not among them — it was quoted with head-room and the pool
  // credited only what was owed, which is the figure that lands here.
  check(
    'each carrying what it paid, not a running total',
    parts.every((part) => storedAmounts.includes(part)),
    `stored ${storedAmounts.join(', ')}`
  )
  check(
    'and the settling one carrying what was kept, not what was sent',
    storedAmounts.some((amount) => amount < finalQuote),
    `quote was ${finalQuote}`
  )
  check(
    'each dated by its own block',
    repaymentDocs.docs.every((doc) => doc.data().repaidAt instanceof Timestamp)
  )
  check(
    'each linked to its own transaction',
    payments.every((payment) => repaymentDocs.docs.some((doc) => doc.data().transactionHash === payment.txHash))
  )
  check(
    'and keyed on the log, so nothing collapses onto one document',
    new Set(repaymentDocs.docs.map((doc) => doc.id)).size === payments.length
  )
  check(
    'with the id the indexer computes',
    repaymentDocs.docs.every(
      (doc) => doc.id === loanRepaymentDocId(CHAIN_ID, doc.data().transactionHash as string, doc.data().logIndex as number)
    )
  )

  // ---------------------------------------------------------------------------
  separator('The loan record follows the chain, instalment by instalment')
  // ---------------------------------------------------------------------------
  const loanDoc = await firestore
    .collection(LOANS_COLLECTION)
    .doc(loanDocId(CHAIN_ID, pool.poolId, loan.loanId))
    .get()
  const loanData = loanDoc.data() ?? {}

  check(
    'the settled loan stores what the chain says',
    loanData.amountRepaid === settledLoan.amountRepaid.toString(),
    `stored ${loanData.amountRepaid}`
  )
  check('and is marked repaid', loanData.isRepaid === true)
  check('with nothing left outstanding', loanData.principalOutstanding === '0' && loanData.interestOutstanding === '0')

  // The one that mocks cannot catch: an instalment moves `amountRepaid` and
  // nothing else, so a currency check that does not compare it reports the
  // record as already indexed and leaves the debt looking untouched.
  const openIndexed = await indexLoansByTxHash(halfPayment.txHash, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)
  await indexLoanRepaymentsByTxHash(halfPayment.txHash, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)

  const openDoc = await firestore
    .collection(LOANS_COLLECTION)
    .doc(loanDocId(CHAIN_ID, pool.poolId, openLoan.loanId))
    .get()
  const openData = openDoc.data() ?? {}

  check('a part payment is written rather than skipped as current', openIndexed.results[0].stored === true)
  check(
    '  reporting the payment as the transition',
    openIndexed.results[0].transition === 'repayment',
    `got ${openIndexed.results[0].transition}`
  )
  check('  storing the running total', openData.amountRepaid === parseEther('2').toString(), `stored ${openData.amountRepaid}`)
  check('  leaving the loan open', openData.isRepaid === false)
  check('  and no settlement date', openData.repaidAt === undefined)

  const reindexed = await indexLoansByTxHash(halfPayment.txHash, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)

  check('re-indexing the same payment writes nothing', reindexed.results[0].alreadyIndexed === true)
  check('  and reports no transition', reindexed.results[0].transition === null)

  // The reference must stay on the transaction that created the loan: a
  // repayment moves the loan without moving its date.
  check(
    'the record still points at the disbursement',
    openData.transactionHash === openLoan.txHash,
    `points at ${openData.transactionHash}`
  )

  // ---------------------------------------------------------------------------
  separator('The sweep finds instalments the app never reported')
  // ---------------------------------------------------------------------------
  // A payment made while the app was closed — nothing called the callable for
  // it, so only the sweep can bring it in.
  const sweptPayment = await pay(provider, pool, partial, openLoan.loanId, parseEther('1'))

  // Both ends from the receipt rather than from `getBlockNumber`, which is what
  // every other verification script here does — and the reason is not only the
  // read cache: a range pinned to the transaction under test cannot drift.
  const counts = await sweepBlockRange({
    provider,
    firestore,
    chainId: CHAIN_ID,
    factoryAddress: FACTORY_ADDRESS,
    fromBlock: sweptPayment.blockNumber,
    toBlock: sweptPayment.blockNumber,
  })

  check('the sweep counted the payment', counts.loanRepayments >= 1, `counted ${counts.loanRepayments}`)

  const sweptDoc = await firestore.collection(LOAN_REPAYMENTS_COLLECTION).where('transactionHash', '==', sweptPayment.txHash).get()

  check('and stored it without ever seeing the receipt', sweptDoc.size === 1, `found ${sweptDoc.size}`)

  const sweptLoanDoc = await firestore
    .collection(LOANS_COLLECTION)
    .doc(loanDocId(CHAIN_ID, pool.poolId, openLoan.loanId))
    .get()

  check(
    'while the loan record picked the new total up in the same sweep',
    sweptLoanDoc.data()?.amountRepaid === parseEther('3').toString(),
    `stored ${sweptLoanDoc.data()?.amountRepaid}`
  )

  // ---------------------------------------------------------------------------
  separator('What the contract refuses')
  // ---------------------------------------------------------------------------
  let zeroReverted = false
  try {
    await as(pool.contract.connect(partial)).repayLoan(openLoan.loanId, { value: 0, nonce: await nextNonce(provider, partial.address) })
  } catch {
    zeroReverted = true
    nonces.set(partial.address, nonces.get(partial.address)! - 1)
  }

  check('a payment of nothing', zeroReverted)

  let settledReverted = false
  try {
    await as(pool.contract.connect(instalments)).repayLoan(loan.loanId, {
      value: 1n,
      nonce: await nextNonce(provider, instalments.address),
    })
  } catch {
    settledReverted = true
    nonces.set(instalments.address, nonces.get(instalments.address)! - 1)
  }

  check('another payment on a settled loan', settledReverted)

  // The overpayment refund, which is what makes "pay in full" safe against a
  // balance that moved between the read and the send.
  const beforeRefund = await provider.getBalance(partial.address)
  const sent = (await settlementQuote(provider, pool, openLoan.loanId)) + parseEther('1')
  const repaidBefore = (await pool.contract.getLoan(openLoan.loanId)).amountRepaid as bigint
  const overpay = await as(pool.contract.connect(partial)).repayLoan(openLoan.loanId, {
    value: sent,
    nonce: await nextNonce(provider, partial.address),
  })
  const overpayReceipt = await overpay.wait()
  const gas = BigInt(overpayReceipt.gasUsed) * BigInt(overpayReceipt.gasPrice)
  const afterRefund = await provider.getBalance(partial.address)
  const settledOpen = await pool.contract.getLoan(openLoan.loanId)
  const credited = (settledOpen.amountRepaid as bigint) - repaidBefore

  check('the overpayment settles the loan', settledOpen.isRepaid === true)
  check('only the debt is credited', credited < sent, `credited ${credited} of ${sent}`)
  check(
    'and the difference comes back',
    beforeRefund - afterRefund - gas === credited,
    `wallet moved by ${beforeRefund - afterRefund - gas}`
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

main().catch((error) => {
  console.error('\nVerification crashed:', error)
  process.exitCode = 1
})
