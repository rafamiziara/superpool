import AsyncStorage from '@react-native-async-storage/async-storage'

const WALLETCONNECT_SESSION_KEY = '@walletconnect/client0.3//session'
const REOWN_APPKIT_SESSION_KEY = '@reown/appkit'

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
          } catch (error) {
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
        } catch (error) {
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
}
