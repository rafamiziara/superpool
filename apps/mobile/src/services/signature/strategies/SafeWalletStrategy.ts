import type { Connector } from 'wagmi'
import type { SignatureRequest, SignatureResult, SignatureFunctions } from '@superpool/types'
import { devOnly } from '../../../utils'
import type { SignatureStrategy } from './SignatureStrategy'
import { SignatureUtils } from './SignatureUtils'

/**
 * Signature strategy for Safe wallets
 * Handles Safe wallet signing with direct connector approach and fallback to ownership verification
 */
export class SafeWalletStrategy implements SignatureStrategy {
  private static readonly TIMEOUT_MS = 20000 // 20s for Safe wallets

  canHandle(connector?: Connector): boolean {
    if (!connector) return false

    return connector.id === 'safe' || connector.name?.toLowerCase().includes('safe') || connector.id?.toLowerCase().includes('safe')
  }

  getStrategyName(): string {
    return 'safe-wallet'
  }

  async sign(request: SignatureRequest, functions: SignatureFunctions, connector?: Connector): Promise<SignatureResult> {
    console.log('🔐 Safe wallet detected, trying direct connector signing...')

    try {
      // Try direct connector signing first
      const signature = await SignatureUtils.withTimeout(
        functions.signMessageAsync({
          message: request.message,
          account: request.walletAddress as `0x${string}`,
          connector,
        }),
        SafeWalletStrategy.TIMEOUT_MS,
        'Safe connector signing'
      )

      // Validate signature result
      if (!SignatureUtils.validateSignatureResult(signature)) {
        throw new Error(`Safe connector signing failed: ${JSON.stringify(signature)}`)
      }

      devOnly('✅ Safe wallet direct signing successful:', typeof signature, signature?.substring?.(0, 10) + '...')
      return {
        signature,
        signatureType: 'personal-sign',
      }
    } catch (error) {
      console.log('❌ Safe direct signing failed, using ownership verification fallback...', error)
      return this.createFallbackSignature(request)
    }
  }

  /**
   * Creates fallback signature using ownership verification approach
   */
  private createFallbackSignature(request: SignatureRequest): SignatureResult {
    console.log('🔐 Using Safe wallet authentication (ownership verification)')

    const fallbackSignature = SignatureUtils.createSafeAuthToken(request)
    console.log('🔐 Safe wallet authentication token generated')

    return {
      signature: fallbackSignature,
      signatureType: 'safe-wallet',
    }
  }
}
