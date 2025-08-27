import { SignatureFunctions, SignatureRequest, SignatureResult } from '@superpool/types'
import type { Connector } from 'wagmi'
import { SignatureService } from '../../signature'
import type { GeneratedAuthMessage } from './MessageGenerator'

export interface SignatureContext {
  walletAddress: string
  chainId?: number
  signatureFunctions: SignatureFunctions
  connector?: Connector
}

/**
 * Handles signature coordination between authentication flow and signature service
 * Separates signature request logic from orchestration
 */
export class SignatureHandler {
  /**
   * Request signature from wallet using generated auth message
   */
  async requestWalletSignature(context: SignatureContext, authMessage: GeneratedAuthMessage): Promise<SignatureResult> {
    console.log('✍️ Requesting wallet signature...')

    const signatureRequest: SignatureRequest = {
      message: authMessage.message,
      nonce: authMessage.nonce,
      timestamp: authMessage.timestamp,
      walletAddress: context.walletAddress,
      chainId: context.chainId,
    }

    console.log('🔐 Signature request prepared:', {
      walletAddress: context.walletAddress,
      chainId: context.chainId,
      messagePreview: authMessage.message?.substring(0, 50) + '...',
      connectorId: context.connector?.id,
    })

    return await SignatureService.requestSignature(signatureRequest, context.signatureFunctions, context.connector)
  }
}
