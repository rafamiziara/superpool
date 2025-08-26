/**
 * Timeout and timing utilities for service layer operations
 * Provides consistent timeout handling and delay functionality
 */
export class TimeoutUtils {
  /**
   * Wraps a promise with a timeout that rejects after specified milliseconds
   */
  static withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    operation: string = 'Operation'
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${operation} timed out after ${timeoutMs / 1000} seconds`))
      }, timeoutMs)
    })

    return Promise.race([promise, timeoutPromise])
  }

  /**
   * Creates a delay promise that resolves after specified milliseconds
   */
  static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Creates a timeout with cleanup functionality
   */
  static createTimeout(callback: () => void, ms: number): number {
    return setTimeout(callback, ms) as unknown as number
  }

  /**
   * Safe timeout cleanup that handles undefined/null timeout IDs
   */
  static clearTimeout(timeoutId?: number | null): void {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }

  /**
   * Retry operation with exponential backoff
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelayMs: number = 1000,
    operationName: string = 'Operation'
  ): Promise<T> {
    let lastError: Error

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 ${operationName} attempt ${attempt}/${maxRetries}`)
        return await operation()
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        console.error(`❌ ${operationName} attempt ${attempt}/${maxRetries} failed:`, lastError.message)

        if (attempt < maxRetries) {
          const delayMs = baseDelayMs * attempt // Linear backoff: 1s, 2s, 3s
          console.log(`⏳ Retrying ${operationName} in ${delayMs}ms...`)
          await this.delay(delayMs)
        }
      }
    }

    throw new Error(`${operationName} failed after ${maxRetries} attempts: ${lastError!.message}`)
  }

  /**
   * Standard timeout values for different operations
   */
  static readonly TIMEOUTS = {
    // Signature timeouts
    PERSONAL_SIGN: 15000,        // 15s for regular wallets
    TYPED_DATA_SIGN: 15000,      // 15s for EIP-712 signing  
    SAFE_WALLET_SIGN: 20000,     // 20s for Safe wallets

    // Network timeouts
    FIREBASE_CALL: 10000,        // 10s for Firebase function calls
    SESSION_CLEANUP: 15000,      // 15s for session cleanup operations
    
    // UI feedback timeouts
    SUCCESS_TOAST: 3000,         // 3s for success messages
    ERROR_TOAST_IMMEDIATE: 0,    // Immediate error display
    ERROR_TOAST_AFTER_DISCONNECT: 2000, // 2s delay after disconnect
    ERROR_TOAST_USER_ACTION: 1500, // 1.5s delay for user actions

    // Connection timeouts
    WALLET_CONNECT: 30000,       // 30s for wallet connection
    AUTHENTICATION: 120000,      // 2 minutes for full auth flow
  } as const

  /**
   * Gets appropriate timeout for operation type
   */
  static getTimeoutForOperation(operation: keyof typeof TimeoutUtils.TIMEOUTS): number {
    return this.TIMEOUTS[operation]
  }

  /**
   * Checks if error is a timeout error
   */
  static isTimeoutError(error: Error): boolean {
    return error.message.includes('timed out') || error.message.includes('timeout')
  }
}