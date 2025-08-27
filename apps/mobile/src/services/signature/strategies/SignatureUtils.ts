import type { SignatureRequest, SignatureResult } from '@superpool/types'

/**
 * Utility functions for signature operations
 * Centralizes common logic used across different signature strategies
 */
export class SignatureUtils {
  /**
   * Creates a timeout promise that rejects after specified milliseconds
   */
  static createTimeoutPromise(timeoutMs: number, operation: string): Promise<never> {
    return new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${operation} timed out after ${timeoutMs / 1000} seconds`))
      }, timeoutMs)
    })
  }

  /**
   * Wraps a signature promise with timeout handling
   */
  static async withTimeout<T>(signaturePromise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
    const timeoutPromise = this.createTimeoutPromise(timeoutMs, operation)
    return await Promise.race([signaturePromise, timeoutPromise])
  }

  /**
   * Validates signature result format
   */
  static validateSignatureResult(signature: unknown): signature is string {
    if (typeof signature === 'object' || (typeof signature === 'string' && signature.includes('"error"'))) {
      return false
    }
    return typeof signature === 'string'
  }

  /**
   * Creates a Safe wallet authentication token
   */
  static createSafeAuthToken(request: SignatureRequest): string {
    return `safe-wallet:${request.walletAddress}:${request.nonce}:${request.timestamp}`
  }

  /**
   * Detects if an error indicates Safe wallet behavior
   */
  static isSafeWalletError(error: string): boolean {
    // Do NOT treat user rejection as Safe wallet - this is a user action, not a wallet limitation
    if (error.includes('User rejected') || error.includes('user denied')) {
      return false
    }

    return (
      error.includes('Method disabled') ||
      error.includes('safe://') ||
      error.includes('the method eth_signTypedData_v4 does not exist') ||
      error.includes('Method not supported') ||
      error.includes('eth_signTypedData_v3 does not exist') ||
      error.includes('Personal sign not supported')
    )
  }

  /**
   * Validates signature format (hex or Safe token)
   */
  static isValidSignatureFormat(signature: string): boolean {
    const isSafeToken = signature.startsWith('safe-wallet:')
    const isValidHex = signature.startsWith('0x') && signature.length >= 10
    return isSafeToken || isValidHex
  }

  /**
   * Logs signature preview for debugging (safe for production)
   */
  static logSignaturePreview(signature: string, type: string): void {
    const preview = signature.substring(0, 10) + '...'
    console.log(`✅ ${type} signature successful:`, typeof signature, preview)
  }
}
