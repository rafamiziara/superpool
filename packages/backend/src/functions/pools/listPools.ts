import { ListPoolsRequest, ListPoolsResponse } from '@superpool/types'
import { logger } from 'firebase-functions/v2'
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { firestore } from '../../services'

export const listPoolsHandler = async (request: CallableRequest<ListPoolsRequest>): Promise<ListPoolsResponse> => {
  logger.info('Listing pools', {
    params: request.data,
  })

  try {
    // 1. Parse and validate parameters
    const page = Math.max(1, request.data.page || 1)
    const limit = Math.min(100, Math.max(1, request.data.limit || 20)) // Max 100 pools per page
    const ownerAddress = request.data.ownerAddress?.toLowerCase()
    const chainId = request.data.chainId || 80002 // Default to Polygon Amoy
    const activeOnly = request.data.activeOnly !== false // Default to true

    // 2. Build Firestore query
    let query = firestore.collection('pools').where('chainId', '==', chainId)

    // Add owner filter if specified
    if (ownerAddress) {
      query = query.where('poolOwner', '==', ownerAddress)
    }

    // Add active filter if specified
    if (activeOnly) {
      query = query.where('isActive', '==', true)
    }

    // 3. Get total count for pagination
    const totalSnapshot = await query.count().get()
    const totalCount = totalSnapshot.data().count

    // 4. Apply pagination
    const offset = (page - 1) * limit
    const poolsSnapshot = await query.orderBy('createdAt', 'desc').offset(offset).limit(limit).get()

    // 5. Transform results
    const pools = poolsSnapshot.docs.map((doc) => {
      const data = doc.data()
      return {
        poolId: data.poolId,
        poolAddress: data.poolAddress,
        poolOwner: data.poolOwner,
        name: data.name,
        description: data.description,
        maxLoanAmount: data.maxLoanAmount,
        interestRate: data.interestRate,
        loanDuration: data.loanDuration,
        chainId: data.chainId,
        createdBy: data.createdBy,
        createdAt: data.createdAt?.toDate() || new Date(),
        transactionHash: data.transactionHash,
        isActive: data.isActive,
      }
    })

    // 6. Calculate pagination metadata
    const hasNextPage = offset + pools.length < totalCount
    const hasPreviousPage = page > 1

    logger.info(`Retrieved ${pools.length} pools`, {
      totalCount,
      page,
      limit,
    })

    return {
      pools,
      totalCount,
      page,
      limit,
      hasNextPage,
      hasPreviousPage,
    }
  } catch (error) {
    logger.error('Error listing pools', {
      error: error instanceof Error ? error.message : String(error),
      params: request.data,
    })

    throw new HttpsError('internal', 'Failed to list pools. Please try again.')
  }
}

/**
 * Cloud Function to list pools with pagination and filtering
 *
 * @param {CallableRequest<ListPoolsRequest>} request The callable request with filtering options
 * @returns {Promise<ListPoolsResponse>} Paginated list of pools
 * @throws {HttpsError} If the listing fails
 */
export const listPools = onCall<ListPoolsRequest>(
  {
    memory: '256MiB',
    timeoutSeconds: 60,
    cors: true,
  },
  listPoolsHandler
)
