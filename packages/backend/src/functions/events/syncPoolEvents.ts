import { onSchedule } from 'firebase-functions/v2/scheduler'
import { logger } from 'firebase-functions'
import { ethers } from 'ethers'
import { getFirestore } from 'firebase-admin/firestore'
import { PoolFactoryABI } from '../../constants/abis'
import { handleError, AppError } from '../../utils/errorHandling'

export interface PoolCreatedEvent {
  poolId: string
  poolAddress: string
  poolOwner: string
  name: string
  maxLoanAmount: string
  interestRate: number
  loanDuration: number
  transactionHash: string
  blockNumber: number
  logIndex: number
  timestamp: number
}

export interface EventSyncState {
  contractAddress: string
  chainId: number
  lastProcessedBlock: number
  lastSyncAt: Date
  totalEventsProcessed: number
  lastEventTimestamp?: Date
  historicalSyncCompleted?: boolean
  historicalSyncRange?: string
}

/**
 * Scheduled Cloud Function to sync PoolCreated events from blockchain to Firestore
 * 
 * Runs every 2 minutes to scan for new PoolCreated events and sync them to Firestore.
 * Uses efficient block-range queries to avoid missing events and provides reliable
 * synchronization without WebSocket connection issues.
 */
export const syncPoolEvents = onSchedule(
  {
    // Run every 2 minutes
    schedule: 'every 2 minutes',
    timeZone: 'UTC',
    memory: '1GiB',
    timeoutSeconds: 540, // 9 minutes
    region: 'us-central1'
  },
  async (event) => {
    const functionName = 'syncPoolEvents'
    const startTime = Date.now()
    
    logger.info(`${functionName}: Starting scheduled pool events sync`, {
      scheduledTime: event.scheduleTime,
      jobName: event.jobName
    })

    try {
      // Get environment variables
      const chainId = parseInt(process.env.CHAIN_ID || '80002') // Default to Polygon Amoy
      const rpcUrl = chainId === 80002 
        ? process.env.POLYGON_AMOY_RPC_URL 
        : process.env.POLYGON_MAINNET_RPC_URL
      const poolFactoryAddress = chainId === 80002
        ? process.env.POOL_FACTORY_ADDRESS_AMOY
        : process.env.POOL_FACTORY_ADDRESS_POLYGON

      if (!rpcUrl || !poolFactoryAddress) {
        throw new AppError(
          'Missing required environment variables',
          'CONFIGURATION_ERROR'
        )
      }

      // Initialize blockchain connection
      const provider = new ethers.JsonRpcProvider(rpcUrl)
      const poolFactory = new ethers.Contract(poolFactoryAddress, PoolFactoryABI, provider)
      
      // Get current block number
      const currentBlock = await provider.getBlockNumber()
      
      logger.info(`${functionName}: Connected to blockchain`, {
        chainId,
        currentBlock,
        poolFactoryAddress
      })

      // Get last processed block from Firestore
      const db = getFirestore()
      const syncStateRef = db.collection('event_sync_state').doc(`poolFactory_${chainId}`)
      const syncStateDoc = await syncStateRef.get()
      
      let lastProcessedBlock: number
      let syncState: EventSyncState
      
      if (!syncStateDoc.exists) {
        // First time running - start from recent blocks (last 1000 blocks or 24 hours)
        const startBlock = Math.max(currentBlock - 1000, 0)
        syncState = {
          contractAddress: poolFactoryAddress,
          chainId,
          lastProcessedBlock: startBlock,
          lastSyncAt: new Date(),
          totalEventsProcessed: 0
        }
        lastProcessedBlock = startBlock
        
        logger.info(`${functionName}: First sync - starting from block ${startBlock}`)
      } else {
        syncState = syncStateDoc.data() as EventSyncState
        lastProcessedBlock = syncState.lastProcessedBlock
        
        logger.info(`${functionName}: Continuing sync from block ${lastProcessedBlock}`)
      }

      // Calculate block range to process
      const fromBlock = lastProcessedBlock + 1
      const toBlock = currentBlock

      if (fromBlock > toBlock) {
        logger.info(`${functionName}: No new blocks to process`, {
          fromBlock,
          toBlock,
          lastProcessedBlock
        })
        
        // Update last sync timestamp
        await syncStateRef.set({
          ...syncState,
          lastSyncAt: new Date()
        }, { merge: true })
        
        return
      }

      // Query for PoolCreated events in block range
      const eventFilter = poolFactory.filters.PoolCreated()
      
      logger.info(`${functionName}: Querying events`, {
        fromBlock,
        toBlock,
        blockRange: toBlock - fromBlock + 1
      })

      const events = await poolFactory.queryFilter(eventFilter, fromBlock, toBlock)
      
      logger.info(`${functionName}: Found ${events.length} PoolCreated events`, {
        fromBlock,
        toBlock,
        eventsFound: events.length
      })

      let processedEvents = 0
      const batch = db.batch()

      // Process each event
      for (const event of events) {
        try {
          // Extract event data - cast to EventLog to access args
          const eventLog = event as ethers.EventLog
          if (!eventLog.args || eventLog.args.length < 7) {
            throw new Error('Invalid event args')
          }
          const [poolId, poolAddress, poolOwner, name, maxLoanAmount, interestRate, loanDuration] = eventLog.args

          // Get block timestamp
          const block = await provider.getBlock(event.blockNumber)
          if (!block) {
            throw new Error(`Block ${event.blockNumber} not found`)
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
            timestamp: block.timestamp
          }

          // Create unique event ID for deduplication
          const eventId = `${event.transactionHash}_${event.index}`

          // Add pool document to batch
          const poolRef = db.collection('pools').doc(poolEvent.poolId)
          batch.set(poolRef, {
            id: poolEvent.poolId,
            address: poolEvent.poolAddress,
            owner: poolEvent.poolOwner,
            name: poolEvent.name,
            maxLoanAmount: poolEvent.maxLoanAmount,
            interestRate: poolEvent.interestRate,
            loanDuration: poolEvent.loanDuration,
            createdAt: new Date(poolEvent.timestamp * 1000),
            transactionHash: poolEvent.transactionHash,
            blockNumber: poolEvent.blockNumber,
            chainId,
            isActive: true,
            // Additional metadata
            metadata: {
              eventId,
              logIndex: poolEvent.logIndex,
              syncedAt: new Date()
            }
          })

          // Add event log for audit trail
          const eventLogRef = db.collection('event_logs').doc(eventId)
          batch.set(eventLogRef, {
            eventType: 'PoolCreated',
            contractAddress: poolFactoryAddress,
            chainId,
            ...poolEvent,
            processedAt: new Date()
          })

          processedEvents++

          logger.info(`${functionName}: Processed PoolCreated event`, {
            poolId: poolEvent.poolId,
            poolAddress: poolEvent.poolAddress,
            poolOwner: poolEvent.poolOwner,
            name: poolEvent.name,
            blockNumber: event.blockNumber,
            transactionHash: event.transactionHash
          })

        } catch (error) {
          logger.error(`${functionName}: Error processing event`, {
            error: error instanceof Error ? error.message : String(error),
            eventBlockNumber: event.blockNumber,
            eventTxHash: event.transactionHash,
            eventIndex: event.index
          })
          
          // Continue processing other events
          continue
        }
      }

      // Update sync state
      const updatedSyncState: EventSyncState = {
        ...syncState,
        lastProcessedBlock: toBlock,
        lastSyncAt: new Date(),
        totalEventsProcessed: syncState.totalEventsProcessed + processedEvents,
        lastEventTimestamp: events.length > 0 ? new Date(events[events.length - 1].blockNumber * 1000) : syncState.lastEventTimestamp
      }

      // Add sync state update to batch
      batch.set(syncStateRef, updatedSyncState, { merge: true })

      // Commit all changes atomically
      await batch.commit()

      const duration = Date.now() - startTime

      logger.info(`${functionName}: Successfully synced pool events`, {
        fromBlock,
        toBlock,
        blocksProcessed: toBlock - fromBlock + 1,
        eventsFound: events.length,
        eventsProcessed: processedEvents,
        totalEventsProcessed: updatedSyncState.totalEventsProcessed,
        duration: `${duration}ms`,
        chainId
      })

    } catch (error) {
      const duration = Date.now() - startTime
      
      logger.error(`${functionName}: Failed to sync pool events`, {
        error: error instanceof Error ? error.message : String(error),
        duration: `${duration}ms`,
        stack: error instanceof Error ? error.stack : undefined
      })

      // Re-throw to trigger retry mechanism
      throw error instanceof AppError ? error : new AppError(
        `Failed to sync pool events: ${error instanceof Error ? error.message : String(error)}`,
        'SYNC_FAILED'
      )
    }
  }
)