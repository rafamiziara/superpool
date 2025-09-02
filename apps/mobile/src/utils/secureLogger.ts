import { LOG_LEVELS } from '../config/constants'

/**
 * Secure logging utility that prevents sensitive data exposure in production
 * and provides conditional logging based on environment
 */

class SecureLogger {
  private static isDevelopment = __DEV__
  private static minLogLevel = SecureLogger.isDevelopment ? LOG_LEVELS.DEBUG : LOG_LEVELS.WARN

  // Prevent instantiation
  private constructor() {}

  /**
   * Sanitizes potentially sensitive data for logging
   */
  private static sanitizeData(data: unknown): unknown {
    if (typeof data === 'string') {
      return SecureLogger.sanitizeString(data)
    }

    if (typeof data === 'object' && data !== null) {
      return SecureLogger.sanitizeObject(data as Record<string, unknown>)
    }

    return data
  }

  /**
   * Sanitizes sensitive strings (wallet addresses, signatures, tokens)
   */
  private static sanitizeString(str: string): string {
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
  private static sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
    const sensitiveKeys = ['signature', 'privateKey', 'mnemonic', 'seed', 'token', 'jwt', 'password', 'secret', 'key', 'auth', 'credential']

    const sanitized: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(obj)) {
      const keyLower = key.toLowerCase()
      const isSensitive = sensitiveKeys.some((sensitiveKey) => keyLower.includes(sensitiveKey))

      if (isSensitive) {
        sanitized[key] = '[REDACTED]'
      } else if (typeof value === 'string' && value.startsWith('0x') && value.length > 20) {
        // Likely a wallet address or signature
        sanitized[key] = SecureLogger.sanitizeString(value)
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = SecureLogger.sanitizeObject(value as Record<string, unknown>)
      } else {
        sanitized[key] = value
      }
    }

    return sanitized
  }

  /**
   * Formats arguments for secure logging
   */
  private static formatArgs(args: unknown[]): unknown[] {
    if (!SecureLogger.isDevelopment) {
      return args.map((arg) => SecureLogger.sanitizeData(arg))
    }
    return args
  }

  /**
   * Debug logging (only in development)
   */
  static debug(...args: unknown[]): void {
    if (SecureLogger.minLogLevel <= LOG_LEVELS.DEBUG) {
      const sanitizedArgs = SecureLogger.formatArgs(args)
      console.log('🐛 [DEBUG]', ...sanitizedArgs)
    }
  }

  /**
   * Info logging
   */
  static info(...args: unknown[]): void {
    if (SecureLogger.minLogLevel <= LOG_LEVELS.INFO) {
      const sanitizedArgs = SecureLogger.formatArgs(args)
      console.info('ℹ️ [INFO]', ...sanitizedArgs)
    }
  }

  /**
   * Warning logging
   */
  static warn(...args: unknown[]): void {
    if (SecureLogger.minLogLevel <= LOG_LEVELS.WARN) {
      const sanitizedArgs = SecureLogger.formatArgs(args)
      console.warn('⚠️ [WARN]', ...sanitizedArgs)
    }
  }

  /**
   * Error logging
   */
  static error(...args: unknown[]): void {
    if (SecureLogger.minLogLevel <= LOG_LEVELS.ERROR) {
      const sanitizedArgs = SecureLogger.formatArgs(args)
      console.error('❌ [ERROR]', ...sanitizedArgs)
    }
  }

  /**
   * Conditional logging based on development mode
   */
  static devOnly(...args: unknown[]): void {
    if (SecureLogger.isDevelopment) {
      const sanitizedArgs = SecureLogger.formatArgs(args)
      console.log('🛠️ [DEV]', ...sanitizedArgs)
    }
  }

  /**
   * Service-specific logging methods for enhanced security and context
   */

  /**
   * Safely logs wallet address with truncation for privacy
   */
  static logWalletAddress(address: string, context = ''): string {
    if (!address || address.length < 10) {
      return 'invalid-address'
    }
    const truncated = `${address.substring(0, 6)}...${address.slice(-4)}`
    return context ? `${context}: ${truncated}` : truncated
  }

  /**
   * Safely logs signature preview without exposing full signature content
   */
  static logSignaturePreview(signature: string, type = ''): void {
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
  static logAuthStep(step: string, status: 'start' | 'complete' | 'fail', details?: Record<string, string | number | boolean>): void {
    const timestamp = new Date().toISOString()
    const emoji = status === 'complete' ? '✅' : status === 'fail' ? '❌' : '🔄'
    const safeDetails = details ? SecureLogger.sanitizeData(details) : ''

    if (SecureLogger.minLogLevel <= LOG_LEVELS.INFO) {
      console.log(`${emoji} Auth ${step} ${status} [${timestamp}]`, safeDetails)
    }
  }

  /**
   * Logs service operation with context
   */
  static logServiceOperation(
    service: string,
    operation: string,
    status: 'start' | 'success' | 'error',
    details?: Record<string, string | number | boolean>
  ): void {
    const emoji = status === 'success' ? '✅' : status === 'error' ? '❌' : '🔄'
    const safeDetails = details ? SecureLogger.sanitizeData(details) : {}

    const logLevel = status === 'error' ? LOG_LEVELS.ERROR : LOG_LEVELS.INFO
    if (SecureLogger.minLogLevel <= logLevel) {
      const logMethod = status === 'error' ? console.error : console.log
      logMethod(`${emoji} [${service}] ${operation} ${status}`, safeDetails)
    }
  }

  /**
   * Logs error with service context but sanitizes sensitive information
   */
  static logServiceError(service: string, operation: string, error: unknown, context?: Record<string, string | number | boolean>): void {
    if (SecureLogger.minLogLevel <= LOG_LEVELS.ERROR) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const safeContext = context ? SecureLogger.sanitizeData(context) : {}

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
  static logRecoveryAction(action: string, result: Record<string, string | number | boolean>, context?: string): void {
    if (SecureLogger.minLogLevel <= LOG_LEVELS.INFO) {
      const prefix = context ? `🔄 [${context}] Recovery:` : '🔄 Recovery:'
      const safeResult = SecureLogger.sanitizeData(result)
      console.log(`${prefix} ${action}`, safeResult)
    }
  }

  /**
   * Creates a consistent log context for service operations
   */
  static createServiceContext(service: string, operation: string, additionalContext?: Record<string, string | number | boolean>): string {
    const timestamp = new Date().toISOString()
    const base = `[${service}:${operation}] ${timestamp}`

    if (additionalContext) {
      const safeContext = SecureLogger.sanitizeData(additionalContext)
      return `${base} ${JSON.stringify(safeContext)}`
    }

    return base
  }
}

// Export the class for testing and as main interface
export { SecureLogger }

// Export convenience functions (aliases to static methods)
export const debug = SecureLogger.debug
export const info = SecureLogger.info
export const warn = SecureLogger.warn
export const error = SecureLogger.error
export const devOnly = SecureLogger.devOnly

// Export service-specific logging functions (aliases to static methods)
export const logWalletAddress = SecureLogger.logWalletAddress
export const logSignaturePreview = SecureLogger.logSignaturePreview
export const logAuthStep = SecureLogger.logAuthStep
export const logServiceOperation = SecureLogger.logServiceOperation
export const logServiceError = SecureLogger.logServiceError
export const logRecoveryAction = SecureLogger.logRecoveryAction
export const createServiceContext = SecureLogger.createServiceContext

// Export a secureLogger object for backwards compatibility
export const secureLogger = SecureLogger
