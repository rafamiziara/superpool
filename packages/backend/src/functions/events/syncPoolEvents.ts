import { FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { ACTIVE_CHAIN_CONFIG, EVENT_SYNC_STATE_COLLECTION } from '../../constants'
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

export interface SyncPoolEventsResult extends SweepCounts {
  chainId: number
  fromBlock: number
  /** The last block actually swept. Below `currentBlock` when the run hit its budget. */
  toBlock: number
  currentBlock: number
  caughtUp: boolean
}

export interface SyncPoolEventsOptions {
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
  const configured = parseInt(process.env.START_BLOCK || '0')

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
 * chain until this runs. All three feeds are covered, because a sweep that
 * caught pools alone left balances derived from an incomplete history.
 *
 * @throws {Error} If the provider or the chain head cannot be reached at all.
 *   Per-range and per-log failures are logged and do not throw — the cursor
 *   simply does not advance past a range that failed.
 */
export const syncPoolEventsHandler = async (options: SyncPoolEventsOptions = {}): Promise<SyncPoolEventsResult> => {
  const chainId = ACTIVE_CHAIN_CONFIG.chainId
  const factoryAddress = ACTIVE_CHAIN_CONFIG.poolFactoryAddress

  if (!factoryAddress) {
    throw new Error(`PoolFactory address not configured for chain ${chainId}`)
  }

  const provider = getProvider(chainId)
  const currentBlock = await provider.getBlockNumber()

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

  const totals: SweepCounts = { pools: 0, contributions: 0, withdrawals: 0 }

  if (fromBlock > currentBlock) {
    logger.info('Already synced up to current block, nothing to do', { chainId, lastProcessedBlock, currentBlock })

    return { chainId, fromBlock, toBlock: currentBlock, currentBlock, caughtUp: true, ...totals }
  }

  logger.info('Starting event sync', { chainId, fromBlock, currentBlock })

  let cursor = fromBlock
  let lastSweptBlock = fromBlock - 1
  let ranges = 0

  while (cursor <= currentBlock && ranges < MAX_RANGES_PER_RUN) {
    const toBlock = Math.min(currentBlock, cursor + MAX_BLOCK_RANGE - 1)

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

  const caughtUp = lastSweptBlock >= currentBlock

  logger.info('Event sync completed', {
    chainId,
    fromBlock,
    toBlock: lastSweptBlock,
    currentBlock,
    caughtUp,
    ranges,
    ...totals,
  })

  return { chainId, fromBlock, toBlock: lastSweptBlock, currentBlock, caughtUp, ...totals }
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
      await syncPoolEventsHandler()
    } catch (error) {
      // A scheduled run that throws is retried on its own cadence; there is
      // nothing to report back to, so failing loudly in the log is the whole job.
      logger.error('Scheduled event sync failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
)
