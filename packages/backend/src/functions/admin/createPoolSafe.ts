import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import { ethers } from 'ethers'
import { getFirestore } from 'firebase-admin/firestore'
import { sanitizePoolParams, validatePoolCreationParams } from '../../utils/validation'
import {
  createSafeTransactionHash,
  getSafeOwners,
  getSafeThreshold,
  isSafeOwner,
  prepareSafePoolCreationTransaction,
  SafeTransaction,
} from '../../utils/multisig'
import { AppError, handleError } from '../../utils/errorHandling'

export interface CreatePoolSafeRequest {
  poolOwner: string
  maxLoanAmount: string // In wei
  interestRate: number // Basis points (e.g., 500 = 5%)
  loanDuration: number // In seconds
  name: string
  description: string
  chainId?: number // Optional, defaults to Polygon Amoy
}

export interface CreatePoolSafeResponse {
  success: boolean
  transactionHash: string
  safeAddress: string
  requiredSignatures: number
  currentSignatures: number
  message: string
  poolParams?: any
}

/**
 * Cloud Function to create a Safe multi-sig transaction for pool creation
 * This prepares the transaction but doesn't execute it - requires signatures
 *
 * @param request - The callable request with pool creation parameters
 * @returns Safe transaction details for signature collection
 */
export const createPoolSafe = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true,
    region: 'us-central1',
  },
  async (request: CallableRequest<CreatePoolSafeRequest>): Promise<CreatePoolSafeResponse> => {
    const functionName = 'createPoolSafe'
    logger.info(`${functionName}: Starting Safe pool creation request`, {
      uid: request.auth?.uid,
      data: { ...request.data, maxLoanAmount: '***', poolOwner: '***' },
    })

    try {
      // 1. Authentication check
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated to create pools')
      }

      // 2. Validate input parameters
      const validationResult = validatePoolCreationParams(request.data)
      if (!validationResult.isValid) {
        throw new HttpsError('invalid-argument', `Validation failed: ${validationResult.errors.join(', ')}`)
      }

      // 3. Sanitize parameters
      const sanitizedParams = sanitizePoolParams(request.data)
      logger.info(`${functionName}: Parameters validated and sanitized`)

      // 4. Initialize blockchain connection
      const chainId = sanitizedParams.chainId || 80002 // Polygon Amoy
      const provider = new ethers.JsonRpcProvider(getProviderUrl(chainId))

      // 5. Get Safe and contract addresses
      const safeAddress = getSafeAddress(chainId)
      const poolFactoryAddress = getPoolFactoryAddress(chainId)

      // 6. Verify Safe configuration
      const [owners, threshold] = await Promise.all([getSafeOwners(safeAddress, provider), getSafeThreshold(safeAddress, provider)])

      logger.info(`${functionName}: Safe configuration verified`, {
        safeAddress,
        ownersCount: owners.length,
        threshold,
      })

      // 7. Check if user is a Safe owner (optional - for enhanced security)
      const userAddress = await getUserWalletAddress(request.auth.uid)
      if (userAddress && !(await isSafeOwner(safeAddress, userAddress, provider))) {
        logger.warn(`${functionName}: Non-owner attempting to create pool`, {
          uid: request.auth.uid,
          userAddress,
          safeAddress,
        })
        // Note: We don't throw an error here as pool creation might be initiated by admins
      }

      // 8. Prepare Safe transaction
      const safeTransaction = await prepareSafePoolCreationTransaction(
        poolFactoryAddress,
        {
          poolOwner: sanitizedParams.poolOwner,
          maxLoanAmount: sanitizedParams.maxLoanAmount,
          interestRate: sanitizedParams.interestRate,
          loanDuration: sanitizedParams.loanDuration,
          name: sanitizedParams.name,
          description: sanitizedParams.description,
        },
        safeAddress,
        provider
      )

      // 9. Create transaction hash
      const transactionHash = await createSafeTransactionHash(safeAddress, safeTransaction, provider)

      // 10. Store transaction in Firestore for signature collection
      const db = getFirestore()
      await db
        .collection('safe_transactions')
        .doc(transactionHash)
        .set({
          transactionHash,
          safeAddress,
          safeTransaction,
          poolParams: sanitizedParams,
          chainId,
          status: 'pending_signatures',
          requiredSignatures: threshold,
          currentSignatures: 0,
          signatures: [],
          createdBy: request.auth.uid,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          type: 'pool_creation',
        })

      logger.info(`${functionName}: Safe transaction prepared`, {
        transactionHash,
        safeAddress,
        requiredSignatures: threshold,
        poolName: sanitizedParams.name,
      })

      return {
        success: true,
        transactionHash,
        safeAddress,
        requiredSignatures: threshold,
        currentSignatures: 0,
        message: `Pool creation transaction prepared. Requires ${threshold} signature(s) to execute.`,
        poolParams: sanitizedParams,
      }
    } catch (error) {
      logger.error(`${functionName}: Error creating Safe pool transaction`, {
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
    throw new AppError(`RPC URL not configured for chain ID ${chainId}`, 'PROVIDER_NOT_CONFIGURED')
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
    throw new AppError(`Safe address not configured for chain ID ${chainId}`, 'SAFE_ADDRESS_NOT_CONFIGURED')
  }

  return address
}

/**
 * Get PoolFactory contract address based on chain ID
 */
function getPoolFactoryAddress(chainId: number): string {
  const envKey = chainId === 80002 ? 'POOL_FACTORY_ADDRESS_AMOY' : 'POOL_FACTORY_ADDRESS_POLYGON'
  const address = process.env[envKey]

  if (!address) {
    throw new AppError(`PoolFactory address not configured for chain ID ${chainId}`, 'CONTRACT_ADDRESS_NOT_CONFIGURED')
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
