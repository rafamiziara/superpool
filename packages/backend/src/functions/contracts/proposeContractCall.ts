import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import { ContractCall, createContractService } from '../../services/ContractService'
import { handleError } from '../../utils/errorHandling'

export interface ProposeContractCallRequest {
  contractAddress: string
  functionName: string
  abi: any[]
  args: any[]
  value?: string
  description: string
  metadata?: any
  chainId?: number
}

export interface ProposeContractCallResponse {
  success: boolean
  transactionId: string
  requiredSignatures: number
  currentSignatures: number
  safeAddress: string
  functionName: string
  contractAddress: string
  description: string
  message: string
}

/**
 * Cloud Function to propose a contract function call through Safe
 *
 * @param request - The callable request with contract call details
 * @returns Transaction proposal details for the contract call
 */
export const proposeContractCall = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true,
    region: 'us-central1',
  },
  async (request: CallableRequest<ProposeContractCallRequest>): Promise<ProposeContractCallResponse> => {
    const functionName = 'proposeContractCall'
    logger.info(`${functionName}: Creating contract call proposal`, {
      uid: request.auth?.uid,
      contractAddress: request.data.contractAddress,
      functionName: request.data.functionName,
      description: request.data.description,
    })

    try {
      // 1. Authentication check
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated to propose contract calls')
      }

      // 2. Validate input parameters
      if (!request.data.contractAddress || !request.data.functionName || !request.data.abi || !request.data.description) {
        throw new HttpsError('invalid-argument', 'Missing required fields: contractAddress, functionName, abi, description')
      }

      // Validate Ethereum address format
      if (!/^0x[a-fA-F0-9]{40}$/.test(request.data.contractAddress)) {
        throw new HttpsError('invalid-argument', 'Invalid contract address format')
      }

      // Validate ABI format
      if (!Array.isArray(request.data.abi)) {
        throw new HttpsError('invalid-argument', 'ABI must be an array')
      }

      // Validate args format
      if (!Array.isArray(request.data.args)) {
        throw new HttpsError('invalid-argument', 'Arguments must be an array')
      }

      const chainId = request.data.chainId || 80002 // Default to Polygon Amoy

      // 3. Initialize ContractService
      const contractService = createContractService(chainId)

      // 4. Create contract call proposal
      const contractCall: ContractCall = {
        contractAddress: request.data.contractAddress,
        functionName: request.data.functionName,
        abi: request.data.abi,
        args: request.data.args,
        value: request.data.value,
      }

      const transactionStatus = await contractService.proposeContractCall(
        contractCall,
        request.data.description,
        request.auth.uid,
        request.data.metadata
      )

      logger.info(`${functionName}: Contract call proposed successfully`, {
        transactionId: transactionStatus.id,
        contractAddress: request.data.contractAddress,
        functionName: request.data.functionName,
        requiredSignatures: transactionStatus.requiredSignatures,
      })

      return {
        success: true,
        transactionId: transactionStatus.id,
        requiredSignatures: transactionStatus.requiredSignatures,
        currentSignatures: transactionStatus.currentSignatures,
        safeAddress: contractService['config'].safeAddress,
        functionName: request.data.functionName,
        contractAddress: request.data.contractAddress,
        description: transactionStatus.description,
        message: `Contract call "${request.data.functionName}" proposed successfully. Requires ${transactionStatus.requiredSignatures} signature(s) to execute.`,
      }
    } catch (error) {
      logger.error(`${functionName}: Error proposing contract call`, {
        error: error instanceof Error ? error.message : String(error),
        uid: request.auth?.uid,
        contractAddress: request.data.contractAddress,
        functionName: request.data.functionName,
      })

      return handleError(error, functionName)
    }
  }
)
