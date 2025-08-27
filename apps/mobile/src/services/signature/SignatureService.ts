import { SignatureType, SignatureRequest, SignatureResult, SignatureFunctions } from '@superpool/types'
import type { Connector } from 'wagmi'
import { devOnly } from '../../utils'
import { SignatureStrategyFactory, SignatureUtils } from './strategies'

interface TypedDataParameter {
  name: string
  type: string
}

interface TypedDataDomain {
  name?: string
  version?: string
  chainId?: number | bigint
  verifyingContract?: `0x${string}`
  salt?: `0x${string}`
}

interface TypedData {
  domain?: TypedDataDomain
  types: Record<string, TypedDataParameter[]>
  primaryType: string
  message: Record<string, unknown>
  account: `0x${string}` // Required to match wagmi v2
}

export class SignatureService {
  /**
   * Validates signature request parameters before processing
   */
  private static validateSignatureRequest(request: SignatureRequest): void {
    if (!request.message || request.message.trim() === '') {
      throw new Error('Signature request missing message data')
    }

    if (!request.nonce || request.nonce.trim() === '') {
      throw new Error('Signature request missing nonce')
    }

    if (!request.walletAddress || request.walletAddress.trim() === '') {
      throw new Error('Signature request missing wallet address')
    }

    if (!request.timestamp || request.timestamp <= 0) {
      throw new Error('Signature request missing valid timestamp')
    }

    // Validate wallet address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(request.walletAddress)) {
      throw new Error(`Invalid wallet address format: ${request.walletAddress}`)
    }

    devOnly('✅ Signature request validation passed:', {
      messageLength: request.message.length,
      nonce: request.nonce,
      walletAddress: request.walletAddress.substring(0, 6) + '...' + request.walletAddress.slice(-4),
      timestamp: request.timestamp,
      chainId: request.chainId,
    })
  }

  static async requestSignature(request: SignatureRequest, functions: SignatureFunctions, connector?: Connector): Promise<SignatureResult> {
    // Validate request parameters first
    this.validateSignatureRequest(request)

    // Get appropriate signature strategy
    const strategy = SignatureStrategyFactory.getStrategy(connector)

    console.log('🔍 Signature request preview:', {
      strategy: strategy.getStrategyName(),
      connectorId: connector?.id,
      connectorName: connector?.name,
      requestPreview: {
        messageLength: request.message.length,
        messageStart: request.message.substring(0, 30) + '...',
        walletAddress: request.walletAddress.substring(0, 6) + '...' + request.walletAddress.slice(-4),
      },
    })

    let result: SignatureResult

    try {
      console.log(`📱 Using ${strategy.getStrategyName()} signing strategy`)
      result = await strategy.sign(request, functions, connector)
    } catch (signingError) {
      console.error('❌ Signature request failed:', {
        error: signingError,
        strategy: strategy.getStrategyName(),
        connectorInfo: { id: connector?.id, name: connector?.name },
      })
      throw signingError
    }

    // Final signature validation
    if (!SignatureUtils.isValidSignatureFormat(result.signature)) {
      throw new Error(`Invalid signature received: ${JSON.stringify(result.signature)}`)
    }

    devOnly('✅ Signature request completed:', {
      signatureType: result.signatureType,
      signatureLength: result.signature.length,
      signaturePreview: result.signature.substring(0, 10) + '...',
    })

    return result
  }
}
