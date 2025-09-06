import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import { ethers } from 'ethers'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { PoolFactoryABI } from '../../constants/abis'
import { handleError, AppError } from '../../utils/errorHandling'
import type { PoolCreatedEvent, EventSyncState } from './syncPoolEvents'
import { processPoolEvents } from './processPoolEvents'

export interface SyncHistoricalEventsRequest {
  fromBlock: number
  toBlock?: number
  chainId?: number
  batchSize?: number
  skipProcessing?: boolean
}

export interface SyncHistoricalEventsResponse {
  success: boolean
  totalEvents: number
  processedEvents: number
  fromBlock: number
  toBlock: number
  duration: number
  chainId: number
  message: string
}

/**
 * Cloud Function to sync historical PoolCreated events from blockchain
 *
 * This function allows manual synchronization of historical events for:
 * 1. Initial blockchain data import
 * 2. Recovery from missed events
 * 3. Data migration and backfills
 * 4. Testing and development
 *
 * Features:
 * - Configurable block ranges
 * - Batch processing to handle large ranges
 * - Event deduplication
 * - Progress tracking and error recovery
 */
export const syncHistoricalEvents = onCall(
  {
    memory: '2GiB',
    timeoutSeconds: 540, // 9 minutes
    cors: true,
    region: 'us-central1',
  },
  async (request: CallableRequest<SyncHistoricalEventsRequest>): Promise<SyncHistoricalEventsResponse> => {
    const functionName = 'syncHistoricalEvents'
    const startTime = Date.now()

    logger.info(`${functionName}: Starting historical events sync`, {
      uid: request.auth?.uid,
      fromBlock: request.data.fromBlock,
      toBlock: request.data.toBlock,
      chainId: request.data.chainId,
      batchSize: request.data.batchSize,
    })

    try {
      // Validate authentication (only allow admins for historical sync)
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required for historical sync')
      }

      // Validate request parameters
      if (!request.data.fromBlock || request.data.fromBlock < 0) {
        throw new HttpsError('invalid-argument', 'Valid fromBlock is required')
      }

      const chainId = request.data.chainId || 80002
      const batchSize = request.data.batchSize || 5000 // Process 5000 blocks at a time
      const skipProcessing = request.data.skipProcessing || false

      // Get environment variables
      const rpcUrl = chainId === 80002 ? process.env.POLYGON_AMOY_RPC_URL : process.env.POLYGON_MAINNET_RPC_URL
      const poolFactoryAddress = chainId === 80002 ? process.env.POOL_FACTORY_ADDRESS_AMOY : process.env.POOL_FACTORY_ADDRESS_POLYGON

      if (!rpcUrl || !poolFactoryAddress) {
        throw new HttpsError('failed-precondition', 'Missing blockchain configuration')
      }

      // Initialize blockchain connection
      const provider = new ethers.JsonRpcProvider(rpcUrl)
      const poolFactory = new ethers.Contract(poolFactoryAddress, PoolFactoryABI, provider)

      // Get current block if toBlock not specified
      const currentBlock = await provider.getBlockNumber()
      const toBlock = request.data.toBlock || currentBlock

      if (request.data.fromBlock > toBlock) {
        throw new HttpsError('invalid-argument', 'fromBlock cannot be greater than toBlock')
      }

      logger.info(`${functionName}: Blockchain connection established`, {
        chainId,
        currentBlock,
        poolFactoryAddress,
        syncRange: `${request.data.fromBlock} - ${toBlock}`,
      })

      const db = getFirestore()
      let totalEvents = 0
      let processedEvents = 0
      const allEvents: PoolCreatedEvent[] = []

      // Process in batches to avoid RPC limits and timeouts
      for (let fromBatch = request.data.fromBlock; fromBatch <= toBlock; fromBatch += batchSize) {
        const toBatch = Math.min(fromBatch + batchSize - 1, toBlock)

        logger.info(`${functionName}: Processing batch`, {
          fromBlock: fromBatch,
          toBlock: toBatch,
          batchSize: toBatch - fromBatch + 1,
        })

        try {
          // Query for PoolCreated events in batch range
          const eventFilter = poolFactory.filters.PoolCreated()
          const events = await poolFactory.queryFilter(eventFilter, fromBatch, toBatch)

          logger.info(`${functionName}: Found events in batch`, {
            fromBlock: fromBatch,
            toBlock: toBatch,
            eventsFound: events.length,
          })

          // Process events in this batch
          for (const event of events) {
            try {
              // Extract event data - cast to EventLog to access args
              const eventLog = event as ethers.EventLog
              if (!eventLog.args || eventLog.args.length < 7) {
                logger.warn(`${functionName}: Invalid event args, skipping event`)
                continue
              }
              const [poolId, poolAddress, poolOwner, name, maxLoanAmount, interestRate, loanDuration] = eventLog.args

              // Get block timestamp
              const block = await provider.getBlock(event.blockNumber)
              if (!block) {
                logger.warn(`${functionName}: Block ${event.blockNumber} not found, skipping event`)
                continue
              }

              // Create pool event document
              const poolEvent: PoolCreatedEvent = {
                poolId: poolId.toString(),
                poolAddress,
                poolOwner,
                name,
                maxLoanAmount: maxLoanAmount.toString(),
                interestRate: Number(interestRate),
                loanDuration: Number(loanDuration),
                transactionHash: event.transactionHash,
                blockNumber: event.blockNumber,
                logIndex: event.index,
                timestamp: block.timestamp,
              }

              allEvents.push(poolEvent)
              totalEvents++

              // Process events in smaller batches if not skipping
              if (!skipProcessing && allEvents.length >= 10) {
                try {
                  const processResult = await processPoolEvents.run({
                    data: { events: [...allEvents], chainId },
                    auth: request.auth,
                  } as any)

                  processedEvents += processResult.processedCount

                  logger.info(`${functionName}: Batch processed`, {
                    eventsInBatch: allEvents.length,
                    processedCount: processResult.processedCount,
                    skippedCount: processResult.skippedCount,
                    errorCount: processResult.errorCount,
                  })

                  // Clear the batch
                  allEvents.length = 0
                } catch (error) {
                  logger.error(`${functionName}: Error processing event batch`, {
                    error: error instanceof Error ? error.message : String(error),
                    batchSize: allEvents.length,
                  })

                  // Clear the batch and continue
                  allEvents.length = 0
                }
              }
            } catch (error) {
              logger.error(`${functionName}: Error processing individual event`, {
                error: error instanceof Error ? error.message : String(error),
                eventBlockNumber: event.blockNumber,
                eventTxHash: event.transactionHash,
              })
              continue
            }
          }

          // Small delay between batches to avoid rate limiting
          if (toBatch < toBlock) {
            await new Promise((resolve) => setTimeout(resolve, 100))
          }
        } catch (error) {
          logger.error(`${functionName}: Error processing batch`, {
            error: error instanceof Error ? error.message : String(error),
            fromBlock: fromBatch,
            toBlock: toBatch,
          })

          // Continue with next batch
          continue
        }
      }

      // Process remaining events
      if (!skipProcessing && allEvents.length > 0) {
        try {
          const processResult = await processPoolEvents.run({
            data: { events: allEvents, chainId },
            auth: request.auth,
          } as any)

          processedEvents += processResult.processedCount

          logger.info(`${functionName}: Final batch processed`, {
            eventsInBatch: allEvents.length,
            processedCount: processResult.processedCount,
            skippedCount: processResult.skippedCount,
            errorCount: processResult.errorCount,
          })
        } catch (error) {
          logger.error(`${functionName}: Error processing final batch`, {
            error: error instanceof Error ? error.message : String(error),
            batchSize: allEvents.length,
          })
        }
      }

      // Update sync state if processing was successful
      if (!skipProcessing && processedEvents > 0) {
        const syncStateRef = db.collection('event_sync_state').doc(`poolFactory_${chainId}`)
        await syncStateRef.set(
          {
            contractAddress: poolFactoryAddress,
            chainId,
            lastProcessedBlock: toBlock,
            lastSyncAt: new Date(),
            totalEventsProcessed: FieldValue.increment(processedEvents),
            lastEventTimestamp: new Date(),
            historicalSyncCompleted: true,
            historicalSyncRange: `${request.data.fromBlock}-${toBlock}`,
          },
          { merge: true }
        )
      }

      const duration = Date.now() - startTime

      const response: SyncHistoricalEventsResponse = {
        success: true,
        totalEvents,
        processedEvents,
        fromBlock: request.data.fromBlock,
        toBlock,
        duration,
        chainId,
        message: `Successfully synced ${totalEvents} historical events (${processedEvents} processed) from blocks ${request.data.fromBlock} to ${toBlock}`,
      }

      logger.info(`${functionName}: Historical sync completed`, {
        ...response,
        durationMs: duration,
      })

      return response
    } catch (error) {
      const duration = Date.now() - startTime

      logger.error(`${functionName}: Historical sync failed`, {
        error: error instanceof Error ? error.message : String(error),
        duration,
        fromBlock: request.data.fromBlock,
        toBlock: request.data.toBlock,
        chainId: request.data.chainId,
        stack: error instanceof Error ? error.stack : undefined,
      })

      if (error instanceof HttpsError) {
        throw error
      }

      throw new HttpsError('internal', `Historical sync failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

/**
 * Helper function to estimate sync progress and provide recommendations
 */
export const estimateSyncProgress = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true,
    region: 'us-central1',
  },
  async (request: CallableRequest<{ chainId?: number }>) => {
    const functionName = 'estimateSyncProgress'

    try {
      const chainId = request.data.chainId || 80002

      // Get RPC URL
      const rpcUrl = chainId === 80002 ? process.env.POLYGON_AMOY_RPC_URL : process.env.POLYGON_MAINNET_RPC_URL

      if (!rpcUrl) {
        throw new HttpsError('failed-precondition', 'Missing RPC configuration')
      }

      // Get current blockchain state
      const provider = new ethers.JsonRpcProvider(rpcUrl)
      const currentBlock = await provider.getBlockNumber()

      // Get sync state from Firestore
      const db = getFirestore()
      const syncStateRef = db.collection('event_sync_state').doc(`poolFactory_${chainId}`)
      const syncStateDoc = await syncStateRef.get()

      let syncState: EventSyncState | null = null
      if (syncStateDoc.exists) {
        syncState = syncStateDoc.data() as EventSyncState
      }

      // Calculate recommendations
      const recommendations = {
        needsInitialSync: !syncState,
        needsHistoricalSync: !syncState?.historicalSyncCompleted,
        blocksBehind: syncState ? currentBlock - syncState.lastProcessedBlock : currentBlock,
        estimatedSyncTime: 0,
        recommendedBatchSize: 5000,
        riskOfMissedEvents: false,
      }

      if (recommendations.blocksBehind > 1000) {
        recommendations.riskOfMissedEvents = true
        recommendations.estimatedSyncTime = Math.ceil(recommendations.blocksBehind / 5000) * 30 // 30 seconds per 5000 blocks
      }

      logger.info(`${functionName}: Sync progress estimated`, {
        chainId,
        currentBlock,
        syncState,
        recommendations,
      })

      return {
        currentBlock,
        syncState,
        recommendations,
      }
    } catch (error) {
      logger.error(`${functionName}: Failed to estimate sync progress`, {
        error: error instanceof Error ? error.message : String(error),
      })

      throw new HttpsError('internal', 'Failed to estimate sync progress')
    }
  }
)
