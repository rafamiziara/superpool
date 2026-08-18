/**
 * Manual integration test for notes — the reasons behind decisions.
 *
 * Drives real loans and memberships through a live local Hardhat node, then
 * checks that the sentences people wrote about them are attached to the right
 * records, visible to the right wallets, and quoted in the right pushes.
 *
 * Everything here is off chain, so it would be fair to ask what a node is
 * doing in it. The answer is the whole design: a loan purpose is written
 * **before its loan exists**, and it is only the chain that decides what that
 * loan turns out to be. The trap this script exists to catch — a purpose keyed
 * to the requesting transaction detaching the moment the owner approves — is
 * invisible to a mocked test, because `approveLoan` rewriting `startTime` is
 * exactly the behaviour a mock does not have.
 *
 * Prerequisites:
 *   Terminal 1 → cd packages/contracts && pnpm node:local
 *   Terminal 2 → cd packages/contracts && pnpm deploy:local
 *   Terminal 3 → cd config             && npx firebase-tools emulators:start --only firestore --project genesis-super-pool
 *   Terminal 4 → cd packages/backend   && pnpm testNotes
 *
 * Required .env values:
 *   POOL_FACTORY_ADDRESS=<address printed by deploy:local>
 *   CHAIN_ID=31337
 *   RPC_URL=http://127.0.0.1:8545
 *
 * Nothing reaches Expo: `fetch` is replaced for the run, so the push bodies are
 * asserted on the payload the notification service builds rather than on
 * delivery. The emulator cannot deliver push and this feature does not change
 * that.
 */

// ── Must be set before any firebase-admin import ──────────────────────────────
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080'

import * as dotenv from 'dotenv'
dotenv.config()

import { BaseContract, Contract, JsonRpcProvider, parseEther, Wallet, ZeroAddress } from 'ethers'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { LendingPoolABI, PoolFactoryABI } from '../src/constants/abis'
import {
  NOTES_COLLECTION,
  NOTIFICATIONS_SENT_COLLECTION,
  PUSH_TOKENS_COLLECTION,
  STAGED_NOTES_COLLECTION,
} from '../src/constants/firestore'
import { sweepBlockRange } from '../src/services/eventSweeper'
import { indexLoansByTxHash, loanDocId } from '../src/services/loanIndexer'
import { indexMembershipsByTxHash, membershipDocId } from '../src/services/membershipIndexer'
import { entitlementFor, listNotes, noteDocId, noteFor, saveNote, stagedRecordId, stageNote } from '../src/services/notes'
import { indexPoolByTxHash } from '../src/services/eventIndexer'

// ── Config ────────────────────────────────────────────────────────────────────

const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545'
const CHAIN_ID = parseInt(process.env.CHAIN_ID || '31337')
const FACTORY_ADDRESS = process.env.POOL_FACTORY_ADDRESS || ''

const TERM_SECONDS = 30 * 24 * 60 * 60

/**
 * Hardhat's published accounts. Safe here by construction and nowhere else —
 * these keys are in every Hardhat README on the internet.
 */
const KEYS = {
  owner: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  lender: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  borrower: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  declined: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  stranger: '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
}

/** A Firestore of this run's own; see `testBorrowerHistory.ts` for why. */
const PROJECT_ID = `verify-notes-${Date.now()}`
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

// ── Expo, intercepted ─────────────────────────────────────────────────────────

interface CapturedPush {
  title: string
  body: string
  data: { kind: string }
}

const pushes: CapturedPush[] = []

/**
 * Stand in for Expo's push service.
 *
 * The point is the **body**, which is the whole reason a reason is written
 * before the transaction rather than after it. Delivery is not in scope and
 * cannot be — the emulator does not deliver push, and no dev build is involved
 * here — so this asserts on the payload the notification service builds.
 */
function interceptExpo() {
  globalThis.fetch = (async (_url: string, init?: { body?: string }) => {
    const messages = JSON.parse(init?.body ?? '[]') as CapturedPush[]

    pushes.push(...messages)

    return {
      ok: true,
      json: async () => ({ data: messages.map(() => ({ status: 'ok' })) }),
    }
  }) as unknown as typeof fetch
}

/** The most recent push of a kind, or nothing. */
function pushOf(kind: string): CapturedPush | undefined {
  return [...pushes].reverse().find((push) => push.data?.kind === kind)
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
      loanDuration: TERM_SECONDS,
      name: `${name}-${Date.now()}`,
      description: 'notes verification',
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

  // Indexed straight away: `poolSummary` reads the owner from this document,
  // and an entitlement cannot be decided without it.
  await indexPoolByTxHash(receipt.hash as string, CHAIN_ID, provider, firestore)

  return {
    poolId: Number(created.args.poolId),
    address: created.args.poolAddress as string,
    contract: new Contract(created.args.poolAddress as string, LendingPoolABI, owner),
  }
}

async function askToJoin(provider: JsonRpcProvider, pool: PoolHandle, member: Wallet): Promise<string> {
  const tx = await as(pool.contract.connect(member)).requestMembership({ nonce: await nextNonce(provider, member.address) })
  const receipt = await tx.wait()

  return receipt.hash as string
}

async function admit(provider: JsonRpcProvider, pool: PoolHandle, owner: Wallet, member: Wallet) {
  await askToJoin(provider, pool, member)

  const approve = await pool.contract.approveMember(member.address, { nonce: await nextNonce(provider, owner.address) })
  await approve.wait()
}

async function registerToken(wallet: Wallet, token: string) {
  await firestore
    .collection(PUSH_TOKENS_COLLECTION)
    .doc(token)
    .set({ token, walletAddress: wallet.address.toLowerCase(), deviceId: 'verify', platform: 'ios', updatedAt: Date.now() })
}

async function countNotes(): Promise<number> {
  return (await firestore.collection(NOTES_COLLECTION).count().get()).data().count
}

async function countMarkers(): Promise<number> {
  return (await firestore.collection(NOTIFICATIONS_SENT_COLLECTION).count().get()).data().count
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!FACTORY_ADDRESS) {
    console.error('POOL_FACTORY_ADDRESS is not set in packages/backend/.env')
    process.exitCode = 1
    return
  }

  interceptExpo()

  // `cacheTimeout: -1` disables ethers' 250ms read cache — see `testDefaults.ts`.
  const provider = new JsonRpcProvider(RPC_URL, undefined, { cacheTimeout: -1 })

  const owner = new Wallet(KEYS.owner, provider)
  const lender = new Wallet(KEYS.lender, provider)
  const borrower = new Wallet(KEYS.borrower, provider)
  const declined = new Wallet(KEYS.declined, provider)
  const stranger = new Wallet(KEYS.stranger, provider)

  console.log(`\nFactory:    ${FACTORY_ADDRESS}`)
  console.log(`Chain:      ${CHAIN_ID}`)
  console.log(`Firestore:  ${process.env.FIRESTORE_EMULATOR_HOST} (project ${PROJECT_ID})`)

  // ---------------------------------------------------------------------------
  separator('A pool that reviews requests, funded and joined')
  // ---------------------------------------------------------------------------
  const pool = await createPool(provider, owner, 'notes')

  await admit(provider, pool, owner, lender)
  await admit(provider, pool, owner, borrower)

  const deposit = await as(pool.contract.connect(lender)).depositFunds({
    value: parseEther('50'),
    nonce: await nextNonce(provider, lender.address),
  })
  await deposit.wait()

  const requiresApproval = await pool.contract.setRequiresApproval(true, { nonce: await nextNonce(provider, owner.address) })
  await requiresApproval.wait()

  await registerToken(owner, 'ExponentPushToken[owner]')
  await registerToken(borrower, 'ExponentPushToken[borrower]')

  console.log(`  pool #${pool.poolId} at ${pool.address}`)

  // ---------------------------------------------------------------------------
  separator('A purpose written before the loan exists')
  // ---------------------------------------------------------------------------
  const requestTx = await as(pool.contract.connect(borrower)).requestLoan(parseEther('5'), {
    nonce: await nextNonce(provider, borrower.address),
  })
  const requestReceipt = await requestTx.wait()
  const loanId = Number((await pool.contract.nextLoanId()) - 1n)
  const loanRecordId = loanDocId(CHAIN_ID, pool.poolId, loanId)

  // What the app does the instant the transaction is sent: there is no loan id
  // yet, so the only thing to key on is the transaction.
  await stageNote(
    {
      recordId: stagedRecordId(CHAIN_ID, requestReceipt.hash as string),
      kind: 'loan_purpose',
      text: 'School fees, due at the end of the month.',
      author: borrower.address,
      subject: borrower.address,
      chainId: CHAIN_ID,
      poolId: 0,
    },
    firestore
  )

  await indexLoansByTxHash(requestReceipt.hash as string, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)

  const attached = await noteFor(loanRecordId, 'loan_purpose', firestore)
  check(
    'the indexer moved the purpose onto the loan',
    attached?.text === 'School fees, due at the end of the month.',
    JSON.stringify(attached)
  )
  check('and gave it the loan’s own pool', attached?.poolId === pool.poolId, `poolId ${attached?.poolId}`)

  const stagedLeft = await firestore.collection(STAGED_NOTES_COLLECTION).count().get()
  check('nothing is left staged', stagedLeft.data().count === 0, `${stagedLeft.data().count} staged`)

  // The reason the owner-facing push waits for the note: this is where a
  // purpose is worth most, and resolving it in the app would send this first.
  check(
    'the owner’s queue notification carries it',
    pushOf('loan_requested')?.body.includes('School fees') === true,
    pushOf('loan_requested')?.body
  )

  // ---------------------------------------------------------------------------
  separator('A reason the owner thought better of')
  // ---------------------------------------------------------------------------
  await saveNote(
    {
      recordId: loanRecordId,
      kind: 'loan_rejected',
      text: 'Not this month.',
      author: owner.address,
      subject: borrower.address,
      chainId: CHAIN_ID,
      poolId: pool.poolId,
    },
    firestore
  )

  const approveTx = await pool.contract.approveLoan(loanId, { nonce: await nextNonce(provider, owner.address) })
  const approveReceipt = await approveTx.wait()

  await indexLoansByTxHash(approveReceipt.hash as string, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)

  check('the approval carries no reason', (await noteFor(loanRecordId, 'loan_approved', firestore)) === null)
  check(
    'the rejection reason is still stored, and simply never asked for',
    (await noteFor(loanRecordId, 'loan_rejected', firestore)) !== null
  )
  check(
    'the borrower’s approval push says nothing about it',
    pushOf('loan_approved')?.body.includes('Not this month.') === false,
    pushOf('loan_approved')?.body
  )

  // The check the naive transaction-hash join fails, and fails only *here*:
  // `approveLoan` rewrites `startTime`, so the loan document now points at the
  // approval rather than at the request that staged the purpose.
  const afterApproval = await noteFor(loanRecordId, 'loan_purpose', firestore)
  check(
    'the purpose survived the approval',
    afterApproval?.text === 'School fees, due at the end of the month.',
    JSON.stringify(afterApproval)
  )

  // ---------------------------------------------------------------------------
  separator('A reason that reaches the person it is about')
  // ---------------------------------------------------------------------------
  const declinedJoinTx = await askToJoin(provider, pool, declined)
  await indexMembershipsByTxHash(declinedJoinTx, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)

  const memberRecordId = membershipDocId(CHAIN_ID, pool.poolId, declined.address)

  await registerToken(declined, 'ExponentPushToken[declined]')
  await saveNote(
    {
      recordId: memberRecordId,
      kind: 'membership_rejected',
      text: 'We are full this season — do ask again in the spring.',
      author: owner.address,
      subject: declined.address,
      chainId: CHAIN_ID,
      poolId: pool.poolId,
    },
    firestore
  )

  const rejectTx = await pool.contract.rejectMember(declined.address, { nonce: await nextNonce(provider, owner.address) })
  const rejectReceipt = await rejectTx.wait()

  await indexMembershipsByTxHash(rejectReceipt.hash as string, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)

  check(
    'the rejection push says why',
    pushOf('membership_rejected')?.body.includes('do ask again in the spring') === true,
    pushOf('membership_rejected')?.body
  )

  // ---------------------------------------------------------------------------
  separator('Who may say what, and who may read it')
  // ---------------------------------------------------------------------------
  const purposeEntitlement = await entitlementFor(loanRecordId, 'loan_purpose', firestore)
  const decisionEntitlement = await entitlementFor(loanRecordId, 'loan_rejected', firestore)
  const membershipEntitlement = await entitlementFor(memberRecordId, 'membership_removed', firestore)

  check('a purpose belongs to the borrower', purposeEntitlement?.author === borrower.address.toLowerCase(), purposeEntitlement?.author)
  check('a decision belongs to the owner', decisionEntitlement?.author === owner.address.toLowerCase(), decisionEntitlement?.author)
  check('a borrower cannot decide their own loan', decisionEntitlement?.author !== borrower.address.toLowerCase())
  check('a membership decision reads the register, not the loans', membershipEntitlement?.subject === declined.address.toLowerCase())
  check(
    'a record nobody indexed entitles nobody',
    (await entitlementFor(`${CHAIN_ID}-${pool.poolId}-999`, 'loan_rejected', firestore)) === null
  )

  const ownerSees = await listNotes({ caller: owner.address, chainId: CHAIN_ID, poolId: pool.poolId, limit: 50 }, firestore)
  const borrowerSees = await listNotes({ caller: borrower.address, chainId: CHAIN_ID, poolId: pool.poolId, limit: 50 }, firestore)
  const strangerSees = await listNotes({ caller: stranger.address, chainId: CHAIN_ID, poolId: pool.poolId, limit: 50 }, firestore)

  check('the owner sees every note on their pool', ownerSees.notes.length === 3, `${ownerSees.notes.length}`)
  check(
    'the borrower sees only their own',
    borrowerSees.notes.every((note) => note.subject === borrower.address.toLowerCase())
  )
  check('and sees both of them', borrowerSees.notes.length === 2, `${borrowerSees.notes.length}`)
  check('a stranger sees nothing at all', strangerSees.notes.length === 0 && strangerSees.totalCount === 0)

  // ---------------------------------------------------------------------------
  separator('Write-once')
  // ---------------------------------------------------------------------------
  const second = await saveNote(
    {
      recordId: loanRecordId,
      kind: 'loan_rejected',
      text: 'Actually, never mind.',
      author: owner.address,
      subject: borrower.address,
      chainId: CHAIN_ID,
      poolId: pool.poolId,
    },
    firestore
  )

  check('a second note under the same key is refused', second === null)
  check('and the first survives', (await noteFor(loanRecordId, 'loan_rejected', firestore))?.text === 'Not this month.')

  const purposeDoc = await firestore.collection(NOTES_COLLECTION).doc(noteDocId(loanRecordId, 'loan_purpose')).get()
  check('a note is keyed on (record, outcome)', purposeDoc.exists)

  // ---------------------------------------------------------------------------
  separator('Re-scanning the same range changes nothing')
  // ---------------------------------------------------------------------------
  const head = await provider.getBlockNumber()

  /*
    Measured *between* the two passes, not before both.

    The first pass walks the whole chain from genesis, which on a long-lived
    local node holds pools and loans left by earlier runs of the other
    verification scripts — none of them in this run's own Firestore. Indexing
    those is correct work, and counting it as a duplicate would fail a script
    whose subject is the second pass.
  */
  await sweepBlockRange({ chainId: CHAIN_ID, factoryAddress: FACTORY_ADDRESS, fromBlock: 0, toBlock: head, provider, firestore })

  const notesAfterFirst = await countNotes()
  const markersAfterFirst = await countMarkers()
  const pushesAfterFirst = pushes.length

  await sweepBlockRange({ chainId: CHAIN_ID, factoryAddress: FACTORY_ADDRESS, fromBlock: 0, toBlock: head, provider, firestore })

  check('no note was added', (await countNotes()) === notesAfterFirst, `${notesAfterFirst} → ${await countNotes()}`)
  check('no note was lost', (await noteFor(loanRecordId, 'loan_purpose', firestore)) !== null)
  check(
    'the purpose still says what the borrower wrote',
    (await noteFor(loanRecordId, 'loan_purpose', firestore))?.text.startsWith('School fees') === true
  )
  check('no notification was claimed twice', (await countMarkers()) === markersAfterFirst, `${markersAfterFirst} → ${await countMarkers()}`)
  check('and nothing was sent again', pushes.length === pushesAfterFirst, `${pushesAfterFirst} → ${pushes.length}`)

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
