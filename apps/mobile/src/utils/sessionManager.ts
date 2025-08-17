import AsyncStorage from '@react-native-async-storage/async-storage'

const WALLETCONNECT_SESSION_KEY = '@walletconnect/client0.3//session'
const REOWN_APPKIT_SESSION_KEY = '@reown/appkit'

export class SessionManager {
  static async clearAllWalletConnectSessions(): Promise<void> {
    try {
      console.log('Clearing all WalletConnect sessions...')
      
      // Get all AsyncStorage keys
      const allKeys = await AsyncStorage.getAllKeys()
      
      // Filter keys related to WalletConnect/Reown
      const walletConnectKeys = allKeys.filter(key => 
        key.includes('walletconnect') || 
        key.includes('wc@2') ||
        key.includes('reown') ||
        key.includes('appkit') ||
        key.includes('WALLETCONNECT') ||
        key.includes('WC_') ||
        key.startsWith('@walletconnect') ||
        key.startsWith('@reown')
      )
      
      console.log('Found WalletConnect keys to clear:', walletConnectKeys)
      
      // Clear all WalletConnect related keys
      if (walletConnectKeys.length > 0) {
        await AsyncStorage.multiRemove(walletConnectKeys)
        console.log(`Cleared ${walletConnectKeys.length} WalletConnect session keys`)
      }
      
      // Also clear specific known keys
      const specificKeys = [
        WALLETCONNECT_SESSION_KEY,
        REOWN_APPKIT_SESSION_KEY,
        'wagmi.store',
        'wagmi.cache',
        'reown.sessions',
        'wc.pairing',
        'wc.session'
      ]
      
      for (const key of specificKeys) {
        try {
          await AsyncStorage.removeItem(key)
        } catch (error) {
          // Ignore errors for non-existent keys
        }
      }
      
      console.log('Successfully cleared all WalletConnect sessions')
      
    } catch (error) {
      console.error('Failed to clear WalletConnect sessions:', error)
      throw error
    }
  }

  static async getSessionDebugInfo(): Promise<{
    totalKeys: number
    walletConnectKeys: string[]
    sessionData: Record<string, any>
  }> {
    try {
      const allKeys = await AsyncStorage.getAllKeys()
      const walletConnectKeys = allKeys.filter(key => 
        key.includes('walletconnect') || 
        key.includes('wc@2') ||
        key.includes('reown') ||
        key.includes('appkit') ||
        key.includes('WALLETCONNECT') ||
        key.includes('WC_') ||
        key.startsWith('@walletconnect') ||
        key.startsWith('@reown')
      )
      
      const sessionData: Record<string, any> = {}
      
      // Get data for each WalletConnect key (for debugging)
      for (const key of walletConnectKeys.slice(0, 5)) { // Limit to first 5 for performance
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
        sessionData
      }
    } catch (error) {
      console.error('Failed to get session debug info:', error)
      return {
        totalKeys: 0,
        walletConnectKeys: [],
        sessionData: {}
      }
    }
  }

  static async clearSpecificSession(sessionId: string): Promise<void> {
    try {
      console.log(`Clearing specific session: ${sessionId}`)
      
      const allKeys = await AsyncStorage.getAllKeys()
      const sessionKeys = allKeys.filter(key => key.includes(sessionId))
      
      if (sessionKeys.length > 0) {
        await AsyncStorage.multiRemove(sessionKeys)
        console.log(`Cleared ${sessionKeys.length} keys for session ${sessionId}`)
      }
    } catch (error) {
      console.error(`Failed to clear session ${sessionId}:`, error)
      throw error
    }
  }

  static async hasValidSession(): Promise<boolean> {
    try {
      const debugInfo = await this.getSessionDebugInfo()
      
      // Check if we have any active WalletConnect sessions
      const hasActiveSession = debugInfo.walletConnectKeys.length > 0
      
      console.log('Session validation result:', {
        hasActiveSession,
        keyCount: debugInfo.walletConnectKeys.length,
        keys: debugInfo.walletConnectKeys.slice(0, 3) // Show first 3 for debugging
      })
      
      return hasActiveSession
    } catch (error) {
      console.error('Failed to validate session:', error)
      return false
    }
  }
}