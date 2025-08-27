import { AUTH_VALIDATION, SIGNATURE_FORMATS, SUPPORTED_CHAIN_IDS, WALLET_ADDRESS_FORMAT } from './constants'

/**
 * Common validation utilities for service layer operations
 * Centralizes validation logic used across authentication and signature services
 */
export class ValidationUtils {
  /**
   * Validates Ethereum wallet address format
   */
  static isValidWalletAddress(address: string): boolean {
    if (!address || typeof address !== 'string') {
      return false
    }
    return WALLET_ADDRESS_FORMAT.PATTERN.test(address)
  }

  /**
   * Validates nonce format and content
   */
  static isValidNonce(nonce: string): boolean {
    if (!nonce || typeof nonce !== 'string') {
      return false
    }
    return nonce.trim().length > 0 && nonce.length <= AUTH_VALIDATION.MAX_NONCE_LENGTH
  }

  /**
   * Validates timestamp is within reasonable bounds
   */
  static isValidTimestamp(timestamp: number, maxAgeMs: number = AUTH_VALIDATION.MAX_TIMESTAMP_AGE): boolean {
    if (!timestamp || typeof timestamp !== 'number' || timestamp <= 0) {
      return false
    }

    const now = Date.now()
    const age = now - timestamp

    // Timestamp cannot be more than maxAgeMs old or in the future
    return age >= 0 && age <= maxAgeMs
  }

  /**
   * Validates message content for authentication
   */
  static isValidAuthMessage(message: string): boolean {
    if (!message || typeof message !== 'string') {
      return false
    }

    const trimmed = message.trim()
    return trimmed.length > 0 && trimmed.length <= AUTH_VALIDATION.MAX_MESSAGE_LENGTH
  }

  /**
   * Validates chain ID is a supported network
   */
  static isValidChainId(chainId: number, supportedChains: readonly number[] = SUPPORTED_CHAIN_IDS): boolean {
    if (!chainId || typeof chainId !== 'number') {
      return false
    }
    return supportedChains.includes(chainId)
  }

  /**
   * Validates signature format (hex string or Safe wallet token)
   */
  static isValidSignatureFormat(signature: string): boolean {
    if (!signature || typeof signature !== 'string') {
      return false
    }

    // Safe wallet authentication token format
    if (signature.startsWith(SIGNATURE_FORMATS.SAFE_WALLET_PREFIX)) {
      return signature.split(':').length === SIGNATURE_FORMATS.SAFE_TOKEN_PARTS // safe-wallet:address:nonce:timestamp
    }

    // Standard hex signature format
    return signature.startsWith(SIGNATURE_FORMATS.HEX_PREFIX) && signature.length >= AUTH_VALIDATION.MIN_SIGNATURE_LENGTH
  }

  /**
   * Validates authentication request parameters
   */
  static validateAuthRequest(params: { message?: string; nonce?: string; walletAddress?: string; timestamp?: number; chainId?: number }): {
    isValid: boolean
    errors: string[]
  } {
    const errors: string[] = []

    if (!this.isValidAuthMessage(params.message || '')) {
      errors.push('Invalid or missing message')
    }

    if (!this.isValidNonce(params.nonce || '')) {
      errors.push('Invalid or missing nonce')
    }

    if (!this.isValidWalletAddress(params.walletAddress || '')) {
      errors.push('Invalid wallet address format')
    }

    if (!this.isValidTimestamp(params.timestamp || 0)) {
      errors.push('Invalid or expired timestamp')
    }

    if (params.chainId && !this.isValidChainId(params.chainId)) {
      errors.push('Unsupported chain ID')
    }

    return {
      isValid: errors.length === 0,
      errors,
    }
  }
}
