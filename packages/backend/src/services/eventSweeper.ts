import { Interface, Log, Provider } from 'ethers'
import { Firestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { LendingPoolABI, PoolFactoryABI } from '../constants'
import { indexContributionEvent, parseFundsDepositedLog, resolvePoolId } from './contributionIndexer'
import { fetchPoolActive, fetchPoolMetadata, indexPoolEvent, parsePoolCreatedLog, updatePoolActive } from './eventIndexer'
import { indexInterestClaimEvent, parseInterestClaimedLog } from './interestClaimIndexer'
import { indexLoanFromLog, LOAN_TOPICS } from './loanIndexer'
import { indexLoanRepaymentEvent, LOAN_REPAYMENT_MADE_TOPIC, parseLoanRepaymentLog } from './loanRepaymentIndexer'
import { indexMembershipFromLog, MEMBERSHIP_TOPICS } from './membershipIndexer'
import { indexWithdrawalEvent, parseFundsWithdrawnLog } from './withdrawalIndexer'

const poolFactoryInterface = new Interface([...PoolFactoryABI])
const lendingPoolInterface = new Interface([...LendingPoolABI])

const POOL_CREATED_TOPIC = poolFactoryInterface.getEvent('PoolCreated')!.topicHash
const POOL_DEACTIVATED_TOPIC = poolFactoryInterface.getEvent('PoolDeactivated')!.topicHash
const POOL_REACTIVATED_TOPIC = poolFactoryInterface.getEvent('PoolReactivated')!.topicHash
const FUNDS_DEPOSITED_TOPIC = lendingPoolInterface.getEvent('FundsDeposited')!.topicHash
const FUNDS_WITHDRAWN_TOPIC = lendingPoolInterface.getEvent('FundsWithdrawn')!.topicHash
const INTEREST_CLAIMED_TOPIC = lendingPoolInterface.getEvent('InterestClaimed')!.topicHash

/** `getPoolId` returns 0 for an unknown address — pool ids start at 1. */
const UNKNOWN_POOL_ID = 0

/** How many new documents a sweep wrote, per feed. Already-indexed logs are not counted. */
export interface SweepCounts {
  pools: number
  contributions: number
  withdrawals: number
  /** Loans written — created or settled. A loan already current is not counted. */
  loans: number
  /** Memberships written. One already matching the chain is not counted. */
  memberships: number
  /** Payments towards loans written. A log already indexed is not counted. */
  loanRepayments: number
  /** Interest claims written. A log already indexed is not counted. */
  interestClaims: number
  /** Pools whose stored `isActive` disagreed with the chain and was corrected. */
  statusUpdates: number
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
async function queryLogs(
  provider: Provider,
  topic: string | string[],
  fromBlock: number,
  toBlock: number,
  address?: string
): Promise<Log[]> {
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
      Object.assign(parsedPool, await fetchPoolMetadata(parsedPool.poolId, log.address, provider))

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

/**
 * Reconcile the active flag of every pool whose status changed in the range.
 *
 * Both events are fetched in one query — `topics: [[a, b]]` is a topic-OR — but
 * that is for economy, not ordering: the flag is read from the factory rather
 * than inferred from which event arrived, so a pool toggled twice in one range
 * only needs looking up once, and the answer is the same whichever order the
 * logs came in. Hence the dedupe by pool id.
 */
async function sweepPoolStatus(options: SweepBlockRangeOptions): Promise<number> {
  const { provider, firestore, chainId, factoryAddress, fromBlock, toBlock } = options

  const logs = await queryLogs(provider, [POOL_DEACTIVATED_TOPIC, POOL_REACTIVATED_TOPIC], fromBlock, toBlock, factoryAddress)

  // `poolId` is the first indexed parameter of both events, so it is topic 1.
  const poolIds = new Set(logs.map((log) => Number(BigInt(log.topics[1]))))

  let updated = 0

  for (const poolId of poolIds) {
    try {
      const isActive = await fetchPoolActive(poolId, factoryAddress, provider)

      if (await updatePoolActive(poolId, chainId, isActive, firestore)) updated++
    } catch (error) {
      logger.error('Failed to sweep pool status change', {
        chainId,
        poolId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return updated
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
 * Index every interest claim in the range.
 *
 * `InterestDistributed` is deliberately not swept: it moves a pool-level figure
 * that is read straight from the chain, so a document for it would only be a
 * copy that can go stale. A claim, by contrast, is money leaving a wallet's
 * history and has to be recorded.
 */
async function sweepInterestClaims(options: SweepBlockRangeOptions, caches: SweepCaches): Promise<number> {
  const { provider, firestore, chainId, factoryAddress, fromBlock, toBlock } = options

  const logs = await queryLogs(provider, INTEREST_CLAIMED_TOPIC, fromBlock, toBlock)

  let stored = 0

  for (const log of logs) {
    try {
      const timestamp = await getBlockTimestamp(log.blockNumber, provider, caches)
      const parsed = parseInterestClaimedLog(log, chainId, timestamp)
      const poolId = await getPoolId(parsed.poolAddress, factoryAddress, provider, caches)

      if (poolId === UNKNOWN_POOL_ID) continue

      const result = await indexInterestClaimEvent({ ...parsed, poolId }, firestore)

      if (result.stored) stored++
    } catch (error) {
      logger.error('Failed to sweep InterestClaimed log', {
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
 * Index every loan touched in the range, borrowed or repaid alike.
 *
 * All five loan events are fetched in one topic-OR query and take the same
 * path, because the record written is the loan's state afterwards whichever it
 * was — `indexLoanFromLog` re-reads it from `getLoan` rather than inferring it
 * from which log arrived. That is what makes an approval swept before its
 * request, or a re-scan of either, land on the right answer.
 *
 * Emitted by the pool contracts, not the factory, so there is no address to
 * filter on; `indexLoanFromLog` returns null for a contract the factory does
 * not know, which is a silent skip for the same reason deposits are.
 */
async function sweepLoans(options: SweepBlockRangeOptions): Promise<number> {
  const { provider, firestore, chainId, factoryAddress, fromBlock, toBlock } = options

  const logs = await queryLogs(provider, [...LOAN_TOPICS], fromBlock, toBlock)

  let stored = 0

  for (const log of logs) {
    try {
      const indexed = await indexLoanFromLog(log, chainId, factoryAddress, provider, firestore)

      if (indexed?.result.stored) stored++
    } catch (error) {
      logger.error('Failed to sweep loan log', {
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
 * Index every payment towards a loan in the range.
 *
 * These logs are swept **twice** — once here for the payment record and once by
 * `sweepLoans`, which needs them to keep the loan's `amountRepaid` current. The
 * same deliberate duplication `MemberJoined` has: two records answering
 * different questions, both idempotent. A payment cannot be derived from the
 * loan (which holds only a running total, dated once at settlement) and the
 * loan cannot be derived from the payments (which never see a rejection or an
 * approval), so neither sweep can be dropped in favour of the other.
 */
async function sweepLoanRepayments(options: SweepBlockRangeOptions, caches: SweepCaches): Promise<number> {
  const { provider, firestore, chainId, factoryAddress, fromBlock, toBlock } = options

  const logs = await queryLogs(provider, LOAN_REPAYMENT_MADE_TOPIC, fromBlock, toBlock)

  let stored = 0

  for (const log of logs) {
    try {
      const timestamp = await getBlockTimestamp(log.blockNumber, provider, caches)
      const parsed = parseLoanRepaymentLog(log, chainId, timestamp)
      const poolId = await getPoolId(parsed.poolAddress, factoryAddress, provider, caches)

      if (poolId === UNKNOWN_POOL_ID) continue

      const result = await indexLoanRepaymentEvent({ ...parsed, poolId }, firestore)

      if (result.stored) stored++
    } catch (error) {
      logger.error('Failed to sweep LoanRepaymentMade log', {
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
 * Index every membership touched in the range.
 *
 * All six membership events take one topic-OR query and the same path, for the
 * reason loans do: `indexMembershipFromLog` re-reads `membership(address)`
 * rather than inferring standing from which log arrived, so an approval swept
 * before its request still lands on the right answer.
 *
 * `MemberJoined` is in the set, which means a deposit into an open pool is
 * swept twice — once here and once as a contribution. That is deliberate: they
 * are different records answering different questions, and both are idempotent.
 */
async function sweepMemberships(options: SweepBlockRangeOptions): Promise<number> {
  const { provider, firestore, chainId, factoryAddress, fromBlock, toBlock } = options

  const logs = await queryLogs(provider, [...MEMBERSHIP_TOPICS], fromBlock, toBlock)

  let stored = 0

  for (const log of logs) {
    try {
      const indexed = await indexMembershipFromLog(log, chainId, factoryAddress, provider, firestore)

      if (indexed?.result.stored) stored++
    } catch (error) {
      logger.error('Failed to sweep membership log', {
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
 * The feeds are swept in dependency order — pools, then their status, then
 * memberships, deposits, withdrawals and loans — so that a pool created and funded within the same
 * range is already in Firestore by the time its deposits land, and a pool
 * created and deactivated in one range gets its flag corrected rather than
 * being listed as active. Nothing enforces that order downstream, but a reader
 * that polls mid-sweep should never see a contribution pointing at a pool it
 * cannot find.
 *
 * A failed `getLogs` throws, so the caller can leave the sync cursor where it
 * was and retry the range. Failures on a single log do not: they are logged and
 * skipped, because one undecodable event must not wedge the sweep forever.
 */
export async function sweepBlockRange(options: SweepBlockRangeOptions): Promise<SweepCounts> {
  const caches: SweepCaches = { blockTimestamps: new Map(), poolIds: new Map() }

  const pools = await sweepPoolCreated(options, caches)
  const statusUpdates = await sweepPoolStatus(options)
  // Before deposits, so a pool's members exist by the time its contributions
  // land — the same dependency ordering pools get ahead of everything.
  const memberships = await sweepMemberships(options)
  const contributions = await sweepFundsDeposited(options, caches)
  const withdrawals = await sweepFundsWithdrawn(options, caches)
  const interestClaims = await sweepInterestClaims(options, caches)
  const loans = await sweepLoans(options)
  // After the loans, so a payment record never points at a loan the index has
  // not heard of yet. Same dependency ordering pools get ahead of everything.
  const loanRepayments = await sweepLoanRepayments(options, caches)

  return { pools, contributions, withdrawals, interestClaims, loans, loanRepayments, memberships, statusUpdates }
}
