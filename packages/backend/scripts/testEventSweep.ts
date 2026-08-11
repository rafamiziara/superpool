/**
 * Manual integration test for the scheduled event sweep.
 *
 * Runs `syncPoolEventsHandler` directly against a live local Hardhat node and
 * the Firestore emulator, then checks what it indexed against what the chain
 * actually holds. This is the only way to exercise the sweep locally without
 * deploying: `syncPoolEvents` is an `onSchedule` function and scheduled
 * functions never fire in the emulator.
 *
 * Prerequisites:
 *   Terminal 1 → cd packages/contracts && pnpm node:local
 *   Terminal 2 → cd packages/contracts && pnpm deploy:local
 *   Terminal 3 → cd packages/backend  && pnpm serve
 *   Terminal 4 → cd packages/backend  && pnpm testSweep
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

import { Contract, Interface, JsonRpcProvider } from 'ethers'
import { PoolFactoryABI, SampleLendingPoolABI } from '../src/constants/abis'
import { CONTRIBUTIONS_COLLECTION, POOLS_COLLECTION, WITHDRAWALS_COLLECTION } from '../src/constants/firestore'
import { syncPoolEventsHandler } from '../src/functions/events/syncPoolEvents'
import { firestore } from '../src/services'

// ── Config ────────────────────────────────────────────────────────────────────

const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545'
const CHAIN_ID = parseInt(process.env.CHAIN_ID || '31337')
const FACTORY_ADDRESS = process.env.POOL_FACTORY_ADDRESS || ''

// ── Helpers ───────────────────────────────────────────────────────────────────

function separator(title: string) {
  console.log(`\n${'─'.repeat(64)}`)
  console.log(`  ${title}`)
  console.log('─'.repeat(64))
}

function ok(msg: string) {
  console.log(`  ✅ ${msg}`)
}

function fail(msg: string) {
  console.log(`  ❌ ${msg}`)
}

function info(msg: string) {
  console.log(`  ℹ  ${msg}`)
}

const poolFactoryInterface = new Interface([...PoolFactoryABI])
const lendingPoolInterface = new Interface([...SampleLendingPoolABI])

/**
 * How many logs belong to a pool this factory deployed.
 *
 * `FundsDeposited` and `FundsWithdrawn` are not unique to SuperPool — any
 * contract can emit an identically-shaped event, and a local node usually has
 * some. Those are not ours to index, so counting raw logs would set an
 * expectation the sweep is right to miss. `getPoolId` returns 0 for an address
 * the factory does not know, which is the same test the sweep applies.
 */
async function countOwnedLogs(provider: JsonRpcProvider, topic: string): Promise<{ owned: number; foreign: string[] }> {
  const factory = new Contract(FACTORY_ADDRESS, [...PoolFactoryABI], provider)
  const logs = await provider.getLogs({ fromBlock: 0, toBlock: 'latest', topics: [topic] })

  let owned = 0
  const foreign: string[] = []

  for (const log of logs) {
    const poolId = (await factory.getPoolId(log.address)) as bigint

    if (poolId === 0n) {
      foreign.push(`${log.address} @ block ${log.blockNumber}`)
    } else {
      owned++
    }
  }

  return { owned, foreign }
}

/** What the chain holds, counted straight from logs rather than from our indexers. */
async function countOnChain(provider: JsonRpcProvider) {
  const currentBlock = await provider.getBlockNumber()

  const pools = await provider.getLogs({
    fromBlock: 0,
    toBlock: currentBlock,
    address: FACTORY_ADDRESS,
    topics: [poolFactoryInterface.getEvent('PoolCreated')!.topicHash],
  })

  const deposits = await countOwnedLogs(provider, lendingPoolInterface.getEvent('FundsDeposited')!.topicHash)
  const withdrawals = await countOwnedLogs(provider, lendingPoolInterface.getEvent('FundsWithdrawn')!.topicHash)

  return { currentBlock, pools: pools.length, deposits, withdrawals }
}

async function countInFirestore() {
  const [pools, contributions, withdrawals] = await Promise.all([
    firestore.collection(POOLS_COLLECTION).where('chainId', '==', CHAIN_ID).count().get(),
    firestore.collection(CONTRIBUTIONS_COLLECTION).where('chainId', '==', CHAIN_ID).count().get(),
    firestore.collection(WITHDRAWALS_COLLECTION).where('chainId', '==', CHAIN_ID).count().get(),
  ])

  return {
    pools: pools.data().count,
    contributions: contributions.data().count,
    withdrawals: withdrawals.data().count,
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🧹 SuperPool — Event Sweep Integration Test')
  console.log(`   RPC:     ${RPC_URL}`)
  console.log(`   Chain:   ${CHAIN_ID}`)
  console.log(`   Factory: ${FACTORY_ADDRESS || '(not set)'}`)

  if (!FACTORY_ADDRESS) {
    fail('POOL_FACTORY_ADDRESS is not set in packages/backend/.env')
    process.exit(1)
  }

  const provider = new JsonRpcProvider(RPC_URL, CHAIN_ID)

  separator('Before — chain vs Firestore')

  const onChain = await countOnChain(provider)
  const before = await countInFirestore()

  info(`Chain head:   block ${onChain.currentBlock}`)
  info(`Pools:        ${onChain.pools} on chain, ${before.pools} indexed`)
  info(`Deposits:     ${onChain.deposits.owned} on chain, ${before.contributions} indexed`)
  info(`Withdrawals:  ${onChain.withdrawals.owned} on chain, ${before.withdrawals} indexed`)

  for (const address of [...onChain.deposits.foreign, ...onChain.withdrawals.foreign]) {
    info(`Ignored (not a SuperPool pool): ${address}`)
  }

  separator('Sweep — from genesis')

  // `fromBlock: 0` rather than resuming: this script exists to backfill a chain
  // whose history predates any sync state, and re-scanning is free of side
  // effects because every indexer keys on the log.
  const result = await syncPoolEventsHandler({ fromBlock: 0 })

  info(`Blocks ${result.fromBlock}–${result.toBlock} of ${result.currentBlock} (caught up: ${result.caughtUp})`)
  info(`Newly indexed → pools ${result.pools}, contributions ${result.contributions}, withdrawals ${result.withdrawals}`)

  separator('After — did the sweep close the gap?')

  const after = await countInFirestore()

  let failures = 0

  const checks: [string, number, number][] = [
    ['Pools', after.pools, onChain.pools],
    ['Contributions', after.contributions, onChain.deposits.owned],
    ['Withdrawals', after.withdrawals, onChain.withdrawals.owned],
  ]

  for (const [label, indexed, expected] of checks) {
    if (indexed === expected) {
      ok(`${label}: ${indexed}/${expected} indexed`)
    } else {
      fail(`${label}: ${indexed}/${expected} indexed`)
      failures++
    }
  }

  if (!result.caughtUp) {
    fail('Sweep did not reach the chain head')
    failures++
  }

  separator('Idempotency — a second sweep must write nothing')

  const second = await syncPoolEventsHandler({ fromBlock: 0 })
  const afterSecond = await countInFirestore()

  if (second.pools === 0 && second.contributions === 0 && second.withdrawals === 0) {
    ok('Second sweep wrote 0 new documents')
  } else {
    fail(`Second sweep wrote pools ${second.pools}, contributions ${second.contributions}, withdrawals ${second.withdrawals}`)
    failures++
  }

  if (
    afterSecond.pools === after.pools &&
    afterSecond.contributions === after.contributions &&
    afterSecond.withdrawals === after.withdrawals
  ) {
    ok('Document counts unchanged after the second sweep')
  } else {
    fail('Document counts changed after the second sweep')
    failures++
  }

  separator(failures === 0 ? '✅ All checks passed' : `❌ ${failures} check(s) failed`)

  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('\n💥 Unhandled error:', error)
  process.exit(1)
})
