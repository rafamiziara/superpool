import { SignMessageRequest, SignMessageResponse } from '@superpool/types'
import { Wallet } from 'ethers'
import { logger } from 'firebase-functions/v2'
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { signMessageSchema } from '../../schemas'
import { createAuthMessage } from '../../utils'
import { parseRequest } from '../../utils/validation'

export const signMessageForTestingHandler = async (request: CallableRequest<SignMessageRequest>): Promise<SignMessageResponse> => {
  // Only allow in development/emulator
  if (process.env.FUNCTIONS_EMULATOR !== 'true') {
    throw new HttpsError('permission-denied', 'This function is only available in the emulator')
  }

  const { nonce, timestamp } = parseRequest(signMessageSchema, request.data)

  // Use test private key from environment or hardcoded for local testing
  // Default: Hardhat test account #1 (not the owner/deployer)
  const privateKey = process.env.TEST_WALLET_PRIVATE_KEY || '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'

  const wallet = new Wallet(privateKey)

  // Use the same createAuthMessage function as the backend
  const messageToSign = createAuthMessage(wallet.address, nonce, timestamp)

  logger.info('Signing message for testing', {
    walletAddress: wallet.address,
    nonce,
    timestamp,
  })

  const signature = await wallet.signMessage(messageToSign)

  return {
    signature,
    walletAddress: wallet.address,
    message: messageToSign,
  }
}

/**
 * DEV ONLY: Sign authentication message for testing in Postman
 *
 * This function replicates wallet signing for testing purposes.
 * It should NEVER be deployed to production.
 *
 * @param {CallableRequest<SignMessageRequest>} request The callable request with nonce and timestamp
 * @returns {Promise<SignMessageResponse>} Signature, wallet address, and message
 * @throws {HttpsError} If not running in emulator or invalid parameters
 */
export const signMessageForTesting = onCall<SignMessageRequest>(
  {
    memory: '256MiB',
    timeoutSeconds: 10,
    cors: true,
  },
  signMessageForTestingHandler
)
