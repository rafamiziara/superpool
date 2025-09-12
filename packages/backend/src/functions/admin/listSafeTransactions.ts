import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import { getFirestore } from 'firebase-admin/firestore'
import { isSafeOwner } from '../../utils/multisig'
import { ethers } from 'ethers'
import { handleError } from '../../utils/errorHandling'

export interface ListSafeTransactionsRequest {
  page?: number
  limit?: number
  status?: 'pending_signatures' | 'ready_to_execute' | 'executed' | 'failed' | 'expired'
  type?: 'pool_creation' | 'admin_action'
  safeAddress?: string
  chainId?: number
}

export interface SafeTransactionInfo {
  transactionHash: string
  safeAddress: string
  type: string
  status: string
  requiredSignatures: number
  currentSignatures: number
  signatures: Array<{
    signer: string
    signedAt?: Date
  }>
  createdBy: string
  createdAt: Date
  expiresAt: Date
  executionTxHash?: string
  executedAt?: Date
  poolParams?: Record<string, unknown>
  readyToExecute: boolean
}

export interface ListSafeTransactionsResponse {
  success: boolean
  transactions: SafeTransactionInfo[]
  totalCount: number
  page: number
  limit: number
  hasNextPage: boolean
  hasPreviousPage: boolean
  userIsSafeOwner: boolean
}

/**
 * Cloud Function to list Safe multi-sig transactions
 *
 * @param request - The callable request with filtering options
 * @returns Paginated list of Safe transactions
 */
export const listSafeTransactions = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true,
    region: 'us-central1',
  },
  async (request: CallableRequest<ListSafeTransactionsRequest>): Promise<ListSafeTransactionsResponse> => {
    const functionName = 'listSafeTransactions'
    logger.info(`${functionName}: Listing Safe transactions`, {
      uid: request.auth?.uid,
      params: request.data,
    })

    try {
      // 1. Authentication check
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated to view transactions')
      }

      // 2. Parse and validate parameters
      const page = Math.max(1, request.data.page || 1)
      const limit = Math.min(50, Math.max(1, request.data.limit || 20))
      const status = request.data.status
      const type = request.data.type
      const chainId = request.data.chainId || 80002

      // 3. Get user's wallet address and check Safe ownership
      const userAddress = await getUserWalletAddress(request.auth.uid)
      let userIsSafeOwner = false

      if (userAddress) {
        try {
          const provider = new ethers.JsonRpcProvider(getProviderUrl(chainId))
          const safeAddress = request.data.safeAddress || getSafeAddress(chainId)
          userIsSafeOwner = await isSafeOwner(safeAddress, userAddress, provider)
        } catch (error) {
          logger.warn(`${functionName}: Error checking Safe ownership`, {
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      // 4. Build Firestore query
      const db = getFirestore()
      let queryRef = db.collection('safe_transactions')

      // Apply filters
      if (request.data.safeAddress) {
        queryRef = queryRef.where('safeAddress', '==', request.data.safeAddress)
      }

      if (chainId) {
        queryRef = queryRef.where('chainId', '==', chainId)
      }

      if (status) {
        queryRef = queryRef.where('status', '==', status)
      }

      if (type) {
        queryRef = queryRef.where('type', '==', type)
      }

      // 5. Get total count for pagination
      const totalSnapshot = await queryRef.count().get()
      const totalCount = totalSnapshot.data().count

      // 6. Apply pagination and ordering
      const offset = (page - 1) * limit
      const transactionsSnapshot = await queryRef.orderBy('createdAt', 'desc').offset(offset).limit(limit).get()

      // 7. Transform results
      const transactions: SafeTransactionInfo[] = transactionsSnapshot.docs.map((doc) => {
        const data = doc.data()
        const signatures = data.signatures || []

        return {
          transactionHash: data.transactionHash,
          safeAddress: data.safeAddress,
          type: data.type,
          status: data.status,
          requiredSignatures: data.requiredSignatures,
          currentSignatures: signatures.length,
          signatures: signatures.map((sig: { signer: string; signature: string; signedAt: Date }) => ({
            signer: sig.signer,
            signedAt: sig.signedAt?.toDate(),
          })),
          createdBy: data.createdBy,
          createdAt: data.createdAt?.toDate() || new Date(),
          expiresAt: data.expiresAt?.toDate() || new Date(),
          executionTxHash: data.executionTxHash,
          executedAt: data.executedAt?.toDate(),
          poolParams: data.poolParams,
          readyToExecute: signatures.length >= data.requiredSignatures && data.status === 'ready_to_execute',
        }
      })

      // 8. Calculate pagination metadata
      const hasNextPage = offset + transactions.length < totalCount
      const hasPreviousPage = page > 1

      logger.info(`${functionName}: Retrieved ${transactions.length} transactions`, {
        totalCount,
        page,
        limit,
        userIsSafeOwner,
      })

      return {
        success: true,
        transactions,
        totalCount,
        page,
        limit,
        hasNextPage,
        hasPreviousPage,
        userIsSafeOwner,
      }
    } catch (error) {
      logger.error(`${functionName}: Error listing Safe transactions`, {
        error: error instanceof Error ? error.message : String(error),
        uid: request.auth?.uid,
      })

      return handleError(error, functionName)
    }
  }
)

/**
 * Get RPC provider URL based on chain ID
 */
function getProviderUrl(chainId: number): string {
  const envKey = chainId === 80002 ? 'POLYGON_AMOY_RPC_URL' : 'POLYGON_MAINNET_RPC_URL'
  const url = process.env[envKey]

  if (!url) {
    throw new Error(`RPC URL not configured for chain ID ${chainId}`)
  }

  return url
}

/**
 * Get Safe address based on chain ID
 */
function getSafeAddress(chainId: number): string {
  const envKey = chainId === 80002 ? 'SAFE_ADDRESS_AMOY' : 'SAFE_ADDRESS_POLYGON'
  const address = process.env[envKey]

  if (!address) {
    throw new Error(`Safe address not configured for chain ID ${chainId}`)
  }

  return address
}

/**
 * Get user's wallet address from Firestore
 */
async function getUserWalletAddress(uid: string): Promise<string | null> {
  try {
    const db = getFirestore()
    const userDoc = await db.collection('users').doc(uid).get()

    if (userDoc.exists) {
      const userData = userDoc.data()
      return userData?.walletAddress || null
    }

    return null
  } catch (error) {
    logger.error('Error getting user wallet address', {
      uid,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
