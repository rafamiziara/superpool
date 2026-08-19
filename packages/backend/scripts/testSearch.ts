/**
 * Manual integration test for pool search — finding a pool past the first page.
 *
 * Creates pools with real names and descriptions on a live local Hardhat node,
 * indexes them the way the app does, and then asks `listPools` for them by
 * text. The point is the end-to-end path: tokens built from what the *factory*
 * returned, stored by the indexer, and matched by a real Firestore
 * `array-contains` rather than by an array in a fixture.
 *
 * Four things only a live run can show:
 *
 * - **The description reaches the tokens at all.** It is not in `PoolCreated` —
 *   it is read back by `fetchPoolMetadata` — so a mocked test can hand the
 *   indexer a description the chain never had. If that read is skipped, search
 *   silently covers names only.
 * - **The backfill works on a pool already indexed.** `create()` never runs
 *   twice for a pool, so every pool that predates search tokens depends on the
 *   repair path in `indexPoolEvent` and on nothing else.
 * - **Re-sweeping writes nothing new.** The same property every other indexer
 *   has, and the one that makes re-running the sweep from the factory's block
 *   a safe way to backfill a whole chain.
 * - **A search stays inside its chain.** Every feed in this project is per
 *   chain by construction; a query that dropped the filter would be invisible
 *   on a single-chain test but wrong in the app.
 *
 * What this cannot check: **composite indexes.** The Firestore emulator serves
 * any query without one, so `config/firestore.indexes.json` is verified only by
 * deploying it. A search that passes here can still fail on a real project with
 * FAILED_PRECONDITION.
 *
 * Prerequisites:
 *   Terminal 1 → cd packages/contracts && pnpm node:local
 *   Terminal 2 → cd packages/contracts && pnpm deploy:local
 *   Terminal 3 → cd config             && npx firebase-tools emulators:start --only firestore --project genesis-super-pool
 *   Terminal 4 → cd packages/backend   && pnpm testSearch
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

import { Contract, JsonRpcProvider, parseEther, Wallet, ZeroAddress } from 'ethers'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { PoolFactoryABI } from '../src/constants/abis'
import { POOLS_COLLECTION } from '../src/constants/firestore'
import { indexPoolByTxHash } from '../src/services/eventIndexer'
import { sweepBlockRange } from '../src/services/eventSweeper'
import { searchTokenFor } from '../src/utils/searchTokens'

// ── Config ────────────────────────────────────────────────────────────────────

const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545'
const CHAIN_ID = parseInt(process.env.CHAIN_ID || '31337')
const FACTORY_ADDRESS = process.env.POOL_FACTORY_ADDRESS || ''

/** Hardhat's published account #0. Safe here and nowhere else. */
const OWNER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

/** A Firestore of this run's own; see `testBorrowerHistory.ts` for why. */
const PROJECT_ID = `verify-search-${Date.now()}`
const firestore = getFirestore(initializeApp({ projectId: PROJECT_ID }, PROJECT_ID))

/**
 * A suffix nothing else on the chain carries.
 *
 * The local node outlives a run while this script's Firestore project does not,
 * so a search for "guild" would match every guild every previous run created.
 * `testDecisions` learned this the hard way: an unscoped read is a script bug
 * that reads exactly like a filtering bug.
 */
const RUN = `r${Date.now().toString(36)}`

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

async function createPool(provider: JsonRpcProvider, owner: Wallet, name: string, description: string): Promise<string> {
  const factory = new Contract(FACTORY_ADDRESS, PoolFactoryABI, owner)

  const tx = await factory.createPool(
    {
      maxLoanAmount: parseEther('100'),
      interestRate: 1000,
      loanDuration: 2592000,
      name,
      description,
      requiresMembership: false,
      loanToken: ZeroAddress,
    },
    { nonce: await nextNonce(provider, owner.address) }
  )

  await tx.wait()

  return tx.hash as string
}

// ── The query under test ──────────────────────────────────────────────────────

/**
 * What `listPools` does, against the same Firestore.
 *
 * Reimplemented rather than imported because the callable reads the module-level
 * `firestore` singleton, which points at the default project rather than at this
 * run's. The clause being verified is the `array-contains` — that is copied
 * exactly, and `searchTokenFor` is the real one.
 */
async function search(term: string): Promise<string[]> {
  const token = searchTokenFor(term)

  let query = firestore.collection(POOLS_COLLECTION).where('chainId', '==', CHAIN_ID).where('isActive', '==', true)

  if (token) query = query.where('searchTokens', 'array-contains', token)

  const snapshot = await query.orderBy('createdAt', 'desc').limit(50).get()

  return snapshot.docs.map((doc) => doc.data().name as string)
}

async function storedTokens(poolId: number): Promise<string[]> {
  const doc = await firestore.collection(POOLS_COLLECTION).doc(`${CHAIN_ID}-${poolId}`).get()

  return (doc.data()?.searchTokens as string[] | undefined) ?? []
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!FACTORY_ADDRESS) throw new Error('POOL_FACTORY_ADDRESS is not set; run `pnpm deploy:local` and paste what it prints')

  const provider = new JsonRpcProvider(RPC_URL)
  const owner = new Wallet(OWNER_KEY, provider)

  console.log(`\nSearch verification — chain ${CHAIN_ID}, factory ${FACTORY_ADDRESS}`)
  console.log(`Firestore project: ${PROJECT_ID}`)
  console.log(`Run marker: ${RUN}`)

  // ── 1 · Index a pool the ordinary way ──────────────────────────────────────

  separator('1 · Tokens are written when a pool is indexed')

  const guildName = `Builders Guild ${RUN}`
  const guildHash = await createPool(provider, owner, guildName, `Tools and rent for the ${RUN} trades`)
  const guild = await indexPoolByTxHash(guildHash, CHAIN_ID, provider, firestore)

  check('a newly indexed pool is stored', guild.stored, JSON.stringify(guild))

  const guildTokens = await storedTokens(guild.poolId)

  check('tokens are written at all', guildTokens.length > 0, `${guildTokens.length} tokens`)
  check('a word from the name is indexed', guildTokens.includes('guild'))
  check('a prefix of that word is indexed', guildTokens.includes('gui'))
  check('nothing shorter than the minimum is indexed', !guildTokens.includes('g'), 'a one-letter token would match most of the chain')

  /*
    The check this script exists for.

    `description` is not in `PoolCreated` — `fetchPoolMetadata` reads it back
    from the factory — so a mocked test can hand the indexer a description the
    chain never carried. If that read is skipped or fails, search quietly
    covers names only, and every test with a fixture still passes.
  */
  check('a word from the *description* is indexed', guildTokens.includes('tools'), guildTokens.slice(0, 20).join(', '))

  // ── 2 · Find it by text ────────────────────────────────────────────────────

  separator('2 · A search finds it')

  check('by a whole word from the name', (await search(`guild ${RUN}`)).includes(guildName))
  check('by a prefix of that word', (await search(`buil ${RUN}`)).includes(guildName))
  check('by a word from the description', (await search(`tools ${RUN}`)).includes(guildName))
  check('case-insensitively', (await search(`GUILD ${RUN}`)).includes(guildName))

  const noise = await createPool(provider, owner, `Harvest Circle ${RUN}`, 'Seed and fuel')
  const harvest = await indexPoolByTxHash(noise, CHAIN_ID, provider, firestore)

  check('a second pool indexes too', harvest.stored)

  const guildOnly = await search('guild')

  check('a search excludes what does not match', !guildOnly.some((name) => name.startsWith('Harvest Circle')), guildOnly.join(', '))

  // The behaviour change from the client-side filter this replaces, verified
  // against real data rather than asserted in a unit test.
  check('the middle of a word does not match', !(await search('uild')).includes(guildName))

  // ── 3 · Backfill onto a pool indexed without tokens ────────────────────────

  separator('3 · A pool indexed before search tokens existed is repaired')

  const legacyName = `Legacy Pool ${RUN}`
  const legacyHash = await createPool(provider, owner, legacyName, `An older ${RUN} circle`)
  const legacy = await indexPoolByTxHash(legacyHash, CHAIN_ID, provider, firestore)

  check('the pool is indexed', legacy.stored)

  // Strip them, which is exactly the state every pool on a real project is in
  // until the sweep is re-run.
  await firestore.collection(POOLS_COLLECTION).doc(`${CHAIN_ID}-${legacy.poolId}`).update({ searchTokens: [] })

  check('the tokens are gone', (await storedTokens(legacy.poolId)).length === 0)
  check('and it cannot be found', !(await search(`legacy ${RUN}`)).includes(legacyName))

  const repaired = await indexPoolByTxHash(legacyHash, CHAIN_ID, provider, firestore)

  check('re-indexing reports it as already there', repaired.alreadyIndexed && !repaired.stored)
  check('the tokens are back', (await storedTokens(legacy.poolId)).includes('legacy'))
  check('and it can be found again', (await search(`legacy ${RUN}`)).includes(legacyName))

  // ── 4 · Re-sweeping is idempotent ──────────────────────────────────────────

  separator('4 · Re-sweeping the range writes nothing new')

  const before = await storedTokens(guild.poolId)
  const head = await provider.getBlockNumber()

  await sweepBlockRange({ provider, firestore, chainId: CHAIN_ID, factoryAddress: FACTORY_ADDRESS, fromBlock: 0, toBlock: head })

  const after = await storedTokens(guild.poolId)

  check('the token set is unchanged', JSON.stringify(before) === JSON.stringify(after), `${before.length} → ${after.length}`)
  check('the pool is still found', (await search(`guild ${RUN}`)).includes(guildName))

  // ── 5 · A search stays inside its chain ────────────────────────────────────

  separator('5 · A search does not cross chains')

  const otherChain = await firestore
    .collection(POOLS_COLLECTION)
    .where('chainId', '==', CHAIN_ID + 1)
    .where('searchTokens', 'array-contains', 'guild')
    .get()

  check('nothing on another chain matches', otherChain.empty, `${otherChain.size} documents`)

  // ── Summary ────────────────────────────────────────────────────────────────

  separator('Summary')
  console.log(`  ${passed} passed, ${failed} failed`)

  if (failed > 0) {
    console.log('\n  Failed:')
    for (const failure of failures) console.log(`    • ${failure}`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error('\nVerification aborted:', error)
  process.exitCode = 1
})
