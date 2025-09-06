import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import { createContractService } from '../../services/ContractService'
import { handleError } from '../../utils/errorHandling'

export interface ExecuteTransactionRequest {
  transactionId: string
  chainId?: number
}

export interface ExecuteTransactionResponse {
  success: boolean
  transactionId: string
  executionTxHash: string
  blockNumber?: number
  gasUsed?: string
  events?: any[]
  message: string
}

/**
 * Cloud Function to execute a Safe transaction once enough signatures are collected
 *
 * @param request - The callable request with transaction ID
 * @returns Execution result details
 */
export const executeTransaction = onCall(
  {
    memory: '1GiB',
    timeoutSeconds: 300, // 5 minutes for execution
    cors: true,
    region: 'us-central1',
  },
  async (request: CallableRequest<ExecuteTransactionRequest>): Promise<ExecuteTransactionResponse> => {
    const functionName = 'executeTransaction'
    logger.info(`${functionName}: Executing Safe transaction`, {
      uid: request.auth?.uid,
      transactionId: request.data.transactionId,
    })

    try {
      // 1. Authentication check (for admin operations)
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated to execute transactions')
      }

      // 2. Validate input parameters
      if (!request.data.transactionId) {
        throw new HttpsError('invalid-argument', 'Transaction ID is required')
      }

      // Validate transaction hash format
      if (!/^0x[a-fA-F0-9]{64}$/.test(request.data.transactionId)) {
        throw new HttpsError('invalid-argument', 'Invalid transaction ID format')
      }

      const chainId = request.data.chainId || 80002 // Default to Polygon Amoy

      // 3. Initialize ContractService
      const contractService = createContractService(chainId)

      // 4. Check transaction status before execution
      const transactionStatus = await contractService.getTransactionStatus(request.data.transactionId)

      if (!transactionStatus) {
        throw new HttpsError('not-found', 'Transaction not found')
      }

      if (transactionStatus.status !== 'ready_to_execute') {
        if (transactionStatus.status === 'completed') {
          throw new HttpsError('already-exists', 'Transaction has already been executed')
        } else if (transactionStatus.status === 'failed') {
          throw new HttpsError('failed-precondition', 'Transaction has failed and cannot be executed')
        } else if (transactionStatus.status === 'expired') {
          throw new HttpsError('deadline-exceeded', 'Transaction has expired')
        } else {
          throw new HttpsError(
            'failed-precondition',
            `Transaction is not ready for execution. Status: ${transactionStatus.status}. ` +
              `Signatures: ${transactionStatus.currentSignatures}/${transactionStatus.requiredSignatures}`
          )
        }
      }

      // 5. Execute the transaction
      logger.info(`${functionName}: Executing transaction with sufficient signatures`, {
        transactionId: request.data.transactionId,
        currentSignatures: transactionStatus.currentSignatures,
        requiredSignatures: transactionStatus.requiredSignatures,
        description: transactionStatus.description,
      })

      const executionResult = await contractService.executeTransaction(request.data.transactionId)

      if (!executionResult.success) {
        throw new HttpsError('internal', `Transaction execution failed: ${executionResult.error || 'Unknown error'}`)
      }

      logger.info(`${functionName}: Transaction executed successfully`, {
        transactionId: request.data.transactionId,
        executionTxHash: executionResult.transactionHash,
        blockNumber: executionResult.blockNumber,
        gasUsed: executionResult.gasUsed,
        eventsCount: executionResult.events?.length || 0,
      })

      return {
        success: true,
        transactionId: request.data.transactionId,
        executionTxHash: executionResult.transactionHash,
        blockNumber: executionResult.blockNumber,
        gasUsed: executionResult.gasUsed,
        events: executionResult.events,
        message: `Transaction executed successfully. Execution hash: ${executionResult.transactionHash}`,
      }
    } catch (error) {
      logger.error(`${functionName}: Error executing transaction`, {
        error: error instanceof Error ? error.message : String(error),
        uid: request.auth?.uid,
        transactionId: request.data.transactionId,
      })

      return handleError(error, functionName)
    }
  }
)
