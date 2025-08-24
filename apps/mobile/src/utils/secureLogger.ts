/**
 * Secure logging utility that prevents sensitive data exposure in production
 * and provides conditional logging based on environment
 */

interface LogLevel {
  DEBUG: 0
  INFO: 1
  WARN: 2
  ERROR: 3
}

const LOG_LEVELS: LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
}

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
    return str.replace(/0x[a-fA-F0-9]{40}/g, (match) => 
      `${match.substring(0, 6)}...${match.substring(match.length - 4)}`
    )
  }

  /**
   * Sanitizes objects recursively, masking sensitive keys
   */
  private sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
    const sensitiveKeys = [
      'signature', 'privateKey', 'mnemonic', 'seed', 'token', 'jwt', 
      'password', 'secret', 'key', 'auth', 'credential'
    ]
    
    const sanitized: Record<string, unknown> = {}
    
    for (const [key, value] of Object.entries(obj)) {
      const keyLower = key.toLowerCase()
      const isSensitive = sensitiveKeys.some(sensitiveKey => keyLower.includes(sensitiveKey))
      
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
      return args.map(arg => this.sanitizeData(arg))
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
}

// Export singleton instance
export const secureLogger = new SecureLogger()

// Export convenience functions
export const { debug, info, warn, error, devOnly } = secureLogger