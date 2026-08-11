import { Interface, Log, Provider } from 'ethers'
import { Firestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { PoolFactoryABI, SampleLendingPoolABI } from '../constants'
import { indexContributionEvent, parseFundsDepositedLog, resolvePoolId } from './contributionIndexer'
import { fetchPoolDescription, indexPoolEvent, parsePoolCreatedLog } from './eventIndexer'
import { indexWithdrawalEvent, parseFundsWithdrawnLog } from './withdrawalIndexer'

const poolFactoryInterface = new Interface([...PoolFactoryABI])
const lendingPoolInterface = new Interface([...SampleLendingPoolABI])

const POOL_CREATED_TOPIC = poolFactoryInterface.getEvent('PoolCreated')!.topicHash
const FUNDS_DEPOSITED_TOPIC = lendingPoolInterface.getEvent('FundsDeposited')!.topicHash
const FUNDS_WITHDRAWN_TOPIC = lendingPoolInterface.getEvent('FundsWithdrawn')!.topicHash

/** `getPoolId` returns 0 for an unknown address — pool ids start at 1. */
const UNKNOWN_POOL_ID = 0

/** How many new documents a sweep wrote, per feed. Already-indexed logs are not counted. */
export interface SweepCounts {
  pools: number
  contributions: number
  withdrawals: number
}

export interface SweepBlockRangeOptions {
  provider: Provider
  firestore: Firestore
  chainId: number
  factoryAddress: string
  fromBlock: number
  /** Inclusive. */
  toBlock: number
}

/**
 * Per-run caches.
 *
 * Both are pure functions of the chain's history, so they are safe to hold for
 * the length of one sweep: a block's timestamp never changes, and the factory's
 * address→id mapping is append-only. A range of 500 blocks can easily carry
 * several events per block and several deposits into the same pool, and without
 * these each one costs its own RPC round trip.
 */
interface SweepCaches {
  blockTimestamps: Map<number, number>
  poolIds: Map<string, number>
}

async function getBlockTimestamp(blockNumber: number, provider: Provider, caches: SweepCaches): Promise<number> {
  const cached = caches.blockTimestamps.get(blockNumber)
  if (cached !== undefined) return cached

  const block = await provider.getBlock(blockNumber)

  if (!block) {
    throw new Error(`Failed to fetch block ${blockNumber}`)
  }

  caches.blockTimestamps.set(blockNumber, block.timestamp)
  return block.timestamp
}

async function getPoolId(poolAddress: string, factoryAddress: string, provider: Provider, caches: SweepCaches): Promise<number> {
  const key = poolAddress.toLowerCase()
  const cached = caches.poolIds.get(key)
  if (cached !== undefined) return cached

  const poolId = await resolvePoolId(poolAddress, factoryAddress, provider)

  caches.poolIds.set(key, poolId)
  return poolId
}

/**
 * Fetch every log of one event type in a block range.
 *
 * `PoolCreated` is filtered to the factory, but `FundsDeposited` and
 * `FundsWithdrawn` are emitted by each *pool* contract, so there is no single
 * address to filter on — and the set of pools is exactly what the sweep is
 * still discovering. Querying by topic alone catches deposits into pools this
 * run has not seen yet; `resolvePoolId` is what then proves the emitter is one
 * of ours, which it has to do regardless since anyone can emit a log of the
 * same shape from their own contract.
 */
async function queryLogs(provider: Provider, topic: string, fromBlock: number, toBlock: number, address?: string): Promise<Log[]> {
  return provider.getLogs({ fromBlock, toBlock, topics: [topic], ...(address ? { address } : {}) })
}

async function sweepPoolCreated(options: SweepBlockRangeOptions, caches: SweepCaches): Promise<number> {
  const { provider, firestore, chainId, factoryAddress, fromBlock, toBlock } = options

  const logs = await queryLogs(provider, POOL_CREATED_TOPIC, fromBlock, toBlock, factoryAddress)

  let stored = 0

  for (const log of logs) {
    try {
      const timestamp = await getBlockTimestamp(log.blockNumber, provider, caches)
      const parsedPool = parsePoolCreatedLog(log, chainId, timestamp)
      parsedPool.description = await fetchPoolDescription(parsedPool.poolId, log.address, provider)

      const result = await indexPoolEvent(parsedPool, firestore)

      if (result.stored) stored++
    } catch (error) {
      // One malformed or unreadable log must not abandon the rest of the range.
      logger.error('Failed to sweep PoolCreated log', {
        chainId,
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return stored
}

async function sweepFundsDeposited(options: SweepBlockRangeOptions, caches: SweepCaches): Promise<number> {
  const { provider, firestore, chainId, factoryAddress, fromBlock, toBlock } = options

  const logs = await queryLogs(provider, FUNDS_DEPOSITED_TOPIC, fromBlock, toBlock)

  let stored = 0

  for (const log of logs) {
    try {
      const timestamp = await getBlockTimestamp(log.blockNumber, provider, caches)
      const parsed = parseFundsDepositedLog(log, chainId, timestamp)
      const poolId = await getPoolId(parsed.poolAddress, factoryAddress, provider, caches)

      // Not a pool this factory deployed. Unlike the on-demand callable, which
      // raises this to the user who asked for it, a sweep sees other contracts'
      // logs as a matter of course — so it is a skip, not an error.
      if (poolId === UNKNOWN_POOL_ID) continue

      const result = await indexContributionEvent({ ...parsed, poolId }, firestore)

      if (result.stored) stored++
    } catch (error) {
      logger.error('Failed to sweep FundsDeposited log', {
        chainId,
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return stored
}

async function sweepFundsWithdrawn(options: SweepBlockRangeOptions, caches: SweepCaches): Promise<number> {
  const { provider, firestore, chainId, factoryAddress, fromBlock, toBlock } = options

  const logs = await queryLogs(provider, FUNDS_WITHDRAWN_TOPIC, fromBlock, toBlock)

  let stored = 0

  for (const log of logs) {
    try {
      const timestamp = await getBlockTimestamp(log.blockNumber, provider, caches)
      const parsed = parseFundsWithdrawnLog(log, chainId, timestamp)
      const poolId = await getPoolId(parsed.poolAddress, factoryAddress, provider, caches)

      if (poolId === UNKNOWN_POOL_ID) continue

      const result = await indexWithdrawalEvent({ ...parsed, poolId }, firestore)

      if (result.stored) stored++
    } catch (error) {
      logger.error('Failed to sweep FundsWithdrawn log', {
        chainId,
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return stored
}

/**
 * Index every SuperPool event in one block range.
 *
 * The three feeds are swept in dependency order — pools, then deposits, then
 * withdrawals — so that a pool created and funded within the same range is
 * already in Firestore by the time its deposits land. Nothing enforces that
 * order downstream, but a reader that polls mid-sweep should never see a
 * contribution pointing at a pool it cannot find.
 *
 * A failed `getLogs` throws, so the caller can leave the sync cursor where it
 * was and retry the range. Failures on a single log do not: they are logged and
 * skipped, because one undecodable event must not wedge the sweep forever.
 */
export async function sweepBlockRange(options: SweepBlockRangeOptions): Promise<SweepCounts> {
  const caches: SweepCaches = { blockTimestamps: new Map(), poolIds: new Map() }

  const pools = await sweepPoolCreated(options, caches)
  const contributions = await sweepFundsDeposited(options, caches)
  const withdrawals = await sweepFundsWithdrawn(options, caches)

  return { pools, contributions, withdrawals }
}
