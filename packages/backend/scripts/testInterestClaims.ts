/**
 * Manual integration test for interest-claim indexing.
 *
 * Drives a real claim through a live local Hardhat node, then indexes it two
 * ways — the on-demand service and the block sweep — and checks what landed in
 * Firestore against what the chain actually holds. The unit suites mock ethers
 * entirely, so this is the only thing that exercises the shipped ABI, the log
 * decoding and the document shape together.
 *
 * Prerequisites:
 *   Terminal 1 → cd packages/contracts && pnpm node:local
 *   Terminal 2 → cd packages/contracts && pnpm deploy:local
 *   Terminal 3 → cd config             && npx firebase-tools emulators:start --only firestore --project genesis-super-pool
 *   Terminal 4 → cd packages/backend   && pnpm testInterest
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

import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { BaseContract, Contract, JsonRpcProvider, parseEther, Wallet } from 'ethers'
import { PoolFactoryABI, LendingPoolABI } from '../src/constants/abis'
import { INTEREST_CLAIMS_COLLECTION } from '../src/constants/firestore'
import { indexInterestClaimsByTxHash } from '../src/services/interestClaimIndexer'
import { sweepBlockRange } from '../src/services/eventSweeper'

// ── Config ────────────────────────────────────────────────────────────────────

const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545'
const CHAIN_ID = parseInt(process.env.CHAIN_ID || '31337')
const FACTORY_ADDRESS = process.env.POOL_FACTORY_ADDRESS || ''

/**
 * Hardhat's published accounts. Safe here by construction and nowhere else —
 * these keys are in every Hardhat README on the internet.
 */
const KEYS = {
  owner: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  lender: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  borrower: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
}

/**
 * A Firestore of this run's own, on a project id nobody else uses.
 *
 * Constructed and passed in rather than taken from `../src/services`: env vars
 * do not isolate a script, and a shared project id would mix this run's
 * documents with whatever the emulator already holds. Nothing here ever clears
 * a collection.
 */
const PROJECT_ID = `verify-interest-${Date.now()}`
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
 * same wallet can still be assigned a nonce that has already been used —
 * "Nonce too low. Expected 78 but got 77". Counting locally is the only
 * reliable answer, and it is why nothing below fires a transaction it does not
 * await: a doomed send still consumes a number and wedges everything behind it.
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
 * Produces a real `InterestClaimed` transaction, and returns its hash.
 *
 * Every send is awaited rather than fired and forgotten: a doomed transaction
 * still advances the account's nonce and wedges the wallet behind it.
 */
async function produceClaim(provider: JsonRpcProvider) {
  const owner = new Wallet(KEYS.owner, provider)
  const lender = new Wallet(KEYS.lender, provider)
  const borrower = new Wallet(KEYS.borrower, provider)

  const factory = new Contract(FACTORY_ADDRESS, PoolFactoryABI, owner)

  const createTx = await factory.createPool(
    {
      maxLoanAmount: parseEther('100'),
      interestRate: 1000,
      loanDuration: 30 * 24 * 60 * 60,
      name: `claim-indexing-${Date.now()}`,
      description: 'interest claim indexing verification',
      requiresMembership: true,
    },
    { nonce: await nextNonce(provider, owner.address) }
  )
  const createReceipt = await createTx.wait()

  const created = createReceipt.logs
    .map((log: { topics: string[]; data: string }) => {
      try {
        return factory.interface.parseLog(log)
      } catch {
        return null
      }
    })
    .find((parsed: { name: string } | null) => parsed?.name === 'PoolCreated')

  const poolAddress: string = created.args.poolAddress
  const poolId = Number(created.args.poolId)

  const pool = new Contract(poolAddress, LendingPoolABI, owner)

  for (const account of [lender, borrower]) {
    const request = await as(pool.connect(account)).requestMembership({ nonce: await nextNonce(provider, account.address) })
    await request.wait()

    const approve = await pool.approveMember(account.address, { nonce: await nextNonce(provider, owner.address) })
    await approve.wait()
  }

  const deposit = await as(pool.connect(lender)).depositFunds({
    value: parseEther('20'),
    nonce: await nextNonce(provider, lender.address),
  })
  await deposit.wait()

  const borrow = await as(pool.connect(borrower)).createLoan(parseEther('10'), {
    nonce: await nextNonce(provider, borrower.address),
  })
  await borrow.wait()

  const loanId = (await pool.nextLoanId()) - 1n
  const due = await pool.calculateRepaymentAmount(loanId)

  const repay = await as(pool.connect(borrower)).repayLoan(loanId, {
    value: due,
    nonce: await nextNonce(provider, borrower.address),
  })
  await repay.wait()

  const claimable: bigint = await pool.claimable(lender.address)
  const claimTx = await as(pool.connect(lender)).claimInterest({ nonce: await nextNonce(provider, lender.address) })
  const claimReceipt = await claimTx.wait()

  return {
    txHash: claimReceipt.hash as string,
    blockNumber: claimReceipt.blockNumber as number,
    poolId,
    poolAddress,
    claimer: lender.address,
    amount: claimable,
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!FACTORY_ADDRESS) {
    console.error('POOL_FACTORY_ADDRESS is not set in packages/backend/.env')
    process.exitCode = 1
    return
  }

  const provider = new JsonRpcProvider(RPC_URL)

  console.log(`\nFactory:    ${FACTORY_ADDRESS}`)
  console.log(`Chain:      ${CHAIN_ID}`)
  console.log(`Firestore:  ${process.env.FIRESTORE_EMULATOR_HOST} (project ${PROJECT_ID})`)

  separator('Producing a real claim on chain')
  const claim = await produceClaim(provider)
  console.log(`  pool #${claim.poolId} at ${claim.poolAddress}`)
  console.log(`  claimed ${claim.amount} wei in ${claim.txHash}`)

  // ---------------------------------------------------------------------------
  separator('The on-demand indexer')
  // ---------------------------------------------------------------------------
  const result = await indexInterestClaimsByTxHash(claim.txHash, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)

  // The shape trap: the service returns {claims, results}. `storedCount` and
  // `alreadyIndexed` are the callable's job, and asserting them here would be
  // comparing against undefined.
  check('returns {claims, results}, not the callable shape', Object.keys(result).sort().join(',') === 'claims,results')
  check('finds exactly one claim in the transaction', result.claims.length === 1)
  check('stored it', result.results[0]?.stored === true)
  check('resolved the pool id through the factory', result.claims[0]?.poolId === claim.poolId)

  const docId = `${CHAIN_ID}-${claim.txHash.toLowerCase()}-${result.claims[0].logIndex}`
  const stored = await firestore.collection(INTEREST_CLAIMS_COLLECTION).doc(docId).get()

  check('wrote a document keyed on the log, not the transaction', stored.exists, `looked for ${docId}`)

  const data = stored.data() ?? {}
  check('the amount matches what the chain paid', data.amount === claim.amount.toString(), `stored ${data.amount}, chain ${claim.amount}`)
  check('the account is lowercased, so a wallet filter matches', data.account === claim.claimer.toLowerCase(), `stored ${data.account}`)
  check('the pool address is recorded', String(data.poolAddress).toLowerCase() === claim.poolAddress.toLowerCase())
  check('the block number is recorded', data.blockNumber === claim.blockNumber)
  check('claimedAt is a timestamp, dated from the block', typeof data.claimedAt?.toDate === 'function')

  // ---------------------------------------------------------------------------
  separator('Re-indexing the same transaction')
  // ---------------------------------------------------------------------------
  const again = await indexInterestClaimsByTxHash(claim.txHash, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)

  check('writes nothing the second time', again.results[0]?.stored === false)
  check('and says so', again.results[0]?.alreadyIndexed === true)

  const count = await firestore.collection(INTEREST_CLAIMS_COLLECTION).where('transactionHash', '==', claim.txHash).count().get()
  check('leaving exactly one document', count.data().count === 1, `found ${count.data().count}`)

  // ---------------------------------------------------------------------------
  separator('The block sweep')
  // ---------------------------------------------------------------------------
  // A second claim, indexed only by the sweep — the scheduled net for one whose
  // immediate indexing failed.
  const swept = await produceClaim(provider)
  console.log(`  second claim in block ${swept.blockNumber}`)

  const counts = await sweepBlockRange({
    provider,
    firestore,
    chainId: CHAIN_ID,
    factoryAddress: FACTORY_ADDRESS,
    fromBlock: swept.blockNumber,
    toBlock: swept.blockNumber,
  })

  check('the sweep counts the claim', counts.interestClaims === 1, `counted ${counts.interestClaims}`)

  const sweptDocs = await firestore.collection(INTEREST_CLAIMS_COLLECTION).where('transactionHash', '==', swept.txHash).get()
  check('and wrote it', sweptDocs.size === 1, `found ${sweptDocs.size}`)
  check(
    'with the amount the chain paid',
    sweptDocs.docs[0]?.data().amount === swept.amount.toString(),
    `stored ${sweptDocs.docs[0]?.data().amount}, chain ${swept.amount}`
  )

  const resweep = await sweepBlockRange({
    provider,
    firestore,
    chainId: CHAIN_ID,
    factoryAddress: FACTORY_ADDRESS,
    fromBlock: swept.blockNumber,
    toBlock: swept.blockNumber,
  })

  check('a re-sweep of the same range writes nothing', resweep.interestClaims === 0, `counted ${resweep.interestClaims}`)

  const afterResweep = await firestore.collection(INTEREST_CLAIMS_COLLECTION).where('transactionHash', '==', swept.txHash).count().get()
  check('leaving one document', afterResweep.data().count === 1, `found ${afterResweep.data().count}`)

  // `InterestDistributed` deliberately gets no collection of its own: it moves a
  // pool-level figure that is read from the chain.
  const allClaims = await firestore.collection(INTEREST_CLAIMS_COLLECTION).count().get()
  check('only claims are stored — distribution is not a collection', allClaims.data().count === 2, `found ${allClaims.data().count}`)

  // ---------------------------------------------------------------------------
  console.log(`\n${'─'.repeat(64)}`)
  console.log(`  ${passed} passed, ${failed} failed`)
  if (failures.length > 0) {
    console.log('\n  Failed:')
    for (const failure of failures) console.log(`    · ${failure}`)
  }
  console.log(`${'─'.repeat(64)}\n`)

  if (failed > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
