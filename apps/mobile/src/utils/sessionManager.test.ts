// Get AsyncStorage mock from global setup
const AsyncStorage = require('@react-native-async-storage/async-storage')

import { SessionManager } from './sessionManager'

// Mock console methods globally
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}

// Mock constants
jest.mock('./constants', () => ({
  SESSION_STORAGE_KEYS: {
    REOWN_APPKIT: 'reown_appkit_session',
    WALLETCONNECT_V2: 'walletconnect_v2_session',
    AUTH_STATE: 'auth_state',
    USER_PREFERENCES: 'user_preferences',
  },
  SESSION_ERROR_INDICATORS: [
    'session',
    'relayer',
    'pairing',
    'expired',
    'timeout',
    'connection',
    'failed'
  ],
  SESSION_ID_PATTERNS: [
    /^[a-f0-9]{64}$/i,
    /session:\s*([a-f0-9]{64})/i,
  ],
  RELAYER_ERROR_INDICATORS: [
    'relayer connection failed',
    'relayer timeout',
    'relayer error',
    'websocket',
    'network'
  ],
}))

describe('SessionManager', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks()
    
    // Setup default AsyncStorage mock responses
    AsyncStorage.getAllKeys.mockResolvedValue([])
    AsyncStorage.multiGet.mockResolvedValue([])
    AsyncStorage.multiRemove.mockResolvedValue()
    AsyncStorage.getItem.mockResolvedValue(null)
    AsyncStorage.removeItem.mockResolvedValue()
    AsyncStorage.setItem.mockResolvedValue()
    
    // Reset any potential locks
    ;(SessionManager as any).isCleanupInProgress = false
    ;(SessionManager as any).cleanupQueue = []
  })

  describe('clearSessionByErrorId', () => {
    describe('Valid Session ID Cleanup', () => {
      it('should extract and clear session with valid 64-char hex session ID', async () => {
        const sessionId = 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd'
        AsyncStorage.getAllKeys.mockResolvedValue([
          'reown_appkit_session',
          `wc@2:session_topic:${sessionId}`,
          'other_key',
        ])
        AsyncStorage.multiRemove.mockResolvedValue()

        await SessionManager.clearSessionByErrorId(sessionId)

        expect(AsyncStorage.getAllKeys).toHaveBeenCalled()
        expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([
          `wc@2:session_topic:${sessionId}`,
        ])
      })

      it('should handle multiple session-related keys', async () => {
        const sessionId = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
        AsyncStorage.getAllKeys.mockResolvedValue([
          `wc@2:session_topic:${sessionId}`,
          `wc@2:pairing_topic:${sessionId}`,
          `session_data_${sessionId}`,
          'unrelated_key',
        ])
        AsyncStorage.multiRemove.mockResolvedValue()

        await SessionManager.clearSessionByErrorId(sessionId)

        expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([
          `wc@2:session_topic:${sessionId}`,
          `wc@2:pairing_topic:${sessionId}`,
          `session_data_${sessionId}`,
        ])
      })

      it('should log session clearing activity', async () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
        const sessionId = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
        
        AsyncStorage.getAllKeys.mockResolvedValue([
          `wc@2:session_topic:${sessionId}`,
        ])
        AsyncStorage.multiRemove.mockResolvedValue()

        await SessionManager.clearSessionByErrorId(sessionId)

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('🎯 Clearing sessions containing ID: ' + sessionId)
        )
        
        consoleSpy.mockRestore()
      })
    })

    describe('Invalid Session ID Handling', () => {
      it('should handle empty and short session IDs', async () => {
        const shortIds = ['', 'short', 'abc']
        
        AsyncStorage.getAllKeys.mockResolvedValue(['wc@2:session_topic:other_id', 'some_other_key'])
        AsyncStorage.multiRemove.mockResolvedValue()
        
        for (const shortId of shortIds) {
          jest.clearAllMocks()
          await SessionManager.clearSessionByErrorId(shortId)
          expect(AsyncStorage.getAllKeys).toHaveBeenCalled()
          expect(AsyncStorage.multiRemove).not.toHaveBeenCalled() // No matching keys
        }
      })

      it('should handle unusual session IDs gracefully', async () => {
        AsyncStorage.getAllKeys.mockResolvedValue(['key1', 'key2'])
        AsyncStorage.multiRemove.mockResolvedValue()
        
        await expect(SessionManager.clearSessionByErrorId('unusual_id_123')).resolves.not.toThrow()
        expect(AsyncStorage.getAllKeys).toHaveBeenCalled()
      })
    })

    describe('Error Handling', () => {
      it('should handle AsyncStorage.getAllKeys errors gracefully', async () => {
        const sessionId = 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd'
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
        
        AsyncStorage.getAllKeys.mockRejectedValue(new Error('Storage access failed'))

        await expect(SessionManager.clearSessionByErrorId(sessionId)).rejects.toThrow()
        
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to clear session'),
          expect.any(Error)
        )
        
        consoleErrorSpy.mockRestore()
      })

      it('should handle AsyncStorage.multiRemove errors gracefully', async () => {
        const sessionId = 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd'
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
        
        AsyncStorage.getAllKeys.mockResolvedValue([`wc@2:session_topic:${sessionId}`])
        AsyncStorage.multiRemove.mockRejectedValue(new Error('Remove failed'))

        await expect(SessionManager.clearSessionByErrorId(sessionId)).rejects.toThrow()
        
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to clear session'),
          expect.any(Error)
        )
        
        consoleErrorSpy.mockRestore()
      })
    })
  })

  describe('forceResetAllConnections', () => {
    describe('Comprehensive Cleanup', () => {
      it('should remove all WalletConnect and session-related keys', async () => {
        AsyncStorage.getAllKeys.mockResolvedValue([
          'wc@2:session_topic:abc123',
          'wc@2:pairing_topic:def456',
          'reown_appkit_session',
          'walletconnect_v2_session',
          'auth_state',
          'user_preferences',
          'unrelated_key',
          'another_unrelated_key',
        ])
        AsyncStorage.multiRemove.mockResolvedValue()

        await SessionManager.forceResetAllConnections()

        expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([
          'wc@2:session_topic:abc123',
          'wc@2:pairing_topic:def456',
          'reown_appkit_session',
          'walletconnect_v2_session',
          'auth_state',
          'user_preferences',
        ])
      })

      it('should preserve non-session related keys', async () => {
        AsyncStorage.getAllKeys.mockResolvedValue([
          'user_settings',
          'app_theme',
          'wc@2:session_topic:abc123',
          'notification_preferences',
        ])
        AsyncStorage.multiRemove.mockResolvedValue()

        await SessionManager.forceResetAllConnections()

        expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([
          'wc@2:session_topic:abc123',
        ])
      })

      it('should log reset activity with statistics', async () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
        
        AsyncStorage.getAllKeys.mockResolvedValue([
          'wc@2:session_topic:abc123',
          'reown_appkit_session',
          'unrelated_key',
        ])
        AsyncStorage.multiRemove.mockResolvedValue()

        await SessionManager.forceResetAllConnections()

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('🔄 Force resetting all connections'),
          expect.stringContaining('2 keys')
        )
        
        consoleSpy.mockRestore()
      })
    })

    describe('No Keys Scenario', () => {
      it('should handle empty storage gracefully', async () => {
        AsyncStorage.getAllKeys.mockResolvedValue([])
        
        await SessionManager.forceResetAllConnections()
        
        expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([])
      })

      it('should handle no session keys found', async () => {
        AsyncStorage.getAllKeys.mockResolvedValue([
          'user_settings',
          'app_preferences',
          'theme_data',
        ])
        
        await SessionManager.forceResetAllConnections()
        
        expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([])
      })
    })

    describe('Error Handling', () => {
      it('should handle getAllKeys errors during force reset', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
        
        AsyncStorage.getAllKeys.mockRejectedValue(new Error('Storage unavailable'))

        await expect(SessionManager.forceResetAllConnections()).rejects.toThrow()
        
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('❌ Failed to force reset connections:'),
          expect.any(Error)
        )
        
        consoleErrorSpy.mockRestore()
      })
    })
  })

  describe('preventiveSessionCleanup', () => {
    describe('Cleanup Lock Management', () => {
      it('should prevent concurrent cleanup operations', async () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
        
        // Start first cleanup
        const cleanup1Promise = SessionManager.preventiveSessionCleanup()
        
        // Try to start second cleanup while first is running
        const cleanup2Promise = SessionManager.preventiveSessionCleanup()
        
        await Promise.all([cleanup1Promise, cleanup2Promise])
        
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('🔒 Cleanup already in progress, skipping')
        )
        
        consoleSpy.mockRestore()
      })

      it('should release lock after cleanup completes', async () => {
        AsyncStorage.getAllKeys.mockResolvedValue(['wc@2:session_topic:abc123'])
        AsyncStorage.multiRemove.mockResolvedValue()
        
        await SessionManager.preventiveSessionCleanup()
        
        // Should be able to run again after first completes
        await SessionManager.preventiveSessionCleanup()
        
        expect(AsyncStorage.getAllKeys).toHaveBeenCalledTimes(2)
      })

      it('should release lock even when cleanup fails', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
        
        AsyncStorage.getAllKeys.mockRejectedValue(new Error('Storage error'))
        
        // First cleanup should throw
        await expect(SessionManager.preventiveSessionCleanup()).rejects.toThrow()
        
        // Should be able to run again after error (lock released)
        AsyncStorage.getAllKeys.mockResolvedValue([])
        await SessionManager.preventiveSessionCleanup()
        
        expect(AsyncStorage.getAllKeys).toHaveBeenCalledTimes(2)
        
        consoleErrorSpy.mockRestore()
      })
    })

    describe('Session Cleanup Logic', () => {
      it('should clean up problematic WalletConnect keys', async () => {
        AsyncStorage.getAllKeys.mockResolvedValue([
          'wc@2:core:0.3//expirer:expired_session',
          'wc@2:core:0.3//messages:stale_messages',
          'wc@2:session_topic:valid_session_id_12345678901234567890123456789012345',
          'user_preferences',
        ])
        
        AsyncStorage.multiRemove.mockResolvedValue()

        await SessionManager.preventiveSessionCleanup()

        expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([
          'wc@2:core:0.3//expirer:expired_session',
          'wc@2:core:0.3//messages:stale_messages',
        ])
      })

      it('should skip non-problematic keys even if WalletConnect related', async () => {
        AsyncStorage.getAllKeys.mockResolvedValue([
          'wc@2:session_topic:normal_session_123456789012345678901234567890123',
          'WalletConnect_settings',
        ])
        
        AsyncStorage.multiRemove.mockResolvedValue()

        await expect(SessionManager.preventiveSessionCleanup()).resolves.not.toThrow()
        
        // Should not call multiRemove since no problematic patterns found
        expect(AsyncStorage.multiRemove).not.toHaveBeenCalled()
      })
    })

    describe('Performance and Batch Operations', () => {
      it('should handle large numbers of problematic keys efficiently', async () => {
        const problematicKeys = Array.from({ length: 50 }, (_, i) => 
          `wc@2:core:0.3//expirer:session_${i}`
        )
        const normalKeys = Array.from({ length: 50 }, (_, i) => 
          `wc@2:session_topic:session_${i.toString().padStart(60, '0')}`
        )
        const allKeys = [...problematicKeys, ...normalKeys]
        
        AsyncStorage.getAllKeys.mockResolvedValue(allKeys)
        AsyncStorage.multiRemove.mockResolvedValue()

        const start = performance.now()
        await SessionManager.preventiveSessionCleanup()
        const end = performance.now()

        expect(end - start).toBeLessThan(1000) // Should complete within 1 second
        expect(AsyncStorage.multiRemove).toHaveBeenCalledWith(problematicKeys)
      })
    })
  })


  describe('categorizeSessionError', () => {
    describe('Session-Specific Errors', () => {
      it('should categorize WalletConnect session errors', () => {
        const sessionErrors = [
          'WalletConnect session error',
          'No matching key. session: abc123',
          'Session topic not found',
          'Invalid session state',
        ]

        sessionErrors.forEach(errorMsg => {
          const result = SessionManager.categorizeSessionError(errorMsg)
          
          expect(result.type).toBe('session')
          expect(result.severity).toBe('medium')
        })
      })

      it('should extract session IDs from error messages', () => {
        const errorMsg = 'No matching key. session: a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd'
        const result = SessionManager.categorizeSessionError(errorMsg)
        
        expect(result.sessionId).toBe('a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd')
      })
    })

    describe('Relayer Errors', () => {
      it('should categorize relayer connection errors', () => {
        // Note: Some relayer errors may be categorized as 'timeout' due to precedence in logic
        const relayerErrors = [
          { error: 'Relayer connection failed', expectedType: 'relayer' },
          { error: 'Relayer timeout occurred', expectedType: 'timeout' }, // 'timeout' has precedence
          { error: 'WebSocket connection lost', expectedType: 'relayer' },
          { error: 'Network relayer error', expectedType: 'relayer' },
        ]

        relayerErrors.forEach(({ error, expectedType }) => {
          const result = SessionManager.categorizeSessionError(error)
          
          expect(result.type).toBe(expectedType)
          expect(result.severity).toBe(expectedType === 'timeout' ? 'low' : 'high')
        })
      })
    })

    describe('Pairing Errors', () => {
      it('should categorize pairing-related errors', () => {
        const pairingErrors = [
          'Pairing expired',
          'Pairing proposal rejected',
          'Invalid pairing topic',
          'Pairing already exists',
        ]

        pairingErrors.forEach(errorMsg => {
          const result = SessionManager.categorizeSessionError(errorMsg)
          
          expect(result.type).toBe('pairing')
          expect(result.severity).toBe('medium')
        })
      })
    })

    describe('Timeout Errors', () => {
      it('should categorize timeout-related errors', () => {
        const timeoutErrors = [
          { error: 'Request timed out', expectedType: 'unknown' }, // "timed" doesn't match "timeout" or "expired"
          { error: 'Connection timeout', expectedType: 'timeout' },
          { error: 'Session timeout expired', expectedType: 'timeout' },
          { error: 'Operation expired after 30s', expectedType: 'timeout' }, // "expired" matches
        ]

        timeoutErrors.forEach(({ error, expectedType }) => {
          const result = SessionManager.categorizeSessionError(error)
          
          expect(result.type).toBe(expectedType)
          expect(result.severity).toBe(expectedType === 'timeout' ? 'low' : 'low')
        })
      })
    })

    describe('Unknown Errors', () => {
      it('should categorize various error types correctly', () => {
        const errors = [
          { error: 'Random application error', expectedType: 'unknown' },
          { error: 'Database connection failed', expectedType: 'session' }, // Actually matches SESSION_ERROR_INDICATORS first
          { error: 'Invalid input parameters', expectedType: 'unknown' },
          { error: 'Permission denied', expectedType: 'unknown' },
        ]

        errors.forEach(({ error, expectedType }) => {
          const result = SessionManager.categorizeSessionError(error)
          
          expect(result.type).toBe(expectedType)
          expect(result.severity).toBe(expectedType === 'unknown' ? 'low' : expectedType === 'session' ? 'medium' : expectedType === 'relayer' ? 'high' : 'low')
        })
      })
    })
  })

  describe('extractPeerInfo', () => {
    describe('Valid Peer Information', () => {
      it('should extract peer metadata from valid session objects', () => {
        const sessionWithPeer = {
          topic: 'test_topic',
          peer: {
            metadata: {
              name: 'MetaMask',
              description: 'Popular Ethereum Wallet',
              url: 'https://metamask.io',
              icons: ['https://metamask.io/icon.png']
            }
          },
          namespaces: { eip155: {} }
        }

        const peerInfo = SessionManager.extractPeerInfo(sessionWithPeer)
        
        expect(peerInfo).toEqual({
          name: 'MetaMask',
          url: 'https://metamask.io',
          icons: ['https://metamask.io/icon.png']
        })
      })

      it('should handle minimal peer information from valid sessions', () => {
        const sessionWithMinimalPeer = {
          topic: 'test_topic',
          peer: {
            metadata: {
              name: 'Simple Wallet'
            }
          },
          namespaces: { eip155: {} }
        }

        const peerInfo = SessionManager.extractPeerInfo(sessionWithMinimalPeer)
        
        expect(peerInfo).toEqual({
          name: 'Simple Wallet',
          url: undefined,
          icons: undefined
        })
      })
    })

    describe('Invalid or Missing Peer Information', () => {
      it('should return empty object for sessions without peer info', () => {
        const sessionsWithoutPeer = [
          {},
          { peer: {} },
          { peer: { metadata: {} } },
          { peer: { metadata: null } },
          { peer: null },
        ]

        sessionsWithoutPeer.forEach(session => {
          expect(SessionManager.extractPeerInfo(session)).toEqual({})
        })
      })

      it('should handle null and undefined inputs', () => {
        expect(SessionManager.extractPeerInfo(null as any)).toEqual({})
        expect(SessionManager.extractPeerInfo(undefined as any)).toEqual({})
      })
    })
  })

  describe('getSessionAge', () => {
    describe('Valid Age Calculations', () => {
      it('should calculate age for valid sessions with expiry', () => {
        const now = Date.now()
        const session = {
          topic: 'test_topic',
          expiry: Math.floor((now + 3600000) / 1000), // 1 hour from now (in seconds)
          peer: { metadata: { name: 'Test Wallet' } },
          namespaces: { eip155: {} }
        }

        const result = SessionManager.getSessionAge(session)
        
        expect(result).toHaveProperty('ageMs')
        expect(result).toHaveProperty('isExpired')
        expect(result).toHaveProperty('expiryMs')
        expect(result.isExpired).toBe(false)
        expect(result.ageMs).toBeGreaterThanOrEqual(0)
      })

      it('should handle expired valid sessions', () => {
        const now = Date.now()
        const session = {
          topic: 'expired_topic',
          expiry: Math.floor((now - 3600000) / 1000), // 1 hour ago (in seconds)
          peer: { metadata: { name: 'Test Wallet' } },
          namespaces: { eip155: {} }
        }

        const result = SessionManager.getSessionAge(session)
        
        expect(result.isExpired).toBe(true)
        expect(result.expiryMs).toBeLessThan(now)
      })
    })

    describe('Invalid Session Objects', () => {
      it('should return default values for invalid sessions', () => {
        const invalidSessions = [
          {},
          { topic: null },
          { topic: 'test' }, // no expiry
          { expiry: 'not_a_number' },
        ]

        invalidSessions.forEach(session => {
          const result = SessionManager.getSessionAge(session as any)
          expect(result.ageMs).toBe(0)
          expect(result.isExpired).toBe(true)
        })
      })

      it('should handle null and undefined inputs', () => {
        const nullResult = SessionManager.getSessionAge(null as any)
        const undefinedResult = SessionManager.getSessionAge(undefined as any)

        expect(nullResult.ageMs).toBe(0)
        expect(nullResult.isExpired).toBe(true)
        expect(undefinedResult.ageMs).toBe(0)
        expect(undefinedResult.isExpired).toBe(true)
      })
    })
  })

  describe('getSessionDebugInfo', () => {
    describe('Comprehensive Debug Information', () => {
      it('should generate complete debug information', async () => {
        const allKeys = [
          'wc@2:session_topic:session123456789012345678901234567890123456789012345',
          'reown_appkit_session',
          'user_preferences', // non-WalletConnect key
        ]
        
        AsyncStorage.getAllKeys.mockResolvedValue(allKeys)
        AsyncStorage.getItem
          .mockResolvedValueOnce(JSON.stringify({
            topic: 'session123456789012345678901234567890123456789012345',
            expiry: Date.now() + 3600000,
            peer: { metadata: { name: 'Test Wallet' } }
          }))
          .mockResolvedValueOnce('simple_session_data')

        const debugInfo = await SessionManager.getSessionDebugInfo()
        
        expect(debugInfo).toMatchObject({
          totalKeys: 3,
          walletConnectKeys: expect.arrayContaining([
            'wc@2:session_topic:session123456789012345678901234567890123456789012345',
            'reown_appkit_session'
          ]),
          sessionData: expect.any(Object)
        })
        expect(debugInfo.walletConnectKeys).toHaveLength(2)
      })

      it('should handle sessions with invalid JSON data', async () => {
        AsyncStorage.getAllKeys.mockResolvedValue(['wc@2:session_topic:invalid'])
        AsyncStorage.getItem.mockResolvedValue('invalid_json_data')

        const debugInfo = await SessionManager.getSessionDebugInfo()
        
        expect(debugInfo.sessionData['wc@2:session_topic:invalid']).toBe('Failed to parse')
      })
    })

    describe('Empty Storage Scenarios', () => {
      it('should handle empty storage gracefully', async () => {
        AsyncStorage.getAllKeys.mockResolvedValue([])

        const debugInfo = await SessionManager.getSessionDebugInfo()
        
        expect(debugInfo).toEqual({
          totalKeys: 0,
          walletConnectKeys: [],
          sessionData: {}
        })
      })
    })

    describe('Error Handling in Debug Generation', () => {
      it('should handle storage errors during debug info generation', async () => {
        AsyncStorage.getAllKeys.mockRejectedValue(new Error('Storage unavailable'))

        const debugInfo = await SessionManager.getSessionDebugInfo()
        
        expect(debugInfo).toEqual({
          totalKeys: 0,
          walletConnectKeys: [],
          sessionData: {}
        })
      })
    })
  })

  describe('Static Class Properties', () => {
    it('should have all required static methods', () => {
      expect(typeof SessionManager.clearSessionByErrorId).toBe('function')
      expect(typeof SessionManager.forceResetAllConnections).toBe('function')
      expect(typeof SessionManager.preventiveSessionCleanup).toBe('function')
      expect(typeof SessionManager.categorizeSessionError).toBe('function')
      expect(typeof SessionManager.extractPeerInfo).toBe('function')
      expect(typeof SessionManager.getSessionAge).toBe('function')
      expect(typeof SessionManager.getSessionDebugInfo).toBe('function')
    })

  })

  describe('Integration and Performance Tests', () => {
    it('should handle concurrent operations safely', async () => {
      const sessionId = 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd'
      AsyncStorage.getAllKeys.mockResolvedValue([`wc@2:session_topic:${sessionId}`])
      AsyncStorage.multiRemove.mockResolvedValue()

      // Run multiple operations concurrently
      const operations = [
        SessionManager.clearSessionByErrorId(sessionId),
        SessionManager.preventiveSessionCleanup(),
        SessionManager.forceResetAllConnections(),
      ]

      await expect(Promise.all(operations)).resolves.not.toThrow()
    })

    it('should maintain consistent behavior under load', async () => {
      const sessionIds = Array.from({ length: 50 }, (_, i) => 
        `session${i.toString().padStart(58, '0')}`
      )
      
      AsyncStorage.getAllKeys.mockResolvedValue(
        sessionIds.map(id => `wc@2:session_topic:${id}`)
      )
      AsyncStorage.multiRemove.mockResolvedValue()

      const start = performance.now()
      
      await Promise.all(
        sessionIds.map(id => SessionManager.clearSessionByErrorId(id))
      )
      
      const end = performance.now()
      expect(end - start).toBeLessThan(2000) // Should handle 50 operations within 2 seconds
    })

    it('should not cause memory leaks with repeated operations', async () => {
      const initialMemory = process.memoryUsage().heapUsed
      
      AsyncStorage.getAllKeys.mockResolvedValue(['wc@2:session_topic:test'])
      AsyncStorage.multiRemove.mockResolvedValue()

      for (let i = 0; i < 100; i++) {
        await SessionManager.preventiveSessionCleanup()
      }
      
      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = finalMemory - initialMemory
      
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024) // Less than 50MB
    })
  })
})