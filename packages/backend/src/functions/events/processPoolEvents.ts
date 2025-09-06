import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { ethers } from 'ethers'
import { AppError, handleError } from '../../utils/errorHandling'
import { validateAddress } from '../../utils/validation'
import type { PoolCreatedEvent } from './syncPoolEvents'

export interface ProcessPoolEventsRequest {
  events: PoolCreatedEvent[]
  chainId?: number
  skipValidation?: boolean
}

export interface ProcessPoolEventsResponse {
  success: boolean
  processedCount: number
  skippedCount: number
  errorCount: number
  details: {
    processed: string[] // pool IDs
    skipped: string[] // pool IDs with reasons
    errors: string[] // pool IDs with error messages
  }
  message: string
}

export interface PoolDocument {
  id: string
  address: string
  owner: string
  name: string
  description?: string
  maxLoanAmount: string
  interestRate: number
  loanDuration: number
  createdAt: Date
  updatedAt: Date
  transactionHash: string
  blockNumber: number
  chainId: number
  isActive: boolean

  // Pool statistics (updated by other functions)
  stats?: {
    totalLent: string
    totalBorrowed: string
    activeLoans: number
    completedLoans: number
    defaultedLoans: number
    apr: number
    utilization: number
  }

  // Metadata
  metadata: {
    eventId: string
    logIndex: number
    syncedAt: Date
    lastUpdated?: Date
    version: number
  }

  // Search and filtering
  tags?: string[]
  category?: string
  isVerified?: boolean
  isFeatured?: boolean
}

/**
 * Cloud Function to process and validate PoolCreated events
 *
 * This function can be called to:
 * 1. Process events in batches for better performance
 * 2. Validate event data before storing in Firestore
 * 3. Handle event deduplication
 * 4. Update pool metadata and search indexes
 */
export const processPoolEvents = onCall(
  {
    memory: '1GiB',
    timeoutSeconds: 540, // 9 minutes
    cors: true,
    region: 'us-central1',
  },
  async (request: CallableRequest<ProcessPoolEventsRequest>): Promise<ProcessPoolEventsResponse> => {
    const functionName = 'processPoolEvents'
    logger.info(`${functionName}: Starting event processing`, {
      uid: request.auth?.uid,
      eventsCount: request.data.events.length,
      chainId: request.data.chainId,
      skipValidation: request.data.skipValidation,
    })

    try {
      // Validate request
      if (!request.data.events || !Array.isArray(request.data.events)) {
        throw new HttpsError('invalid-argument', 'Events array is required')
      }

      if (request.data.events.length === 0) {
        return {
          success: true,
          processedCount: 0,
          skippedCount: 0,
          errorCount: 0,
          details: { processed: [], skipped: [], errors: [] },
          message: 'No events to process',
        }
      }

      const chainId = request.data.chainId || 80002
      const skipValidation = request.data.skipValidation || false

      const db = getFirestore()
      const batch = db.batch()

      let processedCount = 0
      let skippedCount = 0
      let errorCount = 0

      const details = {
        processed: [] as string[],
        skipped: [] as string[],
        errors: [] as string[],
      }

      // Process each event
      for (const event of request.data.events) {
        try {
          // Create unique event ID for deduplication
          const eventId = `${event.transactionHash}_${event.logIndex}`

          // Check if event already processed
          const existingEventRef = db.collection('event_logs').doc(eventId)
          const existingEvent = await existingEventRef.get()

          if (existingEvent.exists) {
            logger.info(`${functionName}: Event already processed, skipping`, {
              eventId,
              poolId: event.poolId,
              transactionHash: event.transactionHash,
            })

            skippedCount++
            details.skipped.push(`${event.poolId}: Already processed`)
            continue
          }

          // Validate event data
          if (!skipValidation) {
            const validationErrors = validatePoolEvent(event)
            if (validationErrors.length > 0) {
              logger.warn(`${functionName}: Event validation failed`, {
                eventId,
                poolId: event.poolId,
                errors: validationErrors,
              })

              errorCount++
              details.errors.push(`${event.poolId}: ${validationErrors.join(', ')}`)
              continue
            }
          }

          // Check if pool already exists
          const poolRef = db.collection('pools').doc(event.poolId)
          const existingPool = await poolRef.get()

          if (existingPool.exists) {
            // Update existing pool if this event is newer
            const existingData = existingPool.data() as PoolDocument
            if (existingData.blockNumber >= event.blockNumber) {
              logger.info(`${functionName}: Pool exists with newer or same block, skipping`, {
                poolId: event.poolId,
                existingBlock: existingData.blockNumber,
                eventBlock: event.blockNumber,
              })

              skippedCount++
              details.skipped.push(`${event.poolId}: Existing pool is newer`)
              continue
            }
          }

          // Create pool document
          const poolDocument: PoolDocument = {
            id: event.poolId,
            address: event.poolAddress,
            owner: event.poolOwner,
            name: event.name,
            maxLoanAmount: event.maxLoanAmount,
            interestRate: event.interestRate,
            loanDuration: event.loanDuration,
            createdAt: new Date(event.timestamp * 1000),
            updatedAt: new Date(),
            transactionHash: event.transactionHash,
            blockNumber: event.blockNumber,
            chainId,
            isActive: true,

            // Initialize stats
            stats: {
              totalLent: '0',
              totalBorrowed: '0',
              activeLoans: 0,
              completedLoans: 0,
              defaultedLoans: 0,
              apr: event.interestRate / 100, // Convert basis points to percentage
              utilization: 0,
            },

            // Metadata
            metadata: {
              eventId,
              logIndex: event.logIndex,
              syncedAt: new Date(),
              version: 1,
            },

            // Default values
            tags: ['lending', 'defi'],
            isVerified: false,
            isFeatured: false,
          }

          // Add pool to batch
          batch.set(poolRef, poolDocument, { merge: true })

          // Add event log to batch
          const eventLogRef = db.collection('event_logs').doc(eventId)
          batch.set(eventLogRef, {
            eventType: 'PoolCreated',
            contractAddress: event.poolAddress,
            chainId,
            ...event,
            processedAt: new Date(),
            processedBy: request.auth?.uid || 'system',
          })

          // Add to pool owner index
          const ownerIndexRef = db.collection('pool_owners').doc(event.poolOwner)
          batch.set(
            ownerIndexRef,
            {
              address: event.poolOwner,
              poolIds: FieldValue.arrayUnion(event.poolId),
              lastPoolCreated: new Date(event.timestamp * 1000),
              totalPools: FieldValue.increment(1),
            },
            { merge: true }
          )

          // Add to search index (for future search functionality)
          const searchRef = db.collection('pool_search').doc(event.poolId)
          batch.set(searchRef, {
            poolId: event.poolId,
            name: event.name.toLowerCase(),
            owner: event.poolOwner.toLowerCase(),
            tags: ['lending', 'defi'],
            interestRate: event.interestRate,
            maxLoanAmount: parseFloat(ethers.formatEther(event.maxLoanAmount)),
            createdAt: new Date(event.timestamp * 1000),
            chainId,
          })

          processedCount++
          details.processed.push(event.poolId)

          logger.info(`${functionName}: Processed PoolCreated event`, {
            poolId: event.poolId,
            poolAddress: event.poolAddress,
            poolOwner: event.poolOwner,
            name: event.name,
            eventId,
          })
        } catch (error) {
          logger.error(`${functionName}: Error processing individual event`, {
            error: error instanceof Error ? error.message : String(error),
            poolId: event.poolId,
            transactionHash: event.transactionHash,
          })

          errorCount++
          details.errors.push(`${event.poolId}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }

      // Commit all changes
      if (processedCount > 0) {
        await batch.commit()

        logger.info(`${functionName}: Batch committed successfully`, {
          processedCount,
          skippedCount,
          errorCount,
        })
      }

      const response: ProcessPoolEventsResponse = {
        success: true,
        processedCount,
        skippedCount,
        errorCount,
        details,
        message: `Processed ${processedCount} events, skipped ${skippedCount}, errors ${errorCount}`,
      }

      logger.info(`${functionName}: Event processing completed`, response)
      return response
    } catch (error) {
      logger.error(`${functionName}: Failed to process events`, {
        error: error instanceof Error ? error.message : String(error),
        eventsCount: request.data.events.length,
        stack: error instanceof Error ? error.stack : undefined,
      })

      if (error instanceof HttpsError) {
        throw error
      }

      throw new HttpsError('internal', `Failed to process pool events: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

/**
 * Validate PoolCreated event data
 */
function validatePoolEvent(event: PoolCreatedEvent): string[] {
  const errors: string[] = []

  // Validate pool ID
  if (!event.poolId || isNaN(Number(event.poolId))) {
    errors.push('Invalid pool ID')
  }

  // Validate addresses
  if (!validateAddress(event.poolAddress)) {
    errors.push('Invalid pool address')
  }

  if (!validateAddress(event.poolOwner)) {
    errors.push('Invalid pool owner address')
  }

  // Validate name
  if (!event.name || event.name.trim().length === 0) {
    errors.push('Pool name is required')
  } else if (event.name.length > 100) {
    errors.push('Pool name too long (max 100 characters)')
  }

  // Validate max loan amount
  try {
    const amount = BigInt(event.maxLoanAmount)
    if (amount <= 0) {
      errors.push('Max loan amount must be greater than 0')
    }
    if (amount > BigInt('1000000000000000000000000')) {
      // 1M ETH
      errors.push('Max loan amount is too large')
    }
  } catch {
    errors.push('Invalid max loan amount format')
  }

  // Validate interest rate (basis points)
  if (event.interestRate < 0) {
    errors.push('Interest rate cannot be negative')
  } else if (event.interestRate > 10000) {
    errors.push('Interest rate cannot exceed 100% (10000 basis points)')
  }

  // Validate loan duration
  if (event.loanDuration < 3600) {
    errors.push('Loan duration must be at least 1 hour (3600 seconds)')
  } else if (event.loanDuration > 31536000) {
    errors.push('Loan duration cannot exceed 1 year (31536000 seconds)')
  }

  // Validate blockchain data
  if (!event.transactionHash || !event.transactionHash.match(/^0x[a-fA-F0-9]{64}$/)) {
    errors.push('Invalid transaction hash')
  }

  if (event.blockNumber <= 0) {
    errors.push('Invalid block number')
  }

  if (event.timestamp <= 0) {
    errors.push('Invalid timestamp')
  }

  return errors
}
