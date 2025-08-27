import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  RELAYER_ERROR_INDICATORS,
  REOWN_APPKIT_SESSION_KEY,
  SESSION_ERROR_INDICATORS,
  SESSION_ID_PATTERNS,
  SESSION_TIMEOUTS,
  WALLETCONNECT_SESSION_KEY,
} from './constants'

// Type definitions for session data
type SessionDataValue = string | number | boolean | null | object | undefined
type SessionData = Record<string, SessionDataValue>

interface SessionDebugInfo {
  totalKeys: number
  walletConnectKeys: string[]
  sessionData: SessionData
}

export class SessionManager {
  private static isCleanupInProgress = false
  private static cleanupQueue: Array<() => void> = []

  /**
   * Ensures only one cleanup operation runs at a time
   */
  private static async withCleanupLock<T>(operation: () => Promise<T>): Promise<T> {
    if (this.isCleanupInProgress) {
      console.log('🔒 Session cleanup already in progress, queuing operation...')
      return new Promise((resolve, reject) => {
        this.cleanupQueue.push(async () => {
          try {
            const result = await operation()
            resolve(result)
          } catch (error) {
            reject(error)
          }
        })
      })
    }

    this.isCleanupInProgress = true
    try {
      const result = await operation()

      // Process queued operations
      while (this.cleanupQueue.length > 0) {
        const queuedOperation = this.cleanupQueue.shift()
        if (queuedOperation) {
          try {
            await queuedOperation()
          } catch (error) {
            console.warn('⚠️ Queued session cleanup operation failed:', error)
          }
        }
      }

      return result
    } finally {
      this.isCleanupInProgress = false
    }
  }

  static async clearAllWalletConnectSessions(): Promise<void> {
    return this.withCleanupLock(async () => {
      try {
        console.log('🧹 Starting comprehensive WalletConnect session cleanup...')

        // Get all AsyncStorage keys
        const allKeys = await AsyncStorage.getAllKeys()

        // More comprehensive filter for WalletConnect/Reown related keys
        const walletConnectKeys = allKeys.filter((key) => {
          const lowerKey = key.toLowerCase()
          return (
            // Standard WalletConnect patterns
            lowerKey.includes('walletconnect') ||
            lowerKey.includes('wc@2') ||
            lowerKey.includes('reown') ||
            lowerKey.includes('appkit') ||
            lowerKey.includes('walletconnect') ||
            lowerKey.includes('wc_') ||
            lowerKey.startsWith('@walletconnect') ||
            lowerKey.startsWith('@reown') ||
            // Session-specific patterns
            lowerKey.includes('session') ||
            lowerKey.includes('pairing') ||
            lowerKey.includes('client') ||
            // Protocol patterns
            lowerKey.includes('wc:') ||
            lowerKey.includes('relay') ||
            // Storage patterns
            lowerKey.includes('wagmi') ||
            lowerKey.includes('viem') ||
            // AppKit specific
            lowerKey.includes('w3m') ||
            lowerKey.includes('modal')
          )
        })

        console.log(`Found ${walletConnectKeys.length} WalletConnect-related keys:`, walletConnectKeys.slice(0, 10))

        // Clear all WalletConnect related keys in batches
        if (walletConnectKeys.length > 0) {
          const batchSize = 20
          for (let i = 0; i < walletConnectKeys.length; i += batchSize) {
            const batch = walletConnectKeys.slice(i, i + batchSize)
            await AsyncStorage.multiRemove(batch)
            console.log(`Cleared batch ${Math.floor(i / batchSize) + 1}: ${batch.length} keys`)
          }
          console.log(`✅ Cleared ${walletConnectKeys.length} WalletConnect session keys`)
        }

        // Clear specific known problematic keys
        const specificKeys = [
          WALLETCONNECT_SESSION_KEY,
          REOWN_APPKIT_SESSION_KEY,
          'wagmi.store',
          'wagmi.cache',
          'wagmi.injected.shimConnected',
          'wagmi.wallet',
          'wagmi.connected',
          'reown.sessions',
          'wc.pairing',
          'wc.session',
          'wc.client',
          'w3m.wallet',
          'w3m.session',
          '@w3m/wallet_id',
          '@w3m/connected_wallet_image_url',
          '@walletconnect/universal_provider',
          '@walletconnect/ethereum_provider',
        ]

        console.log('🎯 Clearing specific known keys...')
        for (const key of specificKeys) {
          try {
            await AsyncStorage.removeItem(key)
          } catch {
            // Ignore errors for non-existent keys
          }
        }

        // Clear any keys containing the specific session ID from the error
        const sessionIdPattern = /[a-f0-9]{64}/g
        const keysWithSessionIds = allKeys.filter((key) => sessionIdPattern.test(key))
        if (keysWithSessionIds.length > 0) {
          console.log(`🔍 Found ${keysWithSessionIds.length} keys with session IDs, clearing...`)
          await AsyncStorage.multiRemove(keysWithSessionIds)
        }

        console.log('✅ Successfully completed comprehensive WalletConnect session cleanup')
      } catch (error) {
        console.error('❌ Failed to clear WalletConnect sessions:', error)
        throw error
      }
    })
  }

  static async getSessionDebugInfo(): Promise<SessionDebugInfo> {
    try {
      const allKeys = await AsyncStorage.getAllKeys()
      const walletConnectKeys = allKeys.filter(
        (key) =>
          key.includes('walletconnect') ||
          key.includes('wc@2') ||
          key.includes('reown') ||
          key.includes('appkit') ||
          key.includes('WALLETCONNECT') ||
          key.includes('WC_') ||
          key.startsWith('@walletconnect') ||
          key.startsWith('@reown')
      )

      const sessionData: SessionData = {}

      // Get data for each WalletConnect key (for debugging)
      for (const key of walletConnectKeys.slice(0, 5)) {
        // Limit to first 5 for performance
        try {
          const data = await AsyncStorage.getItem(key)
          sessionData[key] = data ? JSON.parse(data) : null
        } catch {
          sessionData[key] = 'Failed to parse'
        }
      }

      return {
        totalKeys: allKeys.length,
        walletConnectKeys,
        sessionData,
      }
    } catch (error) {
      console.error('Failed to get session debug info:', error)
      return {
        totalKeys: 0,
        walletConnectKeys: [],
        sessionData: {},
      }
    }
  }

  static async clearSpecificSession(sessionId: string): Promise<void> {
    return this.withCleanupLock(async () => {
      try {
        console.log(`Clearing specific session: ${sessionId}`)

        const allKeys = await AsyncStorage.getAllKeys()
        const sessionKeys = allKeys.filter((key) => key.includes(sessionId))

        if (sessionKeys.length > 0) {
          await AsyncStorage.multiRemove(sessionKeys)
          console.log(`Cleared ${sessionKeys.length} keys for session ${sessionId}`)
        }
      } catch (error) {
        console.error(`Failed to clear session ${sessionId}:`, error)
        throw error
      }
    })
  }

  static async hasValidSession(): Promise<boolean> {
    try {
      const debugInfo = await this.getSessionDebugInfo()

      // Check if we have any active WalletConnect sessions
      const hasActiveSession = debugInfo.walletConnectKeys.length > 0

      console.log('Session validation result:', {
        hasActiveSession,
        keyCount: debugInfo.walletConnectKeys.length,
        keys: debugInfo.walletConnectKeys.slice(0, 3), // Show first 3 for debugging
      })

      return hasActiveSession
    } catch (error) {
      console.error('Failed to validate session:', error)
      return false
    }
  }

  static async forceResetAllConnections(): Promise<void> {
    try {
      console.log('🔄 Force resetting all wallet connections...')

      // Clear all sessions
      await this.clearAllWalletConnectSessions()

      // Clear any remaining cache data
      await this.clearQueryCache()

      // Force reload app state (if needed)
      console.log('✅ All connections force reset completed')
    } catch (error) {
      console.error('❌ Failed to force reset connections:', error)
      throw error
    }
  }

  static async clearQueryCache(): Promise<void> {
    try {
      // Clear TanStack Query cache keys that might hold stale connection data
      const allKeys = await AsyncStorage.getAllKeys()
      const queryCacheKeys = allKeys.filter((key) => key.includes('react-query') || key.includes('tanstack') || key.includes('query-cache'))

      if (queryCacheKeys.length > 0) {
        await AsyncStorage.multiRemove(queryCacheKeys)
        console.log(`Cleared ${queryCacheKeys.length} query cache keys`)
      }
    } catch (error) {
      console.warn('Failed to clear query cache:', error)
    }
  }

  static async clearSessionByErrorId(sessionId: string): Promise<void> {
    return this.withCleanupLock(async () => {
      try {
        console.log(`🎯 Clearing sessions containing ID: ${sessionId}`)

        const allKeys = await AsyncStorage.getAllKeys()
        const sessionKeys = allKeys.filter((key) => key.includes(sessionId))

        if (sessionKeys.length > 0) {
          console.log(`Found ${sessionKeys.length} keys with session ID:`, sessionKeys)
          await AsyncStorage.multiRemove(sessionKeys)
          console.log(`✅ Cleared ${sessionKeys.length} keys for session ${sessionId}`)
        } else {
          console.log('No keys found with that session ID')
        }
      } catch (error) {
        console.error(`Failed to clear session ${sessionId}:`, error)
        throw error
      }
    })
  }

  static async preventiveSessionCleanup(): Promise<void> {
    return this.withCleanupLock(async () => {
      try {
        console.log('🛡️ Running preventive session cleanup before connection...')

        // More conservative cleanup - only target problematic keys, not all connections
        const allKeys = await AsyncStorage.getAllKeys()
        const walletConnectKeys = allKeys.filter((key) => key.includes('wc@2:') || key.includes('WalletConnect'))

        console.log(`Found ${walletConnectKeys.length} WalletConnect-related keys: ${JSON.stringify(walletConnectKeys.slice(0, 10))}`)

        // Only clear keys that are likely to cause "No matching key" errors
        const problematicPatterns = [
          'wc@2:core:0.3//expirer', // Expired sessions
          'wc@2:core:0.3//messages', // Stale messages
          'wc@2:core:0.3//history', // Old history
        ]

        const keysToRemove = walletConnectKeys.filter((key) => problematicPatterns.some((pattern) => key.includes(pattern)))

        if (keysToRemove.length > 0) {
          console.log(`🎯 Removing ${keysToRemove.length} potentially problematic keys...`)
          await AsyncStorage.multiRemove(keysToRemove)
          console.log(`✅ Cleared ${keysToRemove.length} problematic keys`)
        } else {
          console.log('✅ No problematic keys found, skipping cleanup')
        }

        // Light query cache cleanup only
        const queryCacheKeys = allKeys.filter((key) => key.includes('react-query') && key.includes('stale'))
        if (queryCacheKeys.length > 0) {
          await AsyncStorage.multiRemove(queryCacheKeys)
          console.log(`Cleared ${queryCacheKeys.length} stale query cache keys`)
        }

        console.log('✅ Preventive session cleanup completed')
      } catch (error) {
        console.error('❌ Preventive session cleanup failed:', error)
        throw error
      }
    })
  }

  static async handleSessionCorruption(sessionError: string): Promise<void> {
    try {
      console.log('🚨 Handling session corruption error...')

      // Extract session ID from error message if possible
      const sessionIdMatch = sessionError.match(/session: ([a-f0-9]{64})/)
      if (sessionIdMatch) {
        const corruptedSessionId = sessionIdMatch[1]
        console.log(`🎯 Found corrupted session ID: ${corruptedSessionId}`)
        await this.clearSessionByErrorId(corruptedSessionId)
      }

      // Full session cleanup
      await this.forceResetAllConnections()

      console.log('✅ Session corruption handled')
    } catch (error) {
      console.error('❌ Failed to handle session corruption:', error)
    }
  }

  static detectSessionCorruption(error: string): boolean {
    if (!error || typeof error !== 'string') {
      return false
    }

    return (
      error.includes('Missing or invalid. Record was recently deleted') ||
      error.includes('session:') ||
      error.includes('WalletConnect session') ||
      error.includes('No matching key') ||
      error.includes('pairing')
    )
  }

  /**
   * Session Analysis Utilities
   * Enhanced session analysis and validation functions
   */

  /**
   * Extracts session ID from error message using regex patterns
   */
  static extractSessionId(errorMessage: string): string | undefined {
    // Try different session ID patterns
    for (const pattern of SESSION_ID_PATTERNS) {
      const match = errorMessage.match(pattern)
      if (match && match[1]) {
        return match[1]
      }
    }

    return undefined
  }

  /**
   * Checks if error message indicates a session-related issue
   */
  static isSessionError(errorMessage: string): boolean {
    const lowerMessage = errorMessage.toLowerCase()
    return SESSION_ERROR_INDICATORS.some((indicator) => lowerMessage.includes(indicator.toLowerCase()))
  }

  /**
   * Checks if error indicates a WalletConnect relayer issue
   */
  static isRelayerError(errorMessage: string): boolean {
    const lowerMessage = errorMessage.toLowerCase()
    return RELAYER_ERROR_INDICATORS.some((indicator) => lowerMessage.includes(indicator.toLowerCase()))
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
   * Validates session object structure
   */
  static isValidSession(session: any): boolean {
    if (!session || typeof session !== 'object') {
      return false
    }

    // Check for required WalletConnect session properties
    const requiredProps = ['topic', 'peer', 'namespaces']
    return requiredProps.every((prop) => prop in session)
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
   * Calculates session age and expiry status
   */
  static getSessionAge(session: any): { ageMs: number; isExpired: boolean; expiryMs?: number } {
    if (!this.isValidSession(session)) {
      return { ageMs: 0, isExpired: true }
    }

    const now = Date.now()
    const expiry = session.expiry ? session.expiry * 1000 : null // Convert to ms

    if (expiry) {
      const ageMs = now - (expiry - 7 * 24 * 60 * 60 * 1000) // Assume 7 day sessions
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
  static shouldCleanupSession(session: any, maxAgeMs: number = SESSION_TIMEOUTS.DEFAULT_MAX_AGE): boolean {
    // 24 hours default
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

  /**
   * Creates session cleanup context for logging
   */
  static createCleanupContext(operation: string, sessionCount: number, errors: string[] = []): Record<string, any> {
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
   * Generates enhanced session debug information string
   */
  static formatSessionDebugInfo(sessions: any[], totalKeys: number): string {
    const sessionCount = sessions.length
    const hasActiveSessions = sessionCount > 0

    return [
      'Session Debug Info:',
      `- Total keys: ${totalKeys}`,
      `- Active sessions: ${sessionCount}`,
      `- Has active connections: ${hasActiveSessions}`,
      `- Session preview: ${sessions
        .slice(0, 2)
        .map((s) => s?.topic?.substring(0, 8) || 'unknown')
        .join(', ')}`,
    ].join('\n')
  }
}
