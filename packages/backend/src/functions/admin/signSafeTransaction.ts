import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import { ethers } from 'ethers'
import { getFirestore } from 'firebase-admin/firestore'
import { signSafeTransaction as signSafeTransactionUtil, SafeSignature, getSafeOwners, isSafeOwner } from '../../utils/multisig'
import { handleError, AppError } from '../../utils/errorHandling'

export interface SignSafeTransactionRequest {
  transactionHash: string
  signature?: string // Optional - if provided, will be verified and added
  chainId?: number
}

export interface SignSafeTransactionResponse {
  success: boolean
  transactionHash: string
  safeAddress: string
  currentSignatures: number
  requiredSignatures: number
  readyToExecute: boolean
  message: string
  signatures?: SafeSignature[]
}

/**
 * Cloud Function to sign a Safe multi-sig transaction
 * 
 * @param request - The callable request with transaction hash and optional signature
 * @returns Updated signature status
 */
export const signSafeTransaction = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 30,
    cors: true,
    region: 'us-central1',
  },
  async (request: CallableRequest<SignSafeTransactionRequest>): Promise<SignSafeTransactionResponse> => {
    const functionName = 'signSafeTransaction'
    logger.info(`${functionName}: Processing signature request`, {
      uid: request.auth?.uid,
      transactionHash: request.data.transactionHash
    })

    try {
      // 1. Authentication check
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated to sign transactions')
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
      
      // 4. Check if transaction is still pending signatures
      if (txData.status !== 'pending_signatures') {
        throw new HttpsError('failed-precondition', `Transaction status is ${txData.status}, cannot add signatures`)
      }

      // 5. Check if transaction has expired
      if (txData.expiresAt && txData.expiresAt.toDate() < new Date()) {
        await db.collection('safe_transactions').doc(transactionHash).update({
          status: 'expired',
          updatedAt: new Date()
        })
        throw new HttpsError('deadline-exceeded', 'Transaction has expired')
      }

      // 6. Get user's wallet address
      const userAddress = await getUserWalletAddress(request.auth.uid)
      if (!userAddress) {
        throw new HttpsError('failed-precondition', 'User wallet address not found')
      }

      // 7. Initialize blockchain connection and verify Safe ownership
      const provider = new ethers.JsonRpcProvider(getProviderUrl(chainId))
      const isOwner = await isSafeOwner(txData.safeAddress, userAddress, provider)
      
      if (!isOwner) {
        throw new HttpsError('permission-denied', 'User is not a Safe owner')
      }

      // 8. Check if user has already signed
      const existingSignatures = txData.signatures || []
      const existingSignature = existingSignatures.find((sig: SafeSignature) => 
        sig.signer.toLowerCase() === userAddress.toLowerCase()
      )

      if (existingSignature) {
        logger.info(`${functionName}: User has already signed`, {
          uid: request.auth.uid,
          userAddress,
          transactionHash
        })
        
        return {
          success: true,
          transactionHash,
          safeAddress: txData.safeAddress,
          currentSignatures: existingSignatures.length,
          requiredSignatures: txData.requiredSignatures,
          readyToExecute: existingSignatures.length >= txData.requiredSignatures,
          message: 'Transaction already signed by this address',
          signatures: existingSignatures
        }
      }

      let signature: string

      // 9. Handle signature
      if (request.data.signature) {
        // Signature provided - verify it
        signature = request.data.signature
        
        // Verify signature
        const recoveredAddress = ethers.verifyMessage(
          ethers.getBytes(transactionHash),
          signature
        )
        
        if (recoveredAddress.toLowerCase() !== userAddress.toLowerCase()) {
          throw new HttpsError('invalid-argument', 'Invalid signature')
        }
      } else {
        throw new HttpsError('invalid-argument', 'Signature is required')
      }

      // 10. Add signature
      const newSignature: SafeSignature = {
        signer: userAddress,
        data: signature
      }

      const updatedSignatures = [...existingSignatures, newSignature]
      const readyToExecute = updatedSignatures.length >= txData.requiredSignatures

      // 11. Update Firestore
      const updateData: any = {
        signatures: updatedSignatures,
        currentSignatures: updatedSignatures.length,
        updatedAt: new Date()
      }

      if (readyToExecute) {
        updateData.status = 'ready_to_execute'
        updateData.readyAt = new Date()
      }

      await db.collection('safe_transactions').doc(transactionHash).update(updateData)

      logger.info(`${functionName}: Signature added successfully`, {
        transactionHash,
        signer: userAddress,
        currentSignatures: updatedSignatures.length,
        requiredSignatures: txData.requiredSignatures,
        readyToExecute
      })

      return {
        success: true,
        transactionHash,
        safeAddress: txData.safeAddress,
        currentSignatures: updatedSignatures.length,
        requiredSignatures: txData.requiredSignatures,
        readyToExecute,
        message: readyToExecute 
          ? 'Transaction has enough signatures and is ready to execute'
          : `Signature added. ${txData.requiredSignatures - updatedSignatures.length} more signature(s) needed.`,
        signatures: updatedSignatures
      }

    } catch (error) {
      logger.error(`${functionName}: Error processing signature`, {
        error: error instanceof Error ? error.message : String(error),
        uid: request.auth?.uid,
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
 * Get user's wallet address from Firestore
 */
async function getUserWalletAddress(uid: string): Promise<string | null> {
  try {
    const db = getFirestore()
    const userDoc = await db.collection('users').doc(uid).get()
    
    if (userDoc.exists) {
      const userData = userDoc.data()
      return userData?.walletAddress || null
    }
    
    return null
  } catch (error) {
    logger.error('Error getting user wallet address', {
      uid,
      error: error instanceof Error ? error.message : String(error)
    })
    return null
  }
}