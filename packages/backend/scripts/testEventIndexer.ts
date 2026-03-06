/**
 * Manual integration test for the event indexing service layer.
 *
 * Tests `indexPoolByTxHash` and `indexPoolEvent` directly against a live
 * local Hardhat node and the Firestore emulator — no UI or Firebase auth needed.
 *
 * Prerequisites:
 *   Terminal 1 → cd packages/contracts && pnpm node:local
 *   Terminal 2 → cd packages/contracts && pnpm deploy:local
 *   Terminal 3 → cd packages/backend  && pnpm serve
 *   Terminal 4 → cd packages/backend  && pnpm testIndexer
 *
 * Required .env values:
 *   POOL_FACTORY_ADDRESS=<address printed by deploy:local>
 *   CHAIN_ID=31337
 *   RPC_URL=http://127.0.0.1:8545
 */

// ── Must be set before any firebase-admin import ──────────────────────────────
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080'

import * as dotenv from 'dotenv'
dotenv.config()

import * as admin from 'firebase-admin'
import { Contract, JsonRpcProvider } from 'ethers'
import { indexPoolByTxHash, indexPoolEvent, parsePoolCreatedLog } from '../src/services/eventIndexer'
import { PoolFactoryABI } from '../src/constants/abis'

// ── Config ────────────────────────────────────────────────────────────────────

const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545'
const CHAIN_ID = parseInt(process.env.CHAIN_ID || '31337')
const FACTORY_ADDRESS = process.env.POOL_FACTORY_ADDRESS || ''

// ── Helpers ───────────────────────────────────────────────────────────────────

function separator(title: string) {
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`  ${title}`)
  console.log('─'.repeat(60))
}

function ok(msg: string) {
  console.log(`  ✅ ${msg}`)
}

function info(msg: string) {
  console.log(`  ℹ  ${msg}`)
}

function fail(msg: string) {
  console.log(`  ❌ ${msg}`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔍 SuperPool — Event Indexer Integration Test')
  console.log(`   RPC:     ${RPC_URL}`)
  console.log(`   Chain:   ${CHAIN_ID}`)
  console.log(`   Factory: ${FACTORY_ADDRESS || '(not set — run deploy:local first)'}`)
  console.log(`   Firestore emulator: ${process.env.FIRESTORE_EMULATOR_HOST}`)

  // ── Validate config ─────────────────────────────────────────────────────────
  if (!FACTORY_ADDRESS) {
    fail('POOL_FACTORY_ADDRESS is not set in .env')
    fail('Run `pnpm deploy:local` in packages/contracts and copy the factory address')
    process.exit(1)
  }

  // ── Init firebase-admin for emulator (no service account needed) ────────────
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: 'genesis-super-pool' })
  }
  const firestore = admin.firestore() as admin.firestore.Firestore

  // ── Connect to local chain ──────────────────────────────────────────────────
  const provider = new JsonRpcProvider(RPC_URL, CHAIN_ID)

  try {
    const blockNumber = await provider.getBlockNumber()
    ok(`Connected to local chain — current block: ${blockNumber}`)
  } catch {
    fail(`Cannot connect to ${RPC_URL} — is the Hardhat node running? (pnpm node:local)`)
    process.exit(1)
  }

  // ── Phase 1: discover on-chain PoolCreated events ──────────────────────────
  separator('Phase 1 — Discover PoolCreated events on-chain')

  const factory = new Contract(FACTORY_ADDRESS, [...PoolFactoryABI], provider)

  let events: Awaited<ReturnType<typeof factory.queryFilter>>
  try {
    events = await factory.queryFilter(factory.filters.PoolCreated(), 0, 'latest')
  } catch (err) {
    fail(`queryFilter failed: ${err instanceof Error ? err.message : String(err)}`)
    fail('Is the factory address correct? Does the Hardhat node have the deployed contracts?')
    process.exit(1)
  }

  if (events.length === 0) {
    fail('No PoolCreated events found — run `pnpm deploy:local` to create sample pools')
    process.exit(1)
  }

  info(`Found ${events.length} PoolCreated event(s):`)
  for (const ev of events) {
    const decoded = factory.interface.decodeEventLog('PoolCreated', ev.data, ev.topics)
    console.log(`     Pool #${decoded.poolId} — "${decoded.name}" — tx: ${ev.transactionHash}`)
  }

  // ── Phase 2: test indexPoolByTxHash (on-demand callable logic) ─────────────
  separator('Phase 2 — indexPoolByTxHash (first event)')

  const firstEvent = events[0]
  const txHash = firstEvent.transactionHash

  info(`Indexing tx: ${txHash}`)

  const result1 = await indexPoolByTxHash(txHash, CHAIN_ID, provider, firestore)

  if (result1.stored) {
    ok(`Pool #${result1.poolId} written to Firestore (stored: true, alreadyIndexed: false)`)
  } else {
    info(`Pool #${result1.poolId} was already in Firestore (alreadyIndexed: true) — try clearing the emulator`)
  }

  // ── Phase 3: idempotency check ─────────────────────────────────────────────
  separator('Phase 3 — Idempotency check (same tx, second call)')

  const result2 = await indexPoolByTxHash(txHash, CHAIN_ID, provider, firestore)

  if (result2.alreadyIndexed && !result2.stored) {
    ok(`Correctly returned alreadyIndexed: true — no duplicate write`)
  } else {
    fail(`Expected alreadyIndexed: true, got stored: ${result2.stored}`)
  }

  // ── Phase 4: index all remaining events (simulates scheduled sync logic) ───
  separator('Phase 4 — Index remaining events (sync simulation)')

  let newCount = 0
  let skippedCount = 0

  for (const event of events.slice(1)) {
    const block = await provider.getBlock(event.blockNumber)
    if (!block) {
      fail(`Could not fetch block ${event.blockNumber}`)
      continue
    }

    const parsed = parsePoolCreatedLog(event, CHAIN_ID, block.timestamp)
    const result = await indexPoolEvent(parsed, firestore)

    if (result.stored) {
      ok(`Pool #${result.poolId} indexed`)
      newCount++
    } else {
      info(`Pool #${result.poolId} already indexed, skipped`)
      skippedCount++
    }
  }

  info(`New: ${newCount} | Skipped: ${skippedCount}`)

  // ── Phase 5: read back from Firestore and display ──────────────────────────
  separator('Phase 5 — Read back from Firestore')

  const snapshot = await firestore.collection('pools').get()

  if (snapshot.empty) {
    fail('pools collection is empty — something went wrong')
  } else {
    ok(`pools collection has ${snapshot.size} document(s):`)
    snapshot.docs.forEach((doc) => {
      const d = doc.data()
      console.log(`\n     doc: ${doc.id}`)
      console.log(`       poolId:       ${d.poolId}`)
      console.log(`       name:         ${d.name}`)
      console.log(`       poolAddress:  ${d.poolAddress}`)
      console.log(`       poolOwner:    ${d.poolOwner}`)
      console.log(`       chainId:      ${d.chainId}`)
      console.log(`       maxLoanAmount:${d.maxLoanAmount}`)
      console.log(`       isActive:     ${d.isActive}`)
      console.log(`       createdAt:    ${d.createdAt?.toDate?.() ?? d.createdAt}`)
      console.log(`       txHash:       ${d.transactionHash}`)
    })
  }

  separator('Done')
  ok('All phases completed. Check http://localhost:4000/firestore for the full Firestore state.')
}

main().catch((err) => {
  console.error('\n❌ Unhandled error:', err)
  process.exit(1)
})
