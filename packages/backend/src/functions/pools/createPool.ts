import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import { ethers } from 'ethers'
import { getFirestore } from 'firebase-admin/firestore'
import { PoolFactoryABI } from '../../constants/abis'
import { validatePoolCreationParams, sanitizePoolParams } from '../../utils/validation'
import { estimateGas, executeTransaction } from '../../utils/blockchain'
import { handleError, AppError } from '../../utils/errorHandling'

export interface CreatePoolRequest {
  poolOwner: string
  maxLoanAmount: string // In wei
  interestRate: number // Basis points (e.g., 500 = 5%)
  loanDuration: number // In seconds
  name: string
  description: string
  chainId?: number // Optional, defaults to Polygon Amoy
}

export interface CreatePoolResponse {
  success: boolean
  transactionHash: string
  poolId?: number
  poolAddress?: string
  estimatedGas?: string
  message: string
}

/**
 * Cloud Function to create a new lending pool via PoolFactory
 *
 * @param request - The callable request with pool creation parameters
 * @returns Transaction hash and pool creation details
 */
export const createPool = onCall(
  {
    // Configuration for the function
    memory: '1GiB',
    timeoutSeconds: 540, // 9 minutes
    cors: true,
    region: 'us-central1',
  },
  async (request: CallableRequest<CreatePoolRequest>): Promise<CreatePoolResponse> => {
    const functionName = 'createPool'
    logger.info(`${functionName}: Starting pool creation request`, {
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
      const wallet = new ethers.Wallet(getPrivateKey(), provider)

      // 5. Get contract instance
      const poolFactoryAddress = getPoolFactoryAddress(chainId)
      const poolFactory = new ethers.Contract(poolFactoryAddress, PoolFactoryABI, wallet)

      // 6. Prepare transaction parameters
      const poolParams = {
        poolOwner: sanitizedParams.poolOwner,
        maxLoanAmount: sanitizedParams.maxLoanAmount,
        interestRate: sanitizedParams.interestRate,
        loanDuration: sanitizedParams.loanDuration,
        name: sanitizedParams.name,
        description: sanitizedParams.description,
      }

      // 7. Estimate gas
      const gasEstimate = await estimateGas(poolFactory, 'createPool', [poolParams])
      logger.info(`${functionName}: Gas estimated`, { gasEstimate: gasEstimate.toString() })

      // 8. Execute transaction
      const tx = await executeTransaction(poolFactory, 'createPool', [poolParams], {
        gasLimit: gasEstimate,
        gasPrice: await provider.getFeeData().then((fees) => fees.gasPrice || undefined),
      })

      logger.info(`${functionName}: Transaction submitted`, {
        txHash: tx.hash,
        poolOwner: sanitizedParams.poolOwner,
      })

      // 9. Store transaction in Firestore for tracking
      const db = getFirestore()
      await db.collection('pool_creation_transactions').doc(tx.hash).set({
        transactionHash: tx.hash,
        createdBy: request.auth.uid,
        poolParams: sanitizedParams,
        chainId,
        status: 'pending',
        createdAt: new Date(),
        gasEstimate: gasEstimate.toString(),
      })

      // 10. Wait for confirmation and extract pool details
      const receipt = await tx.wait()
      if (!receipt) {
        throw new AppError('Transaction failed - no receipt received', 'TRANSACTION_FAILED')
      }

      // 11. Parse events to get pool details
      const poolCreatedEvent = receipt.logs
        .map((log) => {
          try {
            return poolFactory.interface.parseLog(log)
          } catch {
            return null
          }
        })
        .find((event) => event && event.name === 'PoolCreated')

      if (!poolCreatedEvent) {
        throw new AppError('Pool creation event not found in transaction receipt', 'EVENT_NOT_FOUND')
      }

      const poolId = Number(poolCreatedEvent.args.poolId)
      const poolAddress = poolCreatedEvent.args.poolAddress

      // 12. Update Firestore with success details
      await db.collection('pool_creation_transactions').doc(tx.hash).update({
        status: 'completed',
        poolId,
        poolAddress,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        completedAt: new Date(),
      })

      // 13. Store pool information in pools collection
      await db.collection('pools').doc(poolId.toString()).set({
        poolId,
        poolAddress,
        poolOwner: sanitizedParams.poolOwner,
        name: sanitizedParams.name,
        description: sanitizedParams.description,
        maxLoanAmount: sanitizedParams.maxLoanAmount,
        interestRate: sanitizedParams.interestRate,
        loanDuration: sanitizedParams.loanDuration,
        chainId,
        createdBy: request.auth.uid,
        createdAt: new Date(),
        transactionHash: tx.hash,
        isActive: true,
      })

      logger.info(`${functionName}: Pool created successfully`, {
        poolId,
        poolAddress,
        transactionHash: tx.hash,
      })

      return {
        success: true,
        transactionHash: tx.hash,
        poolId,
        poolAddress,
        estimatedGas: gasEstimate.toString(),
        message: `Pool "${sanitizedParams.name}" created successfully with ID ${poolId}`,
      }
    } catch (error) {
      logger.error(`${functionName}: Error creating pool`, {
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
 * Get private key for transaction signing
 */
function getPrivateKey(): string {
  const privateKey = process.env.PRIVATE_KEY

  if (!privateKey) {
    throw new AppError('Private key not configured', 'PRIVATE_KEY_NOT_CONFIGURED')
  }

  return privateKey
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
