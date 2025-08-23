import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import { createContractService, TransactionProposal } from '../../services/ContractService'
import { handleError } from '../../utils/errorHandling'

export interface ProposeTransactionRequest {
  to: string
  value?: string
  data: string
  operation?: number // 0 = CALL, 1 = DELEGATECALL
  description: string
  metadata?: any
  chainId?: number
}

export interface ProposeTransactionResponse {
  success: boolean
  transactionId: string
  requiredSignatures: number
  currentSignatures: number
  safeAddress: string
  description: string
  message: string
}

/**
 * Cloud Function to propose a new Safe transaction
 * 
 * @param request - The callable request with transaction details
 * @returns Transaction proposal details with ID for signature collection
 */
export const proposeTransaction = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true,
    region: 'us-central1',
  },
  async (request: CallableRequest<ProposeTransactionRequest>): Promise<ProposeTransactionResponse> => {
    const functionName = 'proposeTransaction'
    logger.info(`${functionName}: Creating transaction proposal`, {
      uid: request.auth?.uid,
      to: request.data.to,
      description: request.data.description
    })

    try {
      // 1. Authentication check
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated to propose transactions')
      }

      // 2. Validate input parameters
      if (!request.data.to || !request.data.data || !request.data.description) {
        throw new HttpsError('invalid-argument', 'Missing required fields: to, data, description')
      }

      // Validate Ethereum address format
      if (!/^0x[a-fA-F0-9]{40}$/.test(request.data.to)) {
        throw new HttpsError('invalid-argument', 'Invalid "to" address format')
      }

      // Validate hex data format
      if (!/^0x[a-fA-F0-9]*$/.test(request.data.data)) {
        throw new HttpsError('invalid-argument', 'Invalid "data" hex format')
      }

      const chainId = request.data.chainId || 80002 // Default to Polygon Amoy

      // 3. Initialize ContractService
      const contractService = createContractService(chainId)

      // 4. Create transaction proposal
      const proposal: TransactionProposal = {
        to: request.data.to,
        value: request.data.value || '0',
        data: request.data.data,
        operation: request.data.operation || 0, // Default to CALL
        description: request.data.description,
        metadata: request.data.metadata
      }

      const transactionStatus = await contractService.proposeTransaction(
        proposal,
        request.auth.uid
      )

      logger.info(`${functionName}: Transaction proposed successfully`, {
        transactionId: transactionStatus.id,
        requiredSignatures: transactionStatus.requiredSignatures,
        description: transactionStatus.description
      })

      return {
        success: true,
        transactionId: transactionStatus.id,
        requiredSignatures: transactionStatus.requiredSignatures,
        currentSignatures: transactionStatus.currentSignatures,
        safeAddress: contractService['config'].safeAddress,
        description: transactionStatus.description,
        message: `Transaction proposed successfully. Requires ${transactionStatus.requiredSignatures} signature(s) to execute.`
      }

    } catch (error) {
      logger.error(`${functionName}: Error proposing transaction`, {
        error: error instanceof Error ? error.message : String(error),
        uid: request.auth?.uid
      })

      return handleError(error, functionName)
    }
  }
)