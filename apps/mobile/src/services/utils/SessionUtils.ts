/**
 * Session management utilities for WalletConnect and authentication state
 * Provides common session-related helper functions
 */
export class SessionUtils {
  /**
   * Extracts session ID from error message using regex patterns
   */
  static extractSessionId(errorMessage: string): string | null {
    // Try different session ID patterns
    const patterns = [
      /session:\s*([a-f0-9]{64})/i,           // session: followed by 64 hex chars
      /session_([a-f0-9]{64})/i,              // session_ followed by 64 hex chars  
      /"session":\s*"([a-f0-9]{64})"/i,       // JSON format with session key
      /sessionId[=:]\s*([a-f0-9]{64})/i,      // sessionId= or sessionId: format
    ]

    for (const pattern of patterns) {
      const match = errorMessage.match(pattern)
      if (match && match[1]) {
        return match[1]
      }
    }

    return null
  }

  /**
   * Checks if error message indicates a session-related issue
   */
  static isSessionError(errorMessage: string): boolean {
    const sessionErrorIndicators = [
      'No matching key',
      'session:',
      'pairing',
      'WalletConnect',
      'relayer',
      'expired session',
      'invalid session',
      'session not found',
      'session timeout',
    ]

    const lowerMessage = errorMessage.toLowerCase()
    return sessionErrorIndicators.some(indicator => 
      lowerMessage.includes(indicator.toLowerCase())
    )
  }

  /**
   * Checks if error indicates a WalletConnect relayer issue
   */
  static isRelayerError(errorMessage: string): boolean {
    const relayerIndicators = [
      'relayer',
      'websocket',
      'connection failed',
      'network error',
      'timeout',
      'disconnected',
    ]

    const lowerMessage = errorMessage.toLowerCase()
    return relayerIndicators.some(indicator =>
      lowerMessage.includes(indicator.toLowerCase())
    )
  }

  /**
   * Categorizes session error type for appropriate handling
   */
  static categorizeSessionError(errorMessage: string): {
    type: 'session' | 'relayer' | 'pairing' | 'timeout' | 'unknown'
    sessionId?: string
    severity: 'low' | 'medium' | 'high'
  } {
    const sessionId = this.extractSessionId(errorMessage)
    const lowerMessage = errorMessage.toLowerCase()

    if (lowerMessage.includes('pairing')) {
      return { type: 'pairing', sessionId, severity: 'medium' }
    }

    if (lowerMessage.includes('timeout') || lowerMessage.includes('expired')) {
      return { type: 'timeout', sessionId, severity: 'low' }
    }

    if (this.isRelayerError(errorMessage)) {
      return { type: 'relayer', sessionId, severity: 'high' }
    }

    if (this.isSessionError(errorMessage)) {
      return { type: 'session', sessionId, severity: 'medium' }
    }

    return { type: 'unknown', sessionId, severity: 'low' }
  }

  /**
   * Generates session debug information string
   */
  static formatSessionDebugInfo(sessions: any[], totalKeys: number): string {
    const sessionCount = sessions.length
    const hasActiveSessions = sessionCount > 0
    
    return [
      `Session Debug Info:`,
      `- Total keys: ${totalKeys}`,
      `- Active sessions: ${sessionCount}`,
      `- Has active connections: ${hasActiveSessions}`,
      `- Session preview: ${sessions.slice(0, 2).map(s => s?.topic?.substring(0, 8) || 'unknown').join(', ')}`,
    ].join('\\n')
  }

  /**
   * Validates session object structure
   */
  static isValidSession(session: any): boolean {
    if (!session || typeof session !== 'object') {
      return false
    }

    // Check for required WalletConnect session properties
    const requiredProps = ['topic', 'peer', 'namespaces']
    return requiredProps.every(prop => prop in session)
  }

  /**
   * Extracts peer information from session
   */
  static extractPeerInfo(session: any): { name?: string; url?: string; icons?: string[] } {
    if (!this.isValidSession(session) || !session.peer) {
      return {}
    }

    const { metadata } = session.peer
    if (!metadata) {
      return {}
    }

    return {
      name: metadata.name,
      url: metadata.url,
      icons: metadata.icons,
    }
  }

  /**
   * Creates session cleanup context for logging
   */
  static createCleanupContext(
    operation: string,
    sessionCount: number,
    errors: string[] = []
  ): Record<string, any> {
    return {
      operation,
      sessionCount,
      hasErrors: errors.length > 0,
      errorCount: errors.length,
      errors: errors.slice(0, 3), // Limit error logging
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * Calculates session age and expiry status
   */
  static getSessionAge(session: any): { ageMs: number; isExpired: boolean; expiryMs?: number } {
    if (!this.isValidSession(session)) {
      return { ageMs: 0, isExpired: true }
    }

    const now = Date.now()
    const expiry = session.expiry ? session.expiry * 1000 : null // Convert to ms
    
    if (expiry) {
      const ageMs = now - (expiry - (7 * 24 * 60 * 60 * 1000)) // Assume 7 day sessions
      return {
        ageMs: Math.max(0, ageMs),
        isExpired: now > expiry,
        expiryMs: expiry,
      }
    }

    return { ageMs: 0, isExpired: false }
  }

  /**
   * Checks if session cleanup is needed based on age and activity
   */
  static shouldCleanupSession(session: any, maxAgeMs: number = 86400000): boolean { // 24 hours default
    if (!this.isValidSession(session)) {
      return true
    }

    const { ageMs, isExpired } = this.getSessionAge(session)
    
    return isExpired || ageMs > maxAgeMs
  }

  /**
   * Sanitizes session data for logging (removes sensitive information)
   */
  static sanitizeSessionForLogging(session: any): Record<string, any> {
    if (!this.isValidSession(session)) {
      return { invalid: true }
    }

    return {
      topic: session.topic?.substring(0, 16) + '...',
      peerName: session.peer?.metadata?.name || 'unknown',
      expiry: session.expiry,
      acknowledged: session.acknowledged,
      active: session.active,
      namespaceCount: Object.keys(session.namespaces || {}).length,
    }
  }
}