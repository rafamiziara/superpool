import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import { createContractService, TransactionStatus } from '../../services/ContractService'
import { handleError } from '../../utils/errorHandling'

export interface GetTransactionStatusRequest {
  transactionId: string
  chainId?: number
}

export interface GetTransactionStatusResponse {
  success: boolean
  transactionId: string
  status: string
  currentSignatures: number
  requiredSignatures: number
  readyToExecute: boolean
  description: string
  createdAt: string
  updatedAt: string
  executedAt?: string
  executionResult?: any
  signatures: Array<{
    signer: string
    timestamp?: string
  }>
  metadata?: any
  message: string
}

/**
 * Cloud Function to get the status of a Safe transaction
 *
 * @param request - The callable request with transaction ID
 * @returns Detailed transaction status information
 */
export const getTransactionStatus = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 30,
    cors: true,
    region: 'us-central1',
  },
  async (request: CallableRequest<GetTransactionStatusRequest>): Promise<GetTransactionStatusResponse> => {
    const functionName = 'getTransactionStatus'
    logger.info(`${functionName}: Getting transaction status`, {
      uid: request.auth?.uid,
      transactionId: request.data.transactionId,
    })

    try {
      // 1. Validate input parameters
      if (!request.data.transactionId) {
        throw new HttpsError('invalid-argument', 'Transaction ID is required')
      }

      // Validate transaction hash format
      if (!/^0x[a-fA-F0-9]{64}$/.test(request.data.transactionId)) {
        throw new HttpsError('invalid-argument', 'Invalid transaction ID format')
      }

      const chainId = request.data.chainId || 80002 // Default to Polygon Amoy

      // 2. Initialize ContractService
      const contractService = createContractService(chainId)

      // 3. Get transaction status
      const transactionStatus = await contractService.getTransactionStatus(request.data.transactionId)

      if (!transactionStatus) {
        throw new HttpsError('not-found', 'Transaction not found')
      }

      // 4. Format response
      const readyToExecute =
        transactionStatus.currentSignatures >= transactionStatus.requiredSignatures && transactionStatus.status === 'ready_to_execute'

      const signatures = transactionStatus.signatures.map((sig) => ({
        signer: sig.signer,
        timestamp: new Date().toISOString(), // In real implementation, you'd track signature timestamps
      }))

      let statusMessage = ''
      switch (transactionStatus.status) {
        case 'pending_signatures':
          const needed = transactionStatus.requiredSignatures - transactionStatus.currentSignatures
          statusMessage = `Waiting for ${needed} more signature(s)`
          break
        case 'ready_to_execute':
          statusMessage = 'Transaction has enough signatures and is ready to execute'
          break
        case 'executing':
          statusMessage = 'Transaction is currently being executed'
          break
        case 'completed':
          statusMessage = 'Transaction has been successfully executed'
          break
        case 'failed':
          statusMessage = 'Transaction execution failed'
          break
        case 'expired':
          statusMessage = 'Transaction has expired and cannot be executed'
          break
        default:
          statusMessage = `Transaction status: ${transactionStatus.status}`
      }

      logger.info(`${functionName}: Transaction status retrieved`, {
        transactionId: request.data.transactionId,
        status: transactionStatus.status,
        currentSignatures: transactionStatus.currentSignatures,
        requiredSignatures: transactionStatus.requiredSignatures,
      })

      return {
        success: true,
        transactionId: request.data.transactionId,
        status: transactionStatus.status,
        currentSignatures: transactionStatus.currentSignatures,
        requiredSignatures: transactionStatus.requiredSignatures,
        readyToExecute,
        description: transactionStatus.description,
        createdAt: transactionStatus.createdAt.toISOString(),
        updatedAt: transactionStatus.updatedAt.toISOString(),
        executedAt: transactionStatus.executedAt?.toISOString(),
        executionResult: transactionStatus.executionResult,
        signatures,
        metadata: transactionStatus.metadata,
        message: statusMessage,
      }
    } catch (error) {
      logger.error(`${functionName}: Error getting transaction status`, {
        error: error instanceof Error ? error.message : String(error),
        uid: request.auth?.uid,
        transactionId: request.data.transactionId,
      })

      return handleError(error, functionName)
    }
  }
)
