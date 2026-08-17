import { ListPoolsRequest, ListPoolsResponse } from '@superpool/types'
import { ZeroAddress } from 'ethers'
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
        // ISO string, not a Date: the callable encoder turns a Date into `{}`.
        createdAt: (data.createdAt?.toDate() || new Date()).toISOString(),
        transactionHash: data.transactionHash,
        isActive: data.isActive,
        // A pool indexed before pools had a denomination has no field here, and
        // native is exactly what it is — nothing could create a token pool
        // before the field existed. The zero address is the same answer a new
        // native pool stores, so the client never has to know which era a
        // document came from.
        loanToken: data.loanToken ?? ZeroAddress,
        // Left off rather than defaulted. Absent beside a non-zero `loanToken`
        // means the backend could not read the token, and the client must show
        // the pool as unsupported instead of formatting it with a guess — 18
        // decimals against a 6-decimal token is out by a factor of a trillion.
        ...(data.tokenSymbol == null ? {} : { tokenSymbol: data.tokenSymbol }),
        ...(data.tokenDecimals == null ? {} : { tokenDecimals: data.tokenDecimals }),
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
