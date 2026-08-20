import { FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { DEFAULT_CHAIN_ID, EVENT_SYNC_STATE_COLLECTION, getChainConfig, SUPPORTED_CHAINS } from '../../constants'
import { firestore } from '../../services'
import { sweepBlockRange, SweepCounts } from '../../services/eventSweeper'
import { getProvider } from '../../utils/blockchain'

/** Blocks per `getLogs` call. Public RPCs cap the span of a single query. */
const MAX_BLOCK_RANGE = 500

/**
 * How many ranges one invocation will sweep before stopping — 50,000 blocks.
 *
 * The cap is what keeps a first run on a long-lived chain from running past the
 * function's timeout. Progress is persisted after every range, so stopping
 * early costs nothing: the next run resumes from where this one left off, and
 * a backfill converges over consecutive runs rather than in one heroic pass.
 */
const MAX_RANGES_PER_RUN = 100

/**
 * How far back a first run looks when it has no stored state and no
 * `START_BLOCK`. Deliberately short: on a public chain the factory's deployment
 * block is the only sane starting point, and guessing a large window burns RPC
 * quota re-reading history that holds none of our events.
 */
const DEFAULT_LOOKBACK_BLOCKS = 1000

/** Hardhat's chain id. A local node is short and disposable, so it is swept whole. */
const LOCAL_CHAIN_ID = 31337

/**
 * How far behind the head a sweep stops, in blocks.
 *
 * The sweep used to index up to `getBlockNumber()` and move its cursor past it.
 * That is correct on a Hardhat node, where the chain never reorganises, and
 * wrong on every real one: a log read from a block that is later orphaned is
 * written to Firestore, the cursor advances beyond it, and **the range is never
 * looked at again**. The document survives as a contribution, a loan or a
 * membership that no chain agrees happened — and since balances here are summed
 * from events rather than stored, one of those quietly inflates somebody's
 * position for ever.
 *
 * Polygon PoS reorganises a few blocks deep routinely. 128 is comfortably past
 * that and costs only latency in the sweep, which is not the path a user waits
 * on: the app indexes its own transaction the moment it has a receipt, through
 * `indexPool` / `indexLoan` and friends. Those are idempotent and keyed on the
 * log, so anything the sweep re-reads later is a no-op — the immediate path
 * buys responsiveness and this one buys correctness.
 *
 * Zero on a local chain, where there is no reorg to wait out and a 128-block
 * lag would simply mean nothing is ever indexed.
 */
const CONFIRMATIONS = 128

/**
 * The newest block a sweep of this chain may safely index.
 *
 * Never negative: a chain shorter than the confirmation depth has nothing
 * settled yet, and `fromBlock > safeHead` then short-circuits the run.
 */
export function safeHeadFor(currentBlock: number, chainId: number): number {
  if (chainId === LOCAL_CHAIN_ID) return currentBlock

  return Math.max(0, currentBlock - CONFIRMATIONS)
}

export interface SyncPoolEventsResult extends SweepCounts {
  chainId: number
  fromBlock: number
  /** The last block actually swept. Below `currentBlock` when the run hit its budget. */
  toBlock: number
  currentBlock: number
  caughtUp: boolean
}

export interface SyncPoolEventsOptions {
  /** Which chain to sweep. Defaults to `DEFAULT_CHAIN_ID`. */
  chainId?: number
  /** Re-scan from this block instead of resuming from the stored sync state. */
  fromBlock?: number
}

/**
 * Where a run with no stored sync state begins.
 *
 * `START_BLOCK` is the explicit answer and wins. Failing that, a local chain is
 * swept from genesis — it is a few dozen blocks deep and every one of them is
 * ours, so the seeded pools and any created outside the app are picked up
 * instead of being permanently invisible. On any other chain, falling back to
 * the whole history is not affordable, so it looks back a short window and logs
 * loudly that anything older needs `START_BLOCK` to be reachable.
 */
export function resolveInitialFromBlock(currentBlock: number, chainId: number): number {
  // The chain's own `START_BLOCK_<id>` first, then the single-chain
  // `START_BLOCK`. Without the per-chain form, one chain's deployment block
  // would be applied to every chain — which on a second chain means either
  // sweeping from far too early or skipping its history entirely.
  const configured = getChainConfig(chainId)?.startBlock ?? parseInt(process.env.START_BLOCK || '0')

  if (configured > 0) return configured

  if (chainId === LOCAL_CHAIN_ID) return 0

  const fromBlock = Math.max(0, currentBlock - DEFAULT_LOOKBACK_BLOCKS)

  logger.warn('No sync state and no START_BLOCK; events older than the lookback window will not be indexed', {
    chainId,
    fromBlock,
    currentBlock,
    lookback: DEFAULT_LOOKBACK_BLOCKS,
  })

  return fromBlock
}

/**
 * Sweep every SuperPool event from the last processed block to the chain head.
 *
 * This is the net under the on-demand indexers: `indexPool`, `indexContribution`
 * and `indexWithdrawal` each cover one transaction the app just watched confirm,
 * and anything that happened outside the app — seeding scripts, a direct
 * contract call, a transaction the app missed the receipt for — exists only on
 * chain until this runs. Every feed is covered, because a sweep that caught
 * pools alone left balances derived from an incomplete history — and pool
 * deactivation has no on-demand path at all, so this is the only thing that
 * ever reconciles it.
 *
 * @throws {Error} If the provider or the chain head cannot be reached at all.
 *   Per-range and per-log failures are logged and do not throw — the cursor
 *   simply does not advance past a range that failed.
 */
export const syncPoolEventsHandler = async (options: SyncPoolEventsOptions = {}): Promise<SyncPoolEventsResult> => {
  const chainId = options.chainId ?? DEFAULT_CHAIN_ID
  const chainConfig = getChainConfig(chainId)

  if (!chainConfig) {
    throw new Error(`Unsupported chain ID: ${chainId}`)
  }

  const factoryAddress = chainConfig.poolFactoryAddress

  if (!factoryAddress) {
    throw new Error(`PoolFactory address not configured for chain ${chainId}`)
  }

  const provider = getProvider(chainId)
  const currentBlock = await provider.getBlockNumber()

  // Everything below sweeps to `safeHead`, not to the head. See `CONFIRMATIONS`:
  // a log read from a block that is later orphaned would be written once and
  // never revisited, because the cursor moves past it.
  const safeHead = safeHeadFor(currentBlock, chainId)

  const syncStateRef = firestore.collection(EVENT_SYNC_STATE_COLLECTION).doc(chainId.toString())
  const syncStateDoc = await syncStateRef.get()
  const lastProcessedBlock = syncStateDoc.exists ? (syncStateDoc.data()!.lastProcessedBlock as number) : undefined

  let fromBlock: number
  if (options.fromBlock !== undefined) {
    fromBlock = Math.max(0, options.fromBlock)
  } else if (lastProcessedBlock !== undefined) {
    fromBlock = lastProcessedBlock + 1
  } else {
    fromBlock = resolveInitialFromBlock(currentBlock, chainId)
  }

  const totals: SweepCounts = {
    pools: 0,
    contributions: 0,
    withdrawals: 0,
    interestClaims: 0,
    loans: 0,
    loanRepayments: 0,
    loanDecisions: 0,
    memberships: 0,
    statusUpdates: 0,
  }

  if (fromBlock > safeHead) {
    // Includes the ordinary case on a quiet chain: the head has moved but not
    // yet by a confirmation depth, so there is nothing newly settled to read.
    logger.info('Already synced up to the confirmed head, nothing to do', { chainId, lastProcessedBlock, currentBlock, safeHead })

    return { chainId, fromBlock, toBlock: safeHead, currentBlock, caughtUp: true, ...totals }
  }

  logger.info('Starting event sync', { chainId, fromBlock, currentBlock, safeHead })

  let cursor = fromBlock
  let lastSweptBlock = fromBlock - 1
  let ranges = 0

  while (cursor <= safeHead && ranges < MAX_RANGES_PER_RUN) {
    const toBlock = Math.min(safeHead, cursor + MAX_BLOCK_RANGE - 1)

    let counts: SweepCounts
    try {
      counts = await sweepBlockRange({ provider, firestore, chainId, factoryAddress, fromBlock: cursor, toBlock })
    } catch (error) {
      // Leave the cursor where it is so the next run retries this exact range.
      logger.error('Failed to sweep block range; stopping this run', {
        chainId,
        fromBlock: cursor,
        toBlock,
        error: error instanceof Error ? error.message : String(error),
      })
      break
    }

    totals.pools += counts.pools
    totals.contributions += counts.contributions
    totals.withdrawals += counts.withdrawals
    totals.interestClaims += counts.interestClaims
    totals.loans += counts.loans
    totals.loanRepayments += counts.loanRepayments
    totals.loanDecisions += counts.loanDecisions
    totals.memberships += counts.memberships
    totals.statusUpdates += counts.statusUpdates
    lastSweptBlock = toBlock

    // Persisted per range, not once at the end: a run that times out or dies
    // mid-backfill keeps everything it has already indexed, and the next one
    // does not re-read those blocks.
    //
    // `lastProcessedBlock` never moves backwards — an explicit `fromBlock`
    // re-scan is idempotent, but letting it rewind the cursor would make the
    // scheduled sweep redo all the blocks in between afterwards.
    try {
      await syncStateRef.set(
        {
          chainId,
          lastProcessedBlock: Math.max(toBlock, lastProcessedBlock ?? toBlock),
          lastSyncedAt: new Date(),
          totalPoolsIndexed: FieldValue.increment(counts.pools),
          totalContributionsIndexed: FieldValue.increment(counts.contributions),
          totalWithdrawalsIndexed: FieldValue.increment(counts.withdrawals),
          totalInterestClaimsIndexed: FieldValue.increment(counts.interestClaims),
          totalLoansIndexed: FieldValue.increment(counts.loans),
          totalLoanRepaymentsIndexed: FieldValue.increment(counts.loanRepayments),
          totalLoanDecisionsIndexed: FieldValue.increment(counts.loanDecisions),
          totalMembershipsIndexed: FieldValue.increment(counts.memberships),
          totalPoolStatusUpdates: FieldValue.increment(counts.statusUpdates),
        },
        { merge: true }
      )
    } catch (error) {
      // The events are indexed either way; only the cursor is at risk, and a
      // repeated range is harmless because every indexer keys on the log.
      logger.error('Failed to update sync state', {
        chainId,
        toBlock,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    cursor = toBlock + 1
    ranges++
  }

  // Against `safeHead` rather than `currentBlock`: "caught up" means this run
  // read everything it was allowed to read. Measuring it against the head would
  // report `false` on every successful run, since the last 128 blocks are
  // deliberately left alone.
  const caughtUp = lastSweptBlock >= safeHead

  logger.info('Event sync completed', {
    chainId,
    fromBlock,
    toBlock: lastSweptBlock,
    currentBlock,
    safeHead,
    caughtUp,
    ranges,
    ...totals,
  })

  return { chainId, fromBlock, toBlock: lastSweptBlock, currentBlock, caughtUp, ...totals }
}

/**
 * Sweep every chain this backend serves, one after another.
 *
 * Sequential rather than concurrent on purpose: the per-range budget exists to
 * keep one chain's backfill inside the function timeout, and running several
 * chains in parallel would multiply the RPC pressure while making that budget
 * meaningless.
 *
 * **One chain's failure must not stop the others.** An unreachable RPC is the
 * ordinary case on a public testnet, and letting it abort the run would mean a
 * flaky Amoy endpoint silently stopping localhost indexing too. Each chain is
 * caught on its own and reported in the results.
 */
export const syncAllChainsHandler = async (): Promise<SyncPoolEventsResult[]> => {
  const results: SyncPoolEventsResult[] = []

  for (const chain of SUPPORTED_CHAINS) {
    // A chain configured without a factory address cannot be swept, and saying
    // so once per run beats an exception per run.
    if (!chain.poolFactoryAddress) {
      logger.warn('Skipping chain with no PoolFactory address configured', { chainId: chain.chainId, name: chain.name })
      continue
    }

    try {
      results.push(await syncPoolEventsHandler({ chainId: chain.chainId }))
    } catch (error) {
      logger.error('Event sync failed for chain; continuing with the rest', {
        chainId: chain.chainId,
        name: chain.name,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return results
}

/**
 * Scheduled Cloud Function that runs every 5 minutes.
 *
 * Wrapped rather than passed directly: `onSchedule` calls its handler with a
 * `ScheduledEvent`, which would be read as this handler's options.
 *
 * Scheduled functions do not fire in the Firebase emulator — use the
 * `syncPoolEventsNow` callable to run the same sweep locally.
 */
export const syncPoolEvents = onSchedule(
  {
    schedule: 'every 5 minutes',
    memory: '256MiB',
    timeoutSeconds: 300,
  },
  async (): Promise<void> => {
    try {
      await syncAllChainsHandler()
    } catch (error) {
      // A scheduled run that throws is retried on its own cadence; there is
      // nothing to report back to, so failing loudly in the log is the whole job.
      logger.error('Scheduled event sync failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
)
