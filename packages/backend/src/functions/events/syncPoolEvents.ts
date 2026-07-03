import { Contract } from 'ethers'
import { FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { ACTIVE_CHAIN_CONFIG, EVENT_SYNC_STATE_COLLECTION, PoolFactoryABI } from '../../constants'
import { firestore } from '../../services'
import { indexPoolEvent, parsePoolCreatedLog } from '../../services/eventIndexer'
import { getProvider } from '../../utils/blockchain'

const MAX_BLOCK_RANGE = 500

export const syncPoolEventsHandler = async (): Promise<void> => {
  const chainId = ACTIVE_CHAIN_CONFIG.chainId

  // Get provider — if this fails there's nothing we can do, exit early
  let provider: ReturnType<typeof getProvider>
  try {
    provider = getProvider(chainId)
  } catch (error) {
    logger.error('Failed to get provider for sync', {
      chainId,
      error: error instanceof Error ? error.message : String(error),
    })
    return
  }

  // Get current block number
  let currentBlock: number
  try {
    currentBlock = await provider.getBlockNumber()
  } catch (error) {
    logger.error('Failed to get current block number', {
      chainId,
      error: error instanceof Error ? error.message : String(error),
    })
    return
  }

  // Load sync state
  const syncStateRef = firestore.collection(EVENT_SYNC_STATE_COLLECTION).doc(chainId.toString())
  const syncStateDoc = await syncStateRef.get()

  let lastProcessedBlock: number
  if (syncStateDoc.exists) {
    lastProcessedBlock = syncStateDoc.data()!.lastProcessedBlock as number
  } else {
    const startBlock = parseInt(process.env.START_BLOCK || '0')
    lastProcessedBlock = startBlock > 0 ? startBlock - 1 : Math.max(0, currentBlock - 1000)
  }

  const fromBlock = lastProcessedBlock + 1

  if (fromBlock > currentBlock) {
    logger.info('Already synced up to current block, nothing to do', {
      chainId,
      lastProcessedBlock,
      currentBlock,
    })
    return
  }

  const toBlock = Math.min(currentBlock, fromBlock + MAX_BLOCK_RANGE)

  logger.info('Starting pool event sync', { chainId, fromBlock, toBlock, currentBlock })

  // Create read-only contract for event querying
  const contract = new Contract(ACTIVE_CHAIN_CONFIG.poolFactoryAddress, [...PoolFactoryABI], provider)

  let events: Awaited<ReturnType<typeof contract.queryFilter>>
  try {
    events = await contract.queryFilter(contract.filters.PoolCreated(), fromBlock, toBlock)
  } catch (error) {
    logger.error('Failed to query PoolCreated events', {
      chainId,
      fromBlock,
      toBlock,
      error: error instanceof Error ? error.message : String(error),
    })
    // Don't update sync state — next run retries from same block
    return
  }

  logger.info(`Found ${events.length} PoolCreated events`, { chainId, fromBlock, toBlock })

  let newPoolsCount = 0

  for (const event of events) {
    try {
      const block = await provider.getBlock(event.blockNumber)

      if (!block) {
        logger.error('Failed to fetch block for event', { blockNumber: event.blockNumber, chainId })
        continue
      }

      const parsedPool = parsePoolCreatedLog(event, chainId, block.timestamp)
      const result = await indexPoolEvent(parsedPool, firestore)

      if (result.stored) {
        newPoolsCount++
        logger.info('Indexed new pool from sync', { poolId: result.poolId, chainId })
      } else if (result.alreadyIndexed) {
        logger.info('Pool already indexed, skipped during sync', { poolId: result.poolId, chainId })
      }
    } catch (error) {
      // Per-event errors must not crash the whole run
      logger.error('Failed to process event during sync', {
        blockNumber: event.blockNumber,
        chainId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // Update sync state
  try {
    await syncStateRef.set(
      {
        chainId,
        lastProcessedBlock: toBlock,
        lastSyncedAt: new Date(),
        totalPoolsIndexed: FieldValue.increment(newPoolsCount),
      },
      { merge: true }
    )
  } catch (error) {
    // Don't crash — pools are still indexed even if state update fails
    logger.error('Failed to update sync state', {
      chainId,
      toBlock,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  logger.info(`Sync completed: blocks ${fromBlock}-${toBlock}, indexed ${newPoolsCount} new pools`, {
    chainId,
    fromBlock,
    toBlock,
    newPoolsCount,
  })
}

/**
 * Scheduled Cloud Function that runs every 5 minutes.
 * Queries all PoolCreated events from the last processed block to the current block
 * and indexes any new pools into Firestore. This is the fallback that ensures
 * no pool is ever lost if the on-demand indexPool callable was missed.
 */
export const syncPoolEvents = onSchedule(
  {
    schedule: 'every 5 minutes',
    memory: '256MiB',
    timeoutSeconds: 300,
  },
  syncPoolEventsHandler
)
