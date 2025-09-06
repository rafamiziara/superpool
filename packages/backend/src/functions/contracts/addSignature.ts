import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import { ethers } from 'ethers'
import { getFirestore } from 'firebase-admin/firestore'
import { createContractService, SafeSignature } from '../../services/ContractService'
import { isSafeOwner } from '../../utils/multisig'
import { handleError } from '../../utils/errorHandling'

export interface AddSignatureRequest {
  transactionId: string
  signature: string
  chainId?: number
}

export interface AddSignatureResponse {
  success: boolean
  transactionId: string
  currentSignatures: number
  requiredSignatures: number
  readyToExecute: boolean
  signerAddress: string
  message: string
}

/**
 * Cloud Function to add a signature to a pending Safe transaction
 *
 * @param request - The callable request with transaction ID and signature
 * @returns Updated signature status
 */
export const addSignature = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 30,
    cors: true,
    region: 'us-central1',
  },
  async (request: CallableRequest<AddSignatureRequest>): Promise<AddSignatureResponse> => {
    const functionName = 'addSignature'
    logger.info(`${functionName}: Adding signature to transaction`, {
      uid: request.auth?.uid,
      transactionId: request.data.transactionId,
    })

    try {
      // 1. Authentication check
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated to add signatures')
      }

      // 2. Validate input parameters
      if (!request.data.transactionId || !request.data.signature) {
        throw new HttpsError('invalid-argument', 'Missing required fields: transactionId, signature')
      }

      // Validate transaction hash format
      if (!/^0x[a-fA-F0-9]{64}$/.test(request.data.transactionId)) {
        throw new HttpsError('invalid-argument', 'Invalid transaction ID format')
      }

      // Validate signature format
      if (!/^0x[a-fA-F0-9]{130}$/.test(request.data.signature)) {
        throw new HttpsError('invalid-argument', 'Invalid signature format')
      }

      const chainId = request.data.chainId || 80002 // Default to Polygon Amoy

      // 3. Get user's wallet address from Firestore
      const db = getFirestore()
      const userDoc = await db.collection('users').doc(request.auth.uid).get()

      if (!userDoc.exists) {
        throw new HttpsError('failed-precondition', 'User profile not found')
      }

      const userData = userDoc.data()!
      const userAddress = userData.walletAddress

      if (!userAddress) {
        throw new HttpsError('failed-precondition', 'User wallet address not found')
      }

      // 4. Verify signature against transaction hash
      const transactionHash = request.data.transactionId
      let recoveredAddress: string

      try {
        recoveredAddress = ethers.verifyMessage(ethers.getBytes(transactionHash), request.data.signature)
      } catch (error) {
        throw new HttpsError('invalid-argument', 'Invalid signature format or unable to recover address')
      }

      if (recoveredAddress.toLowerCase() !== userAddress.toLowerCase()) {
        throw new HttpsError('permission-denied', 'Signature does not match user address')
      }

      // 5. Initialize ContractService and verify Safe ownership
      const contractService = createContractService(chainId)
      const provider = new ethers.JsonRpcProvider(getProviderUrl(chainId))
      const safeAddress = getSafeAddress(chainId)

      const isOwner = await isSafeOwner(safeAddress, userAddress, provider)
      if (!isOwner) {
        throw new HttpsError('permission-denied', 'User is not a Safe owner')
      }

      // 6. Add signature to transaction
      const safeSignature: SafeSignature = {
        signer: userAddress,
        data: request.data.signature,
      }

      const transactionStatus = await contractService.addSignature(request.data.transactionId, safeSignature)

      logger.info(`${functionName}: Signature added successfully`, {
        transactionId: request.data.transactionId,
        signer: userAddress,
        currentSignatures: transactionStatus.currentSignatures,
        requiredSignatures: transactionStatus.requiredSignatures,
        readyToExecute: transactionStatus.currentSignatures >= transactionStatus.requiredSignatures,
      })

      return {
        success: true,
        transactionId: request.data.transactionId,
        currentSignatures: transactionStatus.currentSignatures,
        requiredSignatures: transactionStatus.requiredSignatures,
        readyToExecute: transactionStatus.currentSignatures >= transactionStatus.requiredSignatures,
        signerAddress: userAddress,
        message:
          transactionStatus.currentSignatures >= transactionStatus.requiredSignatures
            ? 'Signature added. Transaction is ready to execute!'
            : `Signature added. ${transactionStatus.requiredSignatures - transactionStatus.currentSignatures} more signature(s) needed.`,
      }
    } catch (error) {
      logger.error(`${functionName}: Error adding signature`, {
        error: error instanceof Error ? error.message : String(error),
        uid: request.auth?.uid,
        transactionId: request.data.transactionId,
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
    throw new Error(`RPC URL not configured for chain ID ${chainId}`)
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
    throw new Error(`Safe address not configured for chain ID ${chainId}`)
  }

  return address
}
