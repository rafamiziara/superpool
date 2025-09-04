/**
 * Retry policies for authentication operations
 * Implements intelligent retry strategies based on error types
 */

export interface RetryPolicy {
  maxRetries: number
  retryDelayMs: number
  backoffMultiplier: number
  retryableErrors: string[]
  fatalErrors: string[]
  name: string
}

export interface RetryContext {
  attempt: number
  totalAttempts: number
  lastError: Error
  elapsedTime: number
}

export interface RetryResult<T> {
  success: boolean
  result?: T
  error?: Error
  attemptsMade: number
  totalTime: number
  policyUsed: string
}

/**
 * Error categories for authentication retry logic
 */
export enum ErrorCategory {
  RECOVERABLE = 'recoverable',
  FATAL = 'fatal',
  NETWORK = 'network',
  AUTHENTICATION = 'authentication',
  RATE_LIMIT = 'rate_limit',
  TIMEOUT = 'timeout',
}

/**
 * Pre-defined retry policies for different scenarios
 */
export class RetryPolicies {
  /**
   * Conservative policy for Safe wallets - fewer retries, longer delays
   */
  static readonly SAFE_WALLET_POLICY: RetryPolicy = {
    name: 'safe-wallet',
    maxRetries: 2,
    retryDelayMs: 2000,
    backoffMultiplier: 1.5,
    retryableErrors: ['network', 'timeout', 'internal', 'temporarily', 'rate-limit'],
    fatalErrors: ['invalid-token', 'expired-token', 'invalid-credential', 'user-disabled', 'permission-denied'],
  }

  /**
   * Standard policy for regular wallets - balanced approach
   */
  static readonly STANDARD_WALLET_POLICY: RetryPolicy = {
    name: 'standard-wallet',
    maxRetries: 3,
    retryDelayMs: 1000,
    backoffMultiplier: 2.0,
    retryableErrors: ['network', 'timeout', 'internal', 'temporarily', 'rate-limit', 'unavailable'],
    fatalErrors: ['invalid-token', 'expired-token', 'invalid-credential', 'user-disabled', 'permission-denied', 'invalid-argument'],
  }

  /**
   * Network-focused policy for connection issues
   */
  static readonly NETWORK_POLICY: RetryPolicy = {
    name: 'network-focused',
    maxRetries: 4,
    retryDelayMs: 500,
    backoffMultiplier: 2.0,
    retryableErrors: ['network', 'timeout', 'offline', 'connection', 'unreachable'],
    fatalErrors: ['invalid-token', 'expired-token', 'invalid-credential', 'permission-denied'],
  }

  /**
   * Fail-fast policy - minimal retries for quick feedback
   */
  static readonly FAIL_FAST_POLICY: RetryPolicy = {
    name: 'fail-fast',
    maxRetries: 1,
    retryDelayMs: 500,
    backoffMultiplier: 1.0,
    retryableErrors: ['timeout', 'network'],
    fatalErrors: [
      'invalid-token',
      'expired-token',
      'invalid-credential',
      'user-disabled',
      'permission-denied',
      'invalid-argument',
      'internal',
      'app-check',
    ],
  }

  /**
   * Get appropriate policy based on wallet type and context
   */
  static getPolicyForWallet(signatureType: string, context?: { isFirstAttempt?: boolean }): RetryPolicy {
    if (signatureType === 'safe-wallet') {
      return this.SAFE_WALLET_POLICY
    }

    // Use fail-fast for first attempts to get quick feedback
    if (context?.isFirstAttempt) {
      return this.FAIL_FAST_POLICY
    }

    return this.STANDARD_WALLET_POLICY
  }

  /**
   * Get policy based on error type
   */
  static getPolicyForError(error: Error): RetryPolicy {
    const errorMessage = error.message.toLowerCase()

    if (errorMessage.includes('network') || errorMessage.includes('connection')) {
      return this.NETWORK_POLICY
    }

    if (errorMessage.includes('rate') || errorMessage.includes('limit')) {
      return {
        ...this.STANDARD_WALLET_POLICY,
        retryDelayMs: 5000, // Longer delay for rate limits
        name: 'rate-limit-policy',
      }
    }

    return this.STANDARD_WALLET_POLICY
  }
}

/**
 * Categorizes errors for appropriate handling
 */
export class ErrorCategorizer {
  /**
   * Categorize error based on message and type
   */
  static categorizeError(error: Error): ErrorCategory {
    const errorMessage = error.message.toLowerCase()

    // Fatal errors that should not be retried
    if (
      errorMessage.includes('invalid-token') ||
      errorMessage.includes('expired-token') ||
      errorMessage.includes('invalid-credential') ||
      errorMessage.includes('user-disabled') ||
      errorMessage.includes('permission-denied')
    ) {
      return ErrorCategory.FATAL
    }

    // Rate limiting errors
    if (errorMessage.includes('rate') && errorMessage.includes('limit')) {
      return ErrorCategory.RATE_LIMIT
    }

    // Timeout errors (check before network to avoid false positive)
    if (errorMessage.includes('timeout')) {
      return ErrorCategory.TIMEOUT
    }

    // Network-related errors
    if (errorMessage.includes('network') || errorMessage.includes('connection') || errorMessage.includes('offline')) {
      return ErrorCategory.NETWORK
    }

    // Authentication-specific errors
    if (errorMessage.includes('auth') || errorMessage.includes('sign') || errorMessage.includes('token')) {
      return ErrorCategory.AUTHENTICATION
    }

    // Default to recoverable for unknown errors
    return ErrorCategory.RECOVERABLE
  }

  /**
   * Determine if error should be retried based on policy
   */
  static shouldRetry(error: Error, policy: RetryPolicy): boolean {
    const errorMessage = error.message.toLowerCase()

    // Check for fatal errors first
    for (const fatalError of policy.fatalErrors) {
      if (errorMessage.includes(fatalError.toLowerCase())) {
        return false
      }
    }

    // Check for retryable errors
    for (const retryableError of policy.retryableErrors) {
      if (errorMessage.includes(retryableError.toLowerCase())) {
        return true
      }
    }

    // Default behavior based on error category
    const category = this.categorizeError(error)
    return category === ErrorCategory.RECOVERABLE || category === ErrorCategory.NETWORK || category === ErrorCategory.TIMEOUT
  }

  /**
   * Get user-friendly error message based on category
   */
  static getUserFriendlyMessage(error: Error): string {
    const category = this.categorizeError(error)

    switch (category) {
      case ErrorCategory.FATAL:
        return 'Authentication failed. Please check your credentials and try again.'

      case ErrorCategory.NETWORK:
        return 'Network connection issue. Please check your internet connection and try again.'

      case ErrorCategory.RATE_LIMIT:
        return 'Too many attempts. Please wait a moment and try again.'

      case ErrorCategory.TIMEOUT:
        return 'Request timed out. Please try again.'

      case ErrorCategory.AUTHENTICATION:
        return 'Authentication error. Please try signing again.'

      default:
        return 'An unexpected error occurred. Please try again.'
    }
  }
}

/**
 * Retry executor that implements retry logic with policies
 */
export class RetryExecutor {
  /**
   * Execute function with retry policy
   */
  static async executeWithRetry<T>(
    fn: () => Promise<T>,
    policy: RetryPolicy,
    context?: {
      onRetry?: (context: RetryContext) => void
      signal?: AbortSignal
    }
  ): Promise<RetryResult<T>> {
    const startTime = Date.now()
    let lastError: Error = new Error('Unknown error')
    let actualAttempts = 0

    for (let attempt = 1; attempt <= policy.maxRetries + 1; attempt++) {
      actualAttempts = attempt
      // Check for abort signal
      if (context?.signal?.aborted) {
        throw new Error('Operation aborted')
      }

      try {
        const result = await fn()
        return {
          success: true,
          result,
          attemptsMade: attempt,
          totalTime: Date.now() - startTime,
          policyUsed: policy.name,
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        // Don't retry if this is the last attempt
        if (attempt > policy.maxRetries) {
          break
        }

        // Check if error should be retried
        if (!ErrorCategorizer.shouldRetry(lastError, policy)) {
          console.log(`🚫 Fatal error detected, not retrying: ${lastError.message}`)
          break
        }

        // Calculate delay with backoff
        const delay = policy.retryDelayMs * Math.pow(policy.backoffMultiplier, attempt - 1)

        console.log(`🔄 Retry ${attempt}/${policy.maxRetries} after ${delay}ms delay (${policy.name})`)

        // Notify retry callback
        context?.onRetry?.({
          attempt,
          totalAttempts: policy.maxRetries + 1,
          lastError,
          elapsedTime: Date.now() - startTime,
        })

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }

    return {
      success: false,
      error: lastError,
      attemptsMade: actualAttempts,
      totalTime: Date.now() - startTime,
      policyUsed: policy.name,
    }
  }
}
