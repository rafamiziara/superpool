import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import { createContractService } from '../../services/ContractService'
import { handleError } from '../../utils/errorHandling'

export interface EmergencyPauseRequest {
  contractAddress: string
  reason: string
  chainId?: number
}

export interface EmergencyPauseResponse {
  success: boolean
  transactionId: string
  requiredSignatures: number
  currentSignatures: number
  safeAddress: string
  contractAddress: string
  reason: string
  message: string
}

/**
 * Cloud Function to create an emergency pause transaction for a contract
 * 
 * @param request - The callable request with contract address and pause reason
 * @returns Emergency pause transaction details
 */
export const emergencyPause = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true,
    region: 'us-central1',
  },
  async (request: CallableRequest<EmergencyPauseRequest>): Promise<EmergencyPauseResponse> => {
    const functionName = 'emergencyPause'
    logger.warn(`${functionName}: Emergency pause requested`, {
      uid: request.auth?.uid,
      contractAddress: request.data.contractAddress,
      reason: request.data.reason
    })

    try {
      // 1. Authentication check - emergency actions require admin access
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated for emergency actions')
      }

      // 2. Validate input parameters
      if (!request.data.contractAddress || !request.data.reason) {
        throw new HttpsError('invalid-argument', 'Missing required fields: contractAddress, reason')
      }

      // Validate Ethereum address format
      if (!/^0x[a-fA-F0-9]{40}$/.test(request.data.contractAddress)) {
        throw new HttpsError('invalid-argument', 'Invalid contract address format')
      }

      // Validate reason length
      if (request.data.reason.trim().length < 10) {
        throw new HttpsError('invalid-argument', 'Emergency pause reason must be at least 10 characters')
      }

      const chainId = request.data.chainId || 80002 // Default to Polygon Amoy

      // 3. Initialize ContractService
      const contractService = createContractService(chainId)

      // 4. Create emergency pause transaction
      const transactionStatus = await contractService.emergencyPause(
        request.data.contractAddress,
        request.auth.uid,
        request.data.reason
      )

      // 5. Log emergency action for audit trail
      logger.warn(`${functionName}: Emergency pause transaction created`, {
        transactionId: transactionStatus.id,
        contractAddress: request.data.contractAddress,
        reason: request.data.reason,
        createdBy: request.auth.uid,
        requiredSignatures: transactionStatus.requiredSignatures,
        timestamp: new Date().toISOString()
      })

      // 6. In a real implementation, you might want to:
      // - Send immediate notifications to all Safe owners
      // - Create alerts in monitoring systems
      // - Log to security audit system
      // - Potentially auto-approve if it's a critical emergency

      return {
        success: true,
        transactionId: transactionStatus.id,
        requiredSignatures: transactionStatus.requiredSignatures,
        currentSignatures: transactionStatus.currentSignatures,
        safeAddress: contractService['config'].safeAddress,
        contractAddress: request.data.contractAddress,
        reason: request.data.reason,
        message: `Emergency pause transaction created for contract ${request.data.contractAddress}. ` +
                 `Requires ${transactionStatus.requiredSignatures} signature(s) to execute. ` +
                 `Transaction ID: ${transactionStatus.id}`
      }

    } catch (error) {
      logger.error(`${functionName}: Error creating emergency pause transaction`, {
        error: error instanceof Error ? error.message : String(error),
        uid: request.auth?.uid,
        contractAddress: request.data.contractAddress,
        reason: request.data.reason
      })

      return handleError(error, functionName)
    }
  }
)