import { SignatureRequest } from '@superpool/types'

/**
 * Authentication utilities for common auth operations
 * Provides helper functions used across authentication services
 */
export class AuthUtils {
  /**
   * Generates a secure random nonce for authentication
   */
  static generateNonce(length: number = 32): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''

    for (let i = 0; i < length; i++) {
      result += charset.charAt(Math.floor(Math.random() * charset.length))
    }

    return result
  }

  /**
   * Creates a Safe wallet authentication token
   */
  static createSafeAuthToken(walletAddress: string, nonce: string, timestamp: number): string {
    return `safe-wallet:${walletAddress}:${nonce}:${timestamp}`
  }

  /**
   * Parses Safe wallet authentication token
   */
  static parseSafeAuthToken(token: string): { walletAddress: string; nonce: string; timestamp: number } | null {
    if (!token.startsWith('safe-wallet:')) {
      return null
    }

    const parts = token.split(':')
    if (parts.length !== 4) {
      return null
    }

    const [, walletAddress, nonce, timestampStr] = parts
    const timestamp = parseInt(timestampStr, 10)

    if (isNaN(timestamp)) {
      return null
    }

    return { walletAddress, nonce, timestamp }
  }

  /**
   * Creates standardized authentication message content
   */
  static createAuthMessage(walletAddress: string, nonce: string, timestamp: number): string {
    return [
      'Welcome to SuperPool!',
      '',
      'Please sign this message to authenticate your wallet.',
      'This will not trigger a blockchain transaction or cost any gas fees.',
      '',
      `Wallet: ${walletAddress}`,
      `Nonce: ${nonce}`,
      `Timestamp: ${timestamp}`,
    ].join('\\n')
  }

  /**
   * Validates authentication message format
   */
  static validateAuthMessageFormat(message: string, expectedWallet: string): boolean {
    if (!message || !expectedWallet) {
      return false
    }

    return (
      message.includes('Welcome to SuperPool') &&
      message.includes(`Wallet: ${expectedWallet}`) &&
      message.includes('Nonce:') &&
      message.includes('Timestamp:')
    )
  }

  /**
   * Extracts nonce from authentication message
   */
  static extractNonceFromMessage(message: string): string | null {
    const nonceMatch = message.match(/Nonce:\s*([a-zA-Z0-9_]+)/)
    return nonceMatch ? nonceMatch[1] : null
  }

  /**
   * Extracts timestamp from authentication message
   */
  static extractTimestampFromMessage(message: string): number | null {
    const timestampMatch = message.match(/Timestamp:\s*(\d+)/)
    return timestampMatch ? parseInt(timestampMatch[1], 10) : null
  }

  /**
   * Creates EIP-712 typed data structure for authentication
   */
  static createEip712TypedData(request: SignatureRequest) {
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
   * Checks if signature is a Safe wallet token format
   */
  static isSafeWalletSignature(signature: string): boolean {
    return signature.startsWith('safe-wallet:') && signature.split(':').length === 4
  }

  /**
   * Checks if signature is a hex format
   */
  static isHexSignature(signature: string): boolean {
    return signature.startsWith('0x') && signature.length >= 10 && /^0x[a-fA-F0-9]+$/.test(signature)
  }

  /**
   * Determines signature type from signature content
   */
  static determineSignatureType(signature: string): 'safe-wallet' | 'hex' | 'unknown' {
    if (this.isSafeWalletSignature(signature)) {
      return 'safe-wallet'
    }
    if (this.isHexSignature(signature)) {
      return 'hex'
    }
    return 'unknown'
  }

  /**
   * Creates authentication request object
   */
  static createAuthRequest(walletAddress: string, chainId?: number, customNonce?: string): SignatureRequest {
    const nonce = customNonce || this.generateNonce()
    const timestamp = Date.now()
    const message = this.createAuthMessage(walletAddress, nonce, timestamp)

    return {
      walletAddress,
      chainId,
      message,
      nonce,
      timestamp,
    }
  }

  /**
   * Calculates time since authentication attempt
   */
  static getAuthAge(timestamp: number): {
    ageMs: number
    ageSeconds: number
    isExpired: boolean
  } {
    const now = Date.now()
    const ageMs = now - timestamp
    const ageSeconds = Math.floor(ageMs / 1000)
    const isExpired = ageMs > 600000 // 10 minutes

    return { ageMs, ageSeconds, isExpired }
  }

  /**
   * Formats authentication context for logging
   */
  static formatAuthContext(request: SignatureRequest): Record<string, string | number> {
    const age = this.getAuthAge(request.timestamp)
    return {
      walletPreview: request.walletAddress.substring(0, 6) + '...' + request.walletAddress.slice(-4),
      messageLength: request.message.length,
      messagePreview: request.message.substring(0, 50) + '...',
      chainId: request.chainId || 1,
      nonceLength: request.nonce.length,
      timestamp: request.timestamp,
      ageSeconds: age.ageSeconds,
    }
  }
}
