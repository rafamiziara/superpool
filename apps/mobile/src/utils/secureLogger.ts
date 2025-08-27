import { LOG_LEVELS } from './constants'

/**
 * Secure logging utility that prevents sensitive data exposure in production
 * and provides conditional logging based on environment
 */

class SecureLogger {
  private isDevelopment = __DEV__
  private minLogLevel = this.isDevelopment ? LOG_LEVELS.DEBUG : LOG_LEVELS.WARN

  /**
   * Sanitizes potentially sensitive data for logging
   */
  private sanitizeData(data: unknown): unknown {
    if (typeof data === 'string') {
      return this.sanitizeString(data)
    }

    if (typeof data === 'object' && data !== null) {
      return this.sanitizeObject(data as Record<string, unknown>)
    }

    return data
  }

  /**
   * Sanitizes sensitive strings (wallet addresses, signatures, tokens)
   */
  private sanitizeString(str: string): string {
    // Truncate long hex strings (signatures, tokens) but keep some for debugging
    if (str.length > 50 && /^0x[a-fA-F0-9]+$/.test(str)) {
      return `${str.substring(0, 10)}...[${str.length - 20} chars]...${str.substring(str.length - 10)}`
    }

    // Mask wallet addresses in text
    return str.replace(/0x[a-fA-F0-9]{40}/g, (match) => `${match.substring(0, 6)}...${match.substring(match.length - 4)}`)
  }

  /**
   * Sanitizes objects recursively, masking sensitive keys
   */
  private sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
    const sensitiveKeys = ['signature', 'privateKey', 'mnemonic', 'seed', 'token', 'jwt', 'password', 'secret', 'key', 'auth', 'credential']

    const sanitized: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(obj)) {
      const keyLower = key.toLowerCase()
      const isSensitive = sensitiveKeys.some((sensitiveKey) => keyLower.includes(sensitiveKey))

      if (isSensitive) {
        sanitized[key] = '[REDACTED]'
      } else if (typeof value === 'string' && value.startsWith('0x') && value.length > 20) {
        // Likely a wallet address or signature
        sanitized[key] = this.sanitizeString(value)
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeObject(value as Record<string, unknown>)
      } else {
        sanitized[key] = value
      }
    }

    return sanitized
  }

  /**
   * Formats arguments for secure logging
   */
  private formatArgs(args: unknown[]): unknown[] {
    if (!this.isDevelopment) {
      return args.map((arg) => this.sanitizeData(arg))
    }
    return args
  }

  /**
   * Debug logging (only in development)
   */
  debug(...args: unknown[]): void {
    if (this.minLogLevel <= LOG_LEVELS.DEBUG) {
      const sanitizedArgs = this.formatArgs(args)
      console.log('[DEBUG]', ...sanitizedArgs)
    }
  }

  /**
   * Info logging
   */
  info(...args: unknown[]): void {
    if (this.minLogLevel <= LOG_LEVELS.INFO) {
      const sanitizedArgs = this.formatArgs(args)
      console.log('[INFO]', ...sanitizedArgs)
    }
  }

  /**
   * Warning logging
   */
  warn(...args: unknown[]): void {
    if (this.minLogLevel <= LOG_LEVELS.WARN) {
      const sanitizedArgs = this.formatArgs(args)
      console.warn('[WARN]', ...sanitizedArgs)
    }
  }

  /**
   * Error logging
   */
  error(...args: unknown[]): void {
    if (this.minLogLevel <= LOG_LEVELS.ERROR) {
      const sanitizedArgs = this.formatArgs(args)
      console.error('[ERROR]', ...sanitizedArgs)
    }
  }

  /**
   * Conditional logging based on development mode
   */
  devOnly(...args: unknown[]): void {
    if (this.isDevelopment) {
      const sanitizedArgs = this.formatArgs(args)
      console.log('[DEV]', ...sanitizedArgs)
    }
  }

  /**
   * Service-specific logging methods for enhanced security and context
   */

  /**
   * Safely logs wallet address with truncation for privacy
   */
  logWalletAddress(address: string, context = ''): string {
    if (!address || address.length < 10) {
      return 'invalid-address'
    }
    const truncated = `${address.substring(0, 6)}...${address.slice(-4)}`
    return context ? `${context}: ${truncated}` : truncated
  }

  /**
   * Safely logs signature preview without exposing full signature content
   */
  logSignaturePreview(signature: string, type = ''): void {
    if (!signature) {
      console.log(`❌ ${type} signature: empty or invalid`)
      return
    }

    if (signature.startsWith('safe-wallet:')) {
      console.log(`✅ ${type} signature: Safe wallet token (${signature.length} chars)`)
    } else {
      const preview = signature.substring(0, 10) + '...'
      console.log(`✅ ${type} signature: ${typeof signature} ${preview} (${signature.length} chars)`)
    }
  }

  /**
   * Logs authentication step with timing information
   */
  logAuthStep(step: string, status: 'start' | 'complete' | 'fail', details?: Record<string, string | number | boolean>): void {
    const timestamp = new Date().toISOString()
    const emoji = status === 'complete' ? '✅' : status === 'fail' ? '❌' : '🔄'
    const safeDetails = details ? this.sanitizeData(details) : ''

    if (this.minLogLevel <= LOG_LEVELS.INFO) {
      console.log(`${emoji} Auth ${step} ${status} [${timestamp}]`, safeDetails)
    }
  }

  /**
   * Logs service operation with context
   */
  logServiceOperation(
    service: string,
    operation: string,
    status: 'start' | 'success' | 'error',
    details?: Record<string, string | number | boolean>
  ): void {
    const emoji = status === 'success' ? '✅' : status === 'error' ? '❌' : '🔄'
    const safeDetails = details ? this.sanitizeData(details) : {}

    const logLevel = status === 'error' ? LOG_LEVELS.ERROR : LOG_LEVELS.INFO
    if (this.minLogLevel <= logLevel) {
      const logMethod = status === 'error' ? console.error : console.log
      logMethod(`${emoji} [${service}] ${operation} ${status}`, safeDetails)
    }
  }

  /**
   * Logs error with service context but sanitizes sensitive information
   */
  logServiceError(service: string, operation: string, error: unknown, context?: Record<string, string | number | boolean>): void {
    if (this.minLogLevel <= LOG_LEVELS.ERROR) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const safeContext = context ? this.sanitizeData(context) : {}

      console.error(`❌ [${service}] ${operation} failed:`, {
        error: errorMessage,
        context: safeContext,
        timestamp: new Date().toISOString(),
      })
    }
  }

  /**
   * Logs recovery action with result
   */
  logRecoveryAction(action: string, result: Record<string, string | number | boolean>, context?: string): void {
    if (this.minLogLevel <= LOG_LEVELS.INFO) {
      const prefix = context ? `🔄 [${context}] Recovery:` : '🔄 Recovery:'
      const safeResult = this.sanitizeData(result)
      console.log(`${prefix} ${action}`, safeResult)
    }
  }

  /**
   * Creates a consistent log context for service operations
   */
  createServiceContext(service: string, operation: string, additionalContext?: Record<string, string | number | boolean>): string {
    const timestamp = new Date().toISOString()
    const base = `[${service}:${operation}] ${timestamp}`

    if (additionalContext) {
      const safeContext = this.sanitizeData(additionalContext)
      return `${base} ${JSON.stringify(safeContext)}`
    }

    return base
  }
}

// Export singleton instance
export const secureLogger = new SecureLogger()

// Export convenience functions (existing)
export const { debug, info, warn, error, devOnly } = secureLogger

// Export service-specific logging functions
export const {
  logWalletAddress,
  logSignaturePreview,
  logAuthStep,
  logServiceOperation,
  logServiceError,
  logRecoveryAction,
  createServiceContext,
} = secureLogger
