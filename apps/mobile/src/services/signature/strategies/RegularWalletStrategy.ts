import type { Connector } from 'wagmi'
import type { SignatureRequest, SignatureResult, SignatureFunctions } from '@superpool/types'
import { devOnly } from '../../../utils'
import type { SignatureStrategy } from './SignatureStrategy'
import { SignatureUtils } from './SignatureUtils'

/**
 * Signature strategy for regular (non-Safe) wallets
 * Attempts personal signing first, then falls back to EIP-712 typed data
 * Includes Safe wallet detection based on error patterns
 */
export class RegularWalletStrategy implements SignatureStrategy {
  private static readonly TIMEOUT_MS = 15000 // 15s for regular wallets
  private static readonly SAFE_TIMEOUT_MS = 20000 // 20s when Safe wallet detected

  canHandle(connector?: Connector): boolean {
    // Regular wallet strategy handles all non-Safe wallets
    if (!connector) return true

    // Explicitly reject Safe wallets
    const isSafe = connector.id === 'safe' || connector.name?.toLowerCase().includes('safe') || connector.id?.toLowerCase().includes('safe')
    return !isSafe
  }

  getStrategyName(): string {
    return 'regular-wallet'
  }

  async sign(request: SignatureRequest, functions: SignatureFunctions, connector?: Connector): Promise<SignatureResult> {
    // First try personal message signing for better UX
    try {
      console.log('📱 Trying personal message signing first for better UX...')
      return await this.tryPersonalSign(request, functions)
    } catch (personalSignError: unknown) {
      const errorMessage = personalSignError instanceof Error ? personalSignError.message : String(personalSignError)
      console.log('❌ Personal signing failed, trying EIP-712...', errorMessage)

      // Check if this might be a Safe wallet that wasn't detected initially
      if (SignatureUtils.isSafeWalletError(errorMessage)) {
        return this.handleSafeWalletDetection(request, 'personal sign exception')
      }

      // Fallback to EIP-712 typed data
      return await this.tryEip712Sign(request, functions)
    }
  }

  /**
   * Attempts personal message signing
   */
  private async tryPersonalSign(request: SignatureRequest, functions: SignatureFunctions): Promise<SignatureResult> {
    const signature = await SignatureUtils.withTimeout(
      functions.signMessageAsync({
        message: request.message,
        account: request.walletAddress as `0x${string}`,
      }),
      RegularWalletStrategy.TIMEOUT_MS,
      'Personal sign request'
    )

    // Validate personal sign signature
    if (!SignatureUtils.validateSignatureResult(signature)) {
      // Check if this is a Safe wallet based on error patterns
      const personalSignError = JSON.stringify(signature)
      if (SignatureUtils.isSafeWalletError(personalSignError)) {
        console.log('🔍 Safe wallet detected by personal sign error, switching to Safe authentication...')
        throw new Error('SafeWalletDetected') // Special error for Safe wallet detection
      } else {
        throw new Error(`Personal message signing failed: ${JSON.stringify(signature)}`)
      }
    }

    SignatureUtils.logSignaturePreview(signature, 'Personal message')
    return {
      signature,
      signatureType: 'personal-sign',
    }
  }

  /**
   * Attempts EIP-712 typed data signing
   */
  private async tryEip712Sign(request: SignatureRequest, functions: SignatureFunctions): Promise<SignatureResult> {
    try {
      console.log('📱 Trying EIP-712 typed data signing as fallback...')

      const typedData = this.createTypedData(request)
      const signature = await SignatureUtils.withTimeout(
        functions.signTypedDataAsync({
          ...typedData,
          account: request.walletAddress as `0x${string}`,
        }),
        RegularWalletStrategy.TIMEOUT_MS,
        'EIP-712 signature request'
      )

      // Validate EIP-712 signature
      if (!SignatureUtils.validateSignatureResult(signature)) {
        const eip712Error = JSON.stringify(signature)
        if (SignatureUtils.isSafeWalletError(eip712Error)) {
          console.log('🔍 Safe wallet detected by EIP-712 error, switching to Safe authentication...')
          return this.handleSafeWalletDetection(request, 'EIP-712 error')
        }
        throw new Error(`EIP-712 signing failed: ${JSON.stringify(signature)}`)
      }

      SignatureUtils.logSignaturePreview(signature, 'EIP-712')
      return {
        signature,
        signatureType: 'typed-data',
      }
    } catch (typedDataError: unknown) {
      const eip712ErrorMessage = typedDataError instanceof Error ? typedDataError.message : String(typedDataError)
      console.log('❌ EIP-712 also failed, no more fallbacks available:', eip712ErrorMessage)

      // Check if this might be a Safe wallet that wasn't detected initially
      if (SignatureUtils.isSafeWalletError(eip712ErrorMessage)) {
        console.log('🔍 Safe wallet detected by EIP-712 exception, switching to Safe authentication...')
        return this.handleSafeWalletDetection(request, 'EIP-712 exception')
      }

      // Both methods failed
      throw new Error(`All signature methods failed. Personal sign: ${eip712ErrorMessage}. EIP-712: ${eip712ErrorMessage}`)
    }
  }

  /**
   * Creates EIP-712 typed data structure
   */
  private createTypedData(request: SignatureRequest) {
    return {
      domain: {
        name: 'SuperPool Authentication',
        version: '1',
        chainId: request.chainId || 1,
      },
      types: {
        Authentication: [
          { name: 'wallet', type: 'address' },
          { name: 'nonce', type: 'string' },
          { name: 'timestamp', type: 'uint256' },
        ],
      },
      primaryType: 'Authentication' as const,
      message: {
        wallet: request.walletAddress as `0x${string}`,
        nonce: request.nonce,
        timestamp: BigInt(request.timestamp),
      },
    }
  }

  /**
   * Handles Safe wallet detection during regular wallet signing
   */
  private handleSafeWalletDetection(request: SignatureRequest, context: string): SignatureResult {
    const safeSignature = SignatureUtils.createSafeAuthToken(request)
    console.log(`🔐 Safe wallet authentication token generated (${context} detection)`)

    return {
      signature: safeSignature,
      signatureType: 'safe-wallet',
    }
  }
}
