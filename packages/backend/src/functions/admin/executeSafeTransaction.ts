import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import { ethers } from 'ethers'
import { getFirestore } from 'firebase-admin/firestore'
import { executeSafeTransaction as executeSafeTransactionUtil, SafeTransaction, SafeSignature, getSafeContract } from '../../utils/multisig'
import { handleError, AppError } from '../../utils/errorHandling'

export interface ExecuteSafeTransactionRequest {
  transactionHash: string
  chainId?: number
}

export interface ExecuteSafeTransactionResponse {
  success: boolean
  transactionHash: string
  executionTxHash: string
  safeAddress: string
  poolId?: number
  poolAddress?: string
  message: string
}

/**
 * Cloud Function to execute a Safe multi-sig transaction
 * Only executes if enough signatures have been collected
 * 
 * @param request - The callable request with transaction hash
 * @returns Execution result
 */
export const executeSafeTransaction = onCall(
  {
    memory: '1GiB',
    timeoutSeconds: 300, // 5 minutes
    cors: true,
    region: 'us-central1',
  },
  async (request: CallableRequest<ExecuteSafeTransactionRequest>): Promise<ExecuteSafeTransactionResponse> => {
    const functionName = 'executeSafeTransaction'
    logger.info(`${functionName}: Processing execution request`, {
      uid: request.auth?.uid,
      transactionHash: request.data.transactionHash
    })

    try {
      // 1. Authentication check (for admin operations)
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated to execute transactions')
      }

      // 2. Validate transaction hash
      if (!request.data.transactionHash || !/^0x[a-fA-F0-9]{64}$/.test(request.data.transactionHash)) {
        throw new HttpsError('invalid-argument', 'Invalid transaction hash format')
      }

      const { transactionHash } = request.data
      const chainId = request.data.chainId || 80002

      // 3. Get transaction from Firestore
      const db = getFirestore()
      const txDoc = await db.collection('safe_transactions').doc(transactionHash).get()

      if (!txDoc.exists) {
        throw new HttpsError('not-found', 'Transaction not found')
      }

      const txData = txDoc.data()!

      // 4. Check transaction status and signature requirements
      if (txData.status !== 'ready_to_execute') {
        if (txData.status === 'executed') {
          throw new HttpsError('already-exists', 'Transaction has already been executed')
        } else if (txData.status === 'expired') {
          throw new HttpsError('deadline-exceeded', 'Transaction has expired')
        } else {
          throw new HttpsError('failed-precondition', `Transaction is not ready to execute. Status: ${txData.status}`)
        }
      }

      // 5. Verify we have enough signatures
      const signatures = txData.signatures || []
      if (signatures.length < txData.requiredSignatures) {
        throw new HttpsError('failed-precondition', 
          `Insufficient signatures: ${signatures.length}/${txData.requiredSignatures}`)
      }

      // 6. Initialize blockchain connection and signer
      const provider = new ethers.JsonRpcProvider(getProviderUrl(chainId))
      const signer = new ethers.Wallet(getPrivateKey(), provider)

      logger.info(`${functionName}: Executing Safe transaction`, {
        transactionHash,
        safeAddress: txData.safeAddress,
        signatureCount: signatures.length,
        requiredSignatures: txData.requiredSignatures
      })

      // 7. Execute Safe transaction
      const executionTx = await executeSafeTransactionUtil(
        txData.safeAddress,
        txData.safeTransaction as SafeTransaction,
        signatures as SafeSignature[],
        signer
      )

      // 8. Wait for execution confirmation
      const receipt = await executionTx.wait()
      if (!receipt) {
        throw new AppError('Safe transaction execution failed - no receipt received', 'EXECUTION_FAILED')
      }

      if (receipt.status === 0) {
        throw new AppError('Safe transaction execution failed', 'EXECUTION_FAILED')
      }

      logger.info(`${functionName}: Safe transaction executed successfully`, {
        transactionHash,
        executionTxHash: executionTx.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString()
      })

      // 9. Parse results for pool creation transactions
      let poolId: number | undefined
      let poolAddress: string | undefined

      if (txData.type === 'pool_creation') {
        try {
          // Parse PoolCreated event from the execution transaction
          const poolFactoryInterface = new ethers.Interface([
            'event PoolCreated(uint256 indexed poolId, address indexed poolAddress, address indexed poolOwner, string name, uint256 maxLoanAmount, uint256 interestRate, uint256 loanDuration)'
          ])

          const poolCreatedLog = receipt.logs.find(log => {
            try {
              const parsed = poolFactoryInterface.parseLog(log)
              return parsed && parsed.name === 'PoolCreated'
            } catch {
              return false
            }
          })

          if (poolCreatedLog) {
            const parsedEvent = poolFactoryInterface.parseLog(poolCreatedLog)!
            poolId = Number(parsedEvent.args.poolId)
            poolAddress = parsedEvent.args.poolAddress

            // Store pool information in pools collection
            await db.collection('pools').doc(poolId.toString()).set({
              poolId,
              poolAddress,
              poolOwner: txData.poolParams.poolOwner,
              name: txData.poolParams.name,
              description: txData.poolParams.description,
              maxLoanAmount: txData.poolParams.maxLoanAmount,
              interestRate: txData.poolParams.interestRate,
              loanDuration: txData.poolParams.loanDuration,
              chainId: txData.chainId,
              createdBy: txData.createdBy,
              createdAt: new Date(),
              transactionHash: executionTx.hash,
              safeTransactionHash: transactionHash,
              isActive: true,
              createdViaSafe: true
            })

            logger.info(`${functionName}: Pool created via Safe`, {
              poolId,
              poolAddress,
              poolName: txData.poolParams.name
            })
          }
        } catch (error) {
          logger.error(`${functionName}: Error parsing pool creation event`, {
            error: error instanceof Error ? error.message : String(error),
            executionTxHash: executionTx.hash
          })
          // Don't throw - execution was successful even if we can't parse the event
        }
      }

      // 10. Update Firestore with execution results
      await db.collection('safe_transactions').doc(transactionHash).update({
        status: 'executed',
        executionTxHash: executionTx.hash,
        executedAt: new Date(),
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        poolId,
        poolAddress
      })

      const message = poolId && poolAddress 
        ? `Pool "${txData.poolParams.name}" created successfully with ID ${poolId}`
        : 'Safe transaction executed successfully'

      return {
        success: true,
        transactionHash,
        executionTxHash: executionTx.hash,
        safeAddress: txData.safeAddress,
        poolId,
        poolAddress,
        message
      }

    } catch (error) {
      logger.error(`${functionName}: Error executing Safe transaction`, {
        error: error instanceof Error ? error.message : String(error),
        uid: request.auth?.uid,
        transactionHash: request.data.transactionHash
      })

      // Update transaction status to failed if it exists
      try {
        const db = getFirestore()
        await db.collection('safe_transactions').doc(request.data.transactionHash).update({
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          failedAt: new Date()
        })
      } catch (updateError) {
        logger.error(`${functionName}: Error updating transaction status`, { updateError })
      }

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
 * Get private key for transaction execution
 */
function getPrivateKey(): string {
  const privateKey = process.env.PRIVATE_KEY
  
  if (!privateKey) {
    throw new AppError('Private key not configured', 'PRIVATE_KEY_NOT_CONFIGURED')
  }
  
  return privateKey
}