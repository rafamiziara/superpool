import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import { createContractService, BatchTransactionRequest, TransactionProposal } from '../../services/ContractService'
import { handleError } from '../../utils/errorHandling'

export interface ProposeBatchRequest {
  transactions: Array<{
    to: string
    value?: string
    data: string
    operation?: number
    description: string
  }>
  description: string
  metadata?: any
  chainId?: number
}

export interface ProposeBatchResponse {
  success: boolean
  transactionId: string
  requiredSignatures: number
  currentSignatures: number
  safeAddress: string
  batchSize: number
  description: string
  message: string
}

/**
 * Cloud Function to propose a batch of transactions for Safe execution
 *
 * @param request - The callable request with batch transaction details
 * @returns Batch transaction proposal details
 */
export const proposeBatch = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 120,
    cors: true,
    region: 'us-central1',
  },
  async (request: CallableRequest<ProposeBatchRequest>): Promise<ProposeBatchResponse> => {
    const functionName = 'proposeBatch'
    logger.info(`${functionName}: Creating batch transaction proposal`, {
      uid: request.auth?.uid,
      batchSize: request.data.transactions?.length || 0,
      description: request.data.description,
    })

    try {
      // 1. Authentication check
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated to propose batch transactions')
      }

      // 2. Validate input parameters
      if (!request.data.transactions || !Array.isArray(request.data.transactions) || request.data.transactions.length === 0) {
        throw new HttpsError('invalid-argument', 'Transactions array is required and must not be empty')
      }

      if (!request.data.description) {
        throw new HttpsError('invalid-argument', 'Batch description is required')
      }

      // Validate transaction count limits
      if (request.data.transactions.length > 20) {
        throw new HttpsError('invalid-argument', 'Batch cannot contain more than 20 transactions')
      }

      // 3. Validate each transaction in the batch
      for (let i = 0; i < request.data.transactions.length; i++) {
        const tx = request.data.transactions[i]

        if (!tx.to || !tx.data || !tx.description) {
          throw new HttpsError('invalid-argument', `Transaction ${i + 1}: Missing required fields (to, data, description)`)
        }

        // Validate Ethereum address format
        if (!/^0x[a-fA-F0-9]{40}$/.test(tx.to)) {
          throw new HttpsError('invalid-argument', `Transaction ${i + 1}: Invalid "to" address format`)
        }

        // Validate hex data format
        if (!/^0x[a-fA-F0-9]*$/.test(tx.data)) {
          throw new HttpsError('invalid-argument', `Transaction ${i + 1}: Invalid "data" hex format`)
        }
      }

      const chainId = request.data.chainId || 80002 // Default to Polygon Amoy

      // 4. Initialize ContractService
      const contractService = createContractService(chainId)

      // 5. Convert request transactions to TransactionProposal format
      const transactions: TransactionProposal[] = request.data.transactions.map((tx) => ({
        to: tx.to,
        value: tx.value || '0',
        data: tx.data,
        operation: tx.operation || 0, // Default to CALL
        description: tx.description,
      }))

      // 6. Create batch transaction proposal
      const batchRequest: BatchTransactionRequest = {
        transactions,
        description: request.data.description,
        metadata: request.data.metadata,
      }

      const transactionStatus = await contractService.proposeBatchTransaction(batchRequest, request.auth.uid)

      logger.info(`${functionName}: Batch transaction proposed successfully`, {
        transactionId: transactionStatus.id,
        batchSize: transactions.length,
        requiredSignatures: transactionStatus.requiredSignatures,
        description: transactionStatus.description,
      })

      return {
        success: true,
        transactionId: transactionStatus.id,
        requiredSignatures: transactionStatus.requiredSignatures,
        currentSignatures: transactionStatus.currentSignatures,
        safeAddress: contractService['config'].safeAddress,
        batchSize: transactions.length,
        description: transactionStatus.description,
        message: `Batch of ${transactions.length} transactions proposed successfully. Requires ${transactionStatus.requiredSignatures} signature(s) to execute.`,
      }
    } catch (error) {
      logger.error(`${functionName}: Error proposing batch transaction`, {
        error: error instanceof Error ? error.message : String(error),
        uid: request.auth?.uid,
        batchSize: request.data.transactions?.length || 0,
      })

      return handleError(error, functionName)
    }
  }
)
