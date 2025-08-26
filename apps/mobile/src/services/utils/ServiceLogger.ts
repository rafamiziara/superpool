/**
 * Service-layer logging utilities with security and privacy controls
 * Provides consistent logging patterns while protecting sensitive information
 */
export class ServiceLogger {
  /**
   * Safely logs wallet address with truncation for privacy
   */
  static logWalletAddress(address: string, context: string = ''): string {
    if (!address || address.length < 10) {
      return 'invalid-address'
    }
    const truncated = `${address.substring(0, 6)}...${address.slice(-4)}`
    return context ? `${context}: ${truncated}` : truncated
  }

  /**
   * Safely logs signature preview without exposing full signature content
   */
  static logSignaturePreview(signature: string, type: string = ''): void {
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
  static logAuthStep(
    step: string,
    status: 'start' | 'complete' | 'fail',
    details?: Record<string, any>
  ): void {
    const timestamp = new Date().toISOString()
    const emoji = status === 'complete' ? '✅' : status === 'fail' ? '❌' : '🔄'
    
    console.log(`${emoji} Auth ${step} ${status} [${timestamp}]`, details || '')
  }

  /**
   * Logs service operation with context
   */
  static logServiceOperation(
    service: string,
    operation: string,
    status: 'start' | 'success' | 'error',
    details?: Record<string, any>
  ): void {
    const emoji = status === 'success' ? '✅' : status === 'error' ? '❌' : '🔄'
    const safeDetails = details ? this.sanitizeLogDetails(details) : {}
    
    console.log(`${emoji} [${service}] ${operation} ${status}`, safeDetails)
  }

  /**
   * Logs error with context but sanitizes sensitive information
   */
  static logError(
    service: string,
    operation: string,
    error: unknown,
    context?: Record<string, any>
  ): void {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const safeContext = context ? this.sanitizeLogDetails(context) : {}
    
    console.error(`❌ [${service}] ${operation} failed:`, {
      error: errorMessage,
      context: safeContext,
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Logs recovery action with result
   */
  static logRecoveryAction(
    action: string,
    result: Record<string, any>,
    context?: string
  ): void {
    const prefix = context ? `🔄 [${context}] Recovery:` : '🔄 Recovery:'
    console.log(`${prefix} ${action}`, result)
  }

  /**
   * Sanitizes log details to remove sensitive information
   */
  private static sanitizeLogDetails(details: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {}
    
    for (const [key, value] of Object.entries(details)) {
      // Sanitize known sensitive fields
      if (this.isSensitiveField(key)) {
        sanitized[key] = this.sanitizeValue(key, value)
      } else {
        sanitized[key] = value
      }
    }
    
    return sanitized
  }

  /**
   * Checks if a field contains sensitive information
   */
  private static isSensitiveField(fieldName: string): boolean {
    const sensitiveFields = [
      'signature',
      'privateKey',
      'mnemonic',
      'password',
      'token',
      'secret',
      'key',
      'walletAddress',
      'address',
    ]
    
    const lowerField = fieldName.toLowerCase()
    return sensitiveFields.some(sensitive => lowerField.includes(sensitive))
  }

  /**
   * Sanitizes sensitive values for logging
   */
  private static sanitizeValue(fieldName: string, value: any): string {
    if (!value) return 'empty'
    
    const fieldLower = fieldName.toLowerCase()
    
    if (fieldLower.includes('address') && typeof value === 'string') {
      return this.logWalletAddress(value)
    }
    
    if (fieldLower.includes('signature') && typeof value === 'string') {
      if (value.startsWith('safe-wallet:')) {
        return `safe-wallet-token(${value.length})`
      }
      return `signature(${value.length})`
    }
    
    if (typeof value === 'string' && value.length > 10) {
      return `${value.substring(0, 6)}***`
    }
    
    return '[SANITIZED]'
  }

  /**
   * Creates a consistent log context for service operations
   */
  static createContext(
    service: string,
    operation: string,
    additionalContext?: Record<string, any>
  ): string {
    const timestamp = new Date().toISOString()
    const base = `[${service}:${operation}] ${timestamp}`
    
    if (additionalContext) {
      const safeContext = this.sanitizeLogDetails(additionalContext)
      return `${base} ${JSON.stringify(safeContext)}`
    }
    
    return base
  }
}