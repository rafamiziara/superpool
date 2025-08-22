import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import { ethers } from 'ethers'
import { getFirestore } from 'firebase-admin/firestore'
import { handleError, AppError } from '../../utils/errorHandling'

export interface PoolStatusRequest {
  transactionHash: string
  chainId?: number
}

export interface PoolStatusResponse {
  transactionHash: string
  status: 'pending' | 'completed' | 'failed' | 'not_found'
  poolId?: number
  poolAddress?: string
  blockNumber?: number
  gasUsed?: string
  error?: string
  createdAt?: Date
  completedAt?: Date
}

/**
 * Cloud Function to check the status of a pool creation transaction
 * 
 * @param request - The callable request with transaction hash
 * @returns Transaction status and pool details if completed
 */
export const poolStatus = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 60,
    cors: true,
    region: 'us-central1',
  },
  async (request: CallableRequest<PoolStatusRequest>): Promise<PoolStatusResponse> => {
    const functionName = 'poolStatus'
    logger.info(`${functionName}: Checking pool creation status`, {
      transactionHash: request.data.transactionHash
    })

    try {
      // 1. Validate input
      if (!request.data.transactionHash) {
        throw new HttpsError('invalid-argument', 'Transaction hash is required')
      }

      const txHash = request.data.transactionHash.toLowerCase()

      // 2. Check Firestore for cached status
      const db = getFirestore()
      const txDoc = await db.collection('pool_creation_transactions').doc(txHash).get()

      if (!txDoc.exists) {
        logger.warn(`${functionName}: Transaction not found in database`, { txHash })
        return {
          transactionHash: txHash,
          status: 'not_found'
        }
      }

      const txData = txDoc.data()!

      // 3. If already completed, return cached data
      if (txData.status === 'completed') {
        return {
          transactionHash: txHash,
          status: 'completed',
          poolId: txData.poolId,
          poolAddress: txData.poolAddress,
          blockNumber: txData.blockNumber,
          gasUsed: txData.gasUsed,
          createdAt: txData.createdAt?.toDate(),
          completedAt: txData.completedAt?.toDate()
        }
      }

      // 4. If failed, return error info
      if (txData.status === 'failed') {
        return {
          transactionHash: txHash,
          status: 'failed',
          error: txData.error,
          createdAt: txData.createdAt?.toDate()
        }
      }

      // 5. If pending, check blockchain status
      const chainId = txData.chainId || 80002
      const provider = new ethers.JsonRpcProvider(getProviderUrl(chainId))
      
      try {
        const receipt = await provider.getTransactionReceipt(txHash)
        
        if (!receipt) {
          // Transaction still pending
          return {
            transactionHash: txHash,
            status: 'pending',
            createdAt: txData.createdAt?.toDate()
          }
        }

        // 6. Transaction is confirmed, update status
        if (receipt.status === 0) {
          // Transaction failed
          await db.collection('pool_creation_transactions').doc(txHash).update({
            status: 'failed',
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed.toString(),
            error: 'Transaction reverted',
            completedAt: new Date()
          })

          return {
            transactionHash: txHash,
            status: 'failed',
            error: 'Transaction reverted',
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed.toString(),
            createdAt: txData.createdAt?.toDate(),
            completedAt: new Date()
          }
        }

        // 7. Transaction succeeded, parse events for pool info
        const poolFactory = new ethers.Contract(
          getPoolFactoryAddress(chainId),
          // Minimal ABI for event parsing
          ['event PoolCreated(uint256 indexed poolId, address indexed poolAddress, address indexed poolOwner, string name, uint256 maxLoanAmount, uint256 interestRate, uint256 loanDuration)'],
          provider
        )

        const poolCreatedEvent = receipt.logs
          .map(log => {
            try {
              return poolFactory.interface.parseLog(log)
            } catch {
              return null
            }
          })
          .find(event => event && event.name === 'PoolCreated')

        if (!poolCreatedEvent) {
          throw new AppError('Pool creation event not found in receipt', 'EVENT_NOT_FOUND')
        }

        const poolId = Number(poolCreatedEvent.args.poolId)
        const poolAddress = poolCreatedEvent.args.poolAddress

        // 8. Update Firestore with completion details
        await db.collection('pool_creation_transactions').doc(txHash).update({
          status: 'completed',
          poolId,
          poolAddress,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString(),
          completedAt: new Date()
        })

        // 9. Also create/update pool document if not exists
        const poolDoc = await db.collection('pools').doc(poolId.toString()).get()
        if (!poolDoc.exists) {
          await db.collection('pools').doc(poolId.toString()).set({
            poolId,
            poolAddress,
            poolOwner: txData.poolParams.poolOwner,
            name: txData.poolParams.name,
            description: txData.poolParams.description,
            maxLoanAmount: txData.poolParams.maxLoanAmount,
            interestRate: txData.poolParams.interestRate,
            loanDuration: txData.poolParams.loanDuration,
            chainId,
            createdBy: txData.createdBy,
            createdAt: txData.createdAt,
            transactionHash: txHash,
            isActive: true
          })
        }

        logger.info(`${functionName}: Pool creation confirmed`, {
          txHash,
          poolId,
          poolAddress
        })

        return {
          transactionHash: txHash,
          status: 'completed',
          poolId,
          poolAddress,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString(),
          createdAt: txData.createdAt?.toDate(),
          completedAt: new Date()
        }

      } catch (providerError) {
        logger.error(`${functionName}: Provider error`, {
          error: providerError instanceof Error ? providerError.message : String(providerError),
          txHash
        })

        // Return pending status if we can't check the blockchain
        return {
          transactionHash: txHash,
          status: 'pending',
          createdAt: txData.createdAt?.toDate()
        }
      }

    } catch (error) {
      logger.error(`${functionName}: Error checking pool status`, {
        error: error instanceof Error ? error.message : String(error),
        transactionHash: request.data.transactionHash
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