import { SessionManager } from './sessionManager'

// Mock AsyncStorage
const mockAsyncStorage = {
  getAllKeys: jest.fn(),
  multiGet: jest.fn(),
  multiRemove: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
  setItem: jest.fn(),
}

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage)

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
    jest.clearAllMocks()
    
    // Reset any potential locks
    ;(SessionManager as any).cleanupLock = false
  })

  describe('clearSessionByErrorId', () => {
    describe('Valid Session ID Cleanup', () => {
      it('should extract and clear session with valid 64-char hex session ID', async () => {
        const sessionId = 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd'
        mockAsyncStorage.getAllKeys.mockResolvedValue([
          'reown_appkit_session',
          `wc@2:session_topic:${sessionId}`,
          'other_key',
        ])
        mockAsyncStorage.multiRemove.mockResolvedValue()

        await SessionManager.clearSessionByErrorId(sessionId)

        expect(mockAsyncStorage.getAllKeys).toHaveBeenCalled()
        expect(mockAsyncStorage.multiRemove).toHaveBeenCalledWith([
          `wc@2:session_topic:${sessionId}`,
        ])
      })

      it('should handle multiple session-related keys', async () => {
        const sessionId = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
        mockAsyncStorage.getAllKeys.mockResolvedValue([
          `wc@2:session_topic:${sessionId}`,
          `wc@2:pairing_topic:${sessionId}`,
          `session_data_${sessionId}`,
          'unrelated_key',
        ])
        mockAsyncStorage.multiRemove.mockResolvedValue()

        await SessionManager.clearSessionByErrorId(sessionId)

        expect(mockAsyncStorage.multiRemove).toHaveBeenCalledWith([
          `wc@2:session_topic:${sessionId}`,
          `wc@2:pairing_topic:${sessionId}`,
          `session_data_${sessionId}`,
        ])
      })

      it('should log session clearing activity', async () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
        const sessionId = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
        
        mockAsyncStorage.getAllKeys.mockResolvedValue([
          `wc@2:session_topic:${sessionId}`,
        ])
        mockAsyncStorage.multiRemove.mockResolvedValue()

        await SessionManager.clearSessionByErrorId(sessionId)

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('🧹 Clearing session data for ID:'),
          expect.stringContaining(sessionId.substring(0, 8))
        )
        
        consoleSpy.mockRestore()
      })
    })

    describe('Invalid Session ID Handling', () => {
      it('should skip cleanup for invalid session IDs', async () => {
        const invalidIds = ['', 'short', 'too_long_session_id_that_exceeds_limits', null, undefined]
        
        for (const invalidId of invalidIds) {
          await SessionManager.clearSessionByErrorId(invalidId as any)
          expect(mockAsyncStorage.getAllKeys).not.toHaveBeenCalled()
        }
      })

      it('should handle non-string session IDs gracefully', async () => {
        const nonStringIds = [123, {}, [], true, false]
        
        for (const nonStringId of nonStringIds) {
          await SessionManager.clearSessionByErrorId(nonStringId as any)
          expect(mockAsyncStorage.getAllKeys).not.toHaveBeenCalled()
        }
      })
    })

    describe('Error Handling', () => {
      it('should handle AsyncStorage.getAllKeys errors gracefully', async () => {
        const sessionId = 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd'
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
        
        mockAsyncStorage.getAllKeys.mockRejectedValue(new Error('Storage access failed'))

        await expect(SessionManager.clearSessionByErrorId(sessionId)).resolves.not.toThrow()
        
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('❌ Error clearing session'),
          expect.any(Error)
        )
        
        consoleErrorSpy.mockRestore()
      })

      it('should handle AsyncStorage.multiRemove errors gracefully', async () => {
        const sessionId = 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd'
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
        
        mockAsyncStorage.getAllKeys.mockResolvedValue([`wc@2:session_topic:${sessionId}`])
        mockAsyncStorage.multiRemove.mockRejectedValue(new Error('Remove failed'))

        await expect(SessionManager.clearSessionByErrorId(sessionId)).resolves.not.toThrow()
        
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('❌ Error clearing session'),
          expect.any(Error)
        )
        
        consoleErrorSpy.mockRestore()
      })
    })
  })

  describe('forceResetAllConnections', () => {
    describe('Comprehensive Cleanup', () => {
      it('should remove all WalletConnect and session-related keys', async () => {
        mockAsyncStorage.getAllKeys.mockResolvedValue([
          'wc@2:session_topic:abc123',
          'wc@2:pairing_topic:def456',
          'reown_appkit_session',
          'walletconnect_v2_session',
          'auth_state',
          'user_preferences',
          'unrelated_key',
          'another_unrelated_key',
        ])
        mockAsyncStorage.multiRemove.mockResolvedValue()

        await SessionManager.forceResetAllConnections()

        expect(mockAsyncStorage.multiRemove).toHaveBeenCalledWith([
          'wc@2:session_topic:abc123',
          'wc@2:pairing_topic:def456',
          'reown_appkit_session',
          'walletconnect_v2_session',
          'auth_state',
          'user_preferences',
        ])
      })

      it('should preserve non-session related keys', async () => {
        mockAsyncStorage.getAllKeys.mockResolvedValue([
          'user_settings',
          'app_theme',
          'wc@2:session_topic:abc123',
          'notification_preferences',
        ])
        mockAsyncStorage.multiRemove.mockResolvedValue()

        await SessionManager.forceResetAllConnections()

        expect(mockAsyncStorage.multiRemove).toHaveBeenCalledWith([
          'wc@2:session_topic:abc123',
        ])
      })

      it('should log reset activity with statistics', async () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
        
        mockAsyncStorage.getAllKeys.mockResolvedValue([
          'wc@2:session_topic:abc123',
          'reown_appkit_session',
          'unrelated_key',
        ])
        mockAsyncStorage.multiRemove.mockResolvedValue()

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
        mockAsyncStorage.getAllKeys.mockResolvedValue([])
        
        await SessionManager.forceResetAllConnections()
        
        expect(mockAsyncStorage.multiRemove).toHaveBeenCalledWith([])
      })

      it('should handle no session keys found', async () => {
        mockAsyncStorage.getAllKeys.mockResolvedValue([
          'user_settings',
          'app_preferences',
          'theme_data',
        ])
        
        await SessionManager.forceResetAllConnections()
        
        expect(mockAsyncStorage.multiRemove).toHaveBeenCalledWith([])
      })
    })

    describe('Error Handling', () => {
      it('should handle getAllKeys errors during force reset', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
        
        mockAsyncStorage.getAllKeys.mockRejectedValue(new Error('Storage unavailable'))

        await expect(SessionManager.forceResetAllConnections()).resolves.not.toThrow()
        
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('❌ Error during force reset'),
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
        mockAsyncStorage.getAllKeys.mockResolvedValue(['wc@2:session_topic:abc123'])
        mockAsyncStorage.multiRemove.mockResolvedValue()
        
        await SessionManager.preventiveSessionCleanup()
        
        // Should be able to run again after first completes
        await SessionManager.preventiveSessionCleanup()
        
        expect(mockAsyncStorage.getAllKeys).toHaveBeenCalledTimes(2)
      })

      it('should release lock even when cleanup fails', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
        
        mockAsyncStorage.getAllKeys.mockRejectedValue(new Error('Storage error'))
        
        await SessionManager.preventiveSessionCleanup()
        
        // Should be able to run again after error
        mockAsyncStorage.getAllKeys.mockResolvedValue([])
        await SessionManager.preventiveSessionCleanup()
        
        expect(mockAsyncStorage.getAllKeys).toHaveBeenCalledTimes(2)
        
        consoleErrorSpy.mockRestore()
      })
    })

    describe('Session Cleanup Logic', () => {
      it('should clean up expired and invalid sessions', async () => {
        const now = Date.now()
        const oldTimestamp = now - 86400000 // 24 hours ago
        
        mockAsyncStorage.getAllKeys.mockResolvedValue([
          'wc@2:session_topic:valid_session_id_12345678901234567890123456789012345',
          'wc@2:session_topic:expired_session_id_123456789012345678901234567890123',
        ])
        
        mockAsyncStorage.multiGet.mockResolvedValue([
          ['wc@2:session_topic:valid_session_id_12345678901234567890123456789012345', JSON.stringify({
            topic: 'valid_session_id_12345678901234567890123456789012345',
            expiry: now + 3600000, // 1 hour from now
          })],
          ['wc@2:session_topic:expired_session_id_123456789012345678901234567890123', JSON.stringify({
            topic: 'expired_session_id_123456789012345678901234567890123',
            expiry: oldTimestamp, // Expired
          })],
        ])
        
        mockAsyncStorage.multiRemove.mockResolvedValue()

        await SessionManager.preventiveSessionCleanup()

        expect(mockAsyncStorage.multiRemove).toHaveBeenCalledWith([
          'wc@2:session_topic:expired_session_id_123456789012345678901234567890123',
        ])
      })

      it('should handle malformed session data', async () => {
        mockAsyncStorage.getAllKeys.mockResolvedValue([
          'wc@2:session_topic:malformed_session_123456789012345678901234567890123',
        ])
        
        mockAsyncStorage.multiGet.mockResolvedValue([
          ['wc@2:session_topic:malformed_session_123456789012345678901234567890123', 'invalid_json'],
        ])
        
        mockAsyncStorage.multiRemove.mockResolvedValue()

        await expect(SessionManager.preventiveSessionCleanup()).resolves.not.toThrow()
        
        expect(mockAsyncStorage.multiRemove).toHaveBeenCalledWith([
          'wc@2:session_topic:malformed_session_123456789012345678901234567890123',
        ])
      })
    })

    describe('Performance and Batch Operations', () => {
      it('should handle large numbers of sessions efficiently', async () => {
        const sessionKeys = Array.from({ length: 100 }, (_, i) => 
          `wc@2:session_topic:session_${i.toString().padStart(60, '0')}`
        )
        
        mockAsyncStorage.getAllKeys.mockResolvedValue(sessionKeys)
        mockAsyncStorage.multiGet.mockResolvedValue(
          sessionKeys.map(key => [key, JSON.stringify({ expiry: Date.now() - 1000 })])
        )
        mockAsyncStorage.multiRemove.mockResolvedValue()

        const start = performance.now()
        await SessionManager.preventiveSessionCleanup()
        const end = performance.now()

        expect(end - start).toBeLessThan(1000) // Should complete within 1 second
        expect(mockAsyncStorage.multiRemove).toHaveBeenCalledWith(sessionKeys)
      })
    })
  })

  describe('validateSessionStructure', () => {
    describe('Valid Session Objects', () => {
      it('should return true for well-formed session objects', () => {
        const validSessions = [
          {
            topic: 'session_topic_12345678901234567890123456789012345678901234567890',
            expiry: Date.now() + 3600000,
            pairingTopic: 'pairing_topic_123',
            metadata: { name: 'Test App', description: 'Test', url: 'https://test.com', icons: [] }
          },
          {
            topic: 'another_topic_1234567890123456789012345678901234567890123456789',
            expiry: Date.now() + 1800000,
            pairingTopic: 'pairing_456',
            metadata: { name: 'Another App' }
          }
        ]

        validSessions.forEach(session => {
          expect(SessionManager.validateSessionStructure(session)).toBe(true)
        })
      })

      it('should handle minimal valid session objects', () => {
        const minimalSession = {
          topic: 'minimal_topic_12345678901234567890123456789012345678901234567',
          expiry: Date.now() + 3600000,
        }

        expect(SessionManager.validateSessionStructure(minimalSession)).toBe(true)
      })
    })

    describe('Invalid Session Objects', () => {
      it('should return false for objects missing required fields', () => {
        const invalidSessions = [
          {}, // Empty object
          { topic: 'valid_topic' }, // Missing expiry
          { expiry: Date.now() + 3600000 }, // Missing topic
          { topic: '', expiry: Date.now() + 3600000 }, // Empty topic
          { topic: 'valid_topic', expiry: 'not_a_number' }, // Invalid expiry type
        ]

        invalidSessions.forEach(session => {
          expect(SessionManager.validateSessionStructure(session)).toBe(false)
        })
      })

      it('should return false for null, undefined, and non-object inputs', () => {
        const invalidInputs = [null, undefined, 'string', 123, [], true, false]

        invalidInputs.forEach(input => {
          expect(SessionManager.validateSessionStructure(input as any)).toBe(false)
        })
      })

      it('should return false for expired sessions', () => {
        const expiredSession = {
          topic: 'expired_topic_12345678901234567890123456789012345678901234567',
          expiry: Date.now() - 3600000, // 1 hour ago
        }

        expect(SessionManager.validateSessionStructure(expiredSession)).toBe(false)
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
          const error = new Error(errorMsg)
          const result = SessionManager.categorizeSessionError(error)
          
          expect(result.category).toBe('session')
          expect(result.isSessionRelated).toBe(true)
        })
      })

      it('should extract session IDs from error messages', () => {
        const errorWithSessionId = new Error('No matching key. session: a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd')
        const result = SessionManager.categorizeSessionError(errorWithSessionId)
        
        expect(result.sessionId).toBe('a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd')
      })
    })

    describe('Relayer Errors', () => {
      it('should categorize relayer connection errors', () => {
        const relayerErrors = [
          'Relayer connection failed',
          'Relayer timeout occurred',
          'WebSocket connection lost',
          'Network relayer error',
        ]

        relayerErrors.forEach(errorMsg => {
          const error = new Error(errorMsg)
          const result = SessionManager.categorizeSessionError(error)
          
          expect(result.category).toBe('relayer')
          expect(result.isSessionRelated).toBe(true)
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
          const error = new Error(errorMsg)
          const result = SessionManager.categorizeSessionError(error)
          
          expect(result.category).toBe('pairing')
          expect(result.isSessionRelated).toBe(true)
        })
      })
    })

    describe('Timeout Errors', () => {
      it('should categorize timeout-related errors', () => {
        const timeoutErrors = [
          'Request timed out',
          'Connection timeout',
          'Session timeout expired',
          'Operation timed out after 30s',
        ]

        timeoutErrors.forEach(errorMsg => {
          const error = new Error(errorMsg)
          const result = SessionManager.categorizeSessionError(error)
          
          expect(result.category).toBe('timeout')
          expect(result.isSessionRelated).toBe(true)
        })
      })
    })

    describe('Generic Errors', () => {
      it('should categorize non-session errors as generic', () => {
        const genericErrors = [
          'Random application error',
          'Database connection failed',
          'Invalid input parameters',
          'Permission denied',
        ]

        genericErrors.forEach(errorMsg => {
          const error = new Error(errorMsg)
          const result = SessionManager.categorizeSessionError(error)
          
          expect(result.category).toBe('generic')
          expect(result.isSessionRelated).toBe(false)
        })
      })

      it('should handle null and undefined errors', () => {
        const nullResult = SessionManager.categorizeSessionError(null as any)
        const undefinedResult = SessionManager.categorizeSessionError(undefined as any)

        expect(nullResult.category).toBe('generic')
        expect(nullResult.isSessionRelated).toBe(false)
        expect(undefinedResult.category).toBe('generic')
        expect(undefinedResult.isSessionRelated).toBe(false)
      })
    })

    describe('Complex Error Analysis', () => {
      it('should extract multiple pieces of information from complex errors', () => {
        const complexError = new Error(`
          WalletConnect Error: Session relayer connection failed.
          Session ID: a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd
          Peer: {"metadata":{"name":"Test Wallet"}}
          Expiry: ${Date.now() + 3600000}
        `)

        const result = SessionManager.categorizeSessionError(complexError)
        
        expect(result.category).toBe('session') // Primary category
        expect(result.sessionId).toBe('a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd')
        expect(result.isSessionRelated).toBe(true)
      })

      it('should prioritize error categories correctly', () => {
        // Session errors should take priority over relayer
        const sessionRelayerError = new Error('Session expired due to relayer connection failure')
        const result = SessionManager.categorizeSessionError(sessionRelayerError)
        
        expect(result.category).toBe('session')
      })
    })
  })

  describe('extractPeerInfo', () => {
    describe('Valid Peer Information', () => {
      it('should extract peer metadata from session objects', () => {
        const sessionWithPeer = {
          peer: {
            metadata: {
              name: 'MetaMask',
              description: 'Popular Ethereum Wallet',
              url: 'https://metamask.io',
              icons: ['https://metamask.io/icon.png']
            }
          }
        }

        const peerInfo = SessionManager.extractPeerInfo(sessionWithPeer)
        
        expect(peerInfo).toEqual({
          name: 'MetaMask',
          description: 'Popular Ethereum Wallet',
          url: 'https://metamask.io',
          icons: ['https://metamask.io/icon.png']
        })
      })

      it('should handle minimal peer information', () => {
        const sessionWithMinimalPeer = {
          peer: {
            metadata: {
              name: 'Simple Wallet'
            }
          }
        }

        const peerInfo = SessionManager.extractPeerInfo(sessionWithMinimalPeer)
        
        expect(peerInfo).toEqual({
          name: 'Simple Wallet'
        })
      })
    })

    describe('Invalid or Missing Peer Information', () => {
      it('should return null for sessions without peer info', () => {
        const sessionsWithoutPeer = [
          {},
          { peer: {} },
          { peer: { metadata: {} } },
          { peer: { metadata: null } },
          { peer: null },
        ]

        sessionsWithoutPeer.forEach(session => {
          expect(SessionManager.extractPeerInfo(session)).toBeNull()
        })
      })

      it('should handle null and undefined inputs', () => {
        expect(SessionManager.extractPeerInfo(null as any)).toBeNull()
        expect(SessionManager.extractPeerInfo(undefined as any)).toBeNull()
      })
    })
  })

  describe('calculateSessionAge', () => {
    describe('Valid Age Calculations', () => {
      it('should calculate age for recent sessions', () => {
        const now = Date.now()
        const session = {
          createdAt: now - 3600000, // 1 hour ago
        }

        const age = SessionManager.calculateSessionAge(session)
        
        expect(age).toBeGreaterThan(3500000) // Close to 1 hour
        expect(age).toBeLessThan(3700000) // Allow some variance
      })

      it('should handle sessions created in the future gracefully', () => {
        const session = {
          createdAt: Date.now() + 3600000, // 1 hour in future
        }

        const age = SessionManager.calculateSessionAge(session)
        
        expect(age).toBeLessThanOrEqual(0) // Should be 0 or negative
      })
    })

    describe('Invalid Session Objects', () => {
      it('should return -1 for sessions without createdAt', () => {
        const invalidSessions = [
          {},
          { createdAt: null },
          { createdAt: undefined },
          { createdAt: 'not_a_number' },
        ]

        invalidSessions.forEach(session => {
          expect(SessionManager.calculateSessionAge(session as any)).toBe(-1)
        })
      })

      it('should handle null and undefined inputs', () => {
        expect(SessionManager.calculateSessionAge(null as any)).toBe(-1)
        expect(SessionManager.calculateSessionAge(undefined as any)).toBe(-1)
      })
    })
  })

  describe('generateDebugInfo', () => {
    describe('Comprehensive Debug Information', () => {
      it('should generate complete debug information', async () => {
        const sessionKeys = [
          'wc@2:session_topic:session123456789012345678901234567890123456789012345',
          'reown_appkit_session',
        ]
        
        mockAsyncStorage.getAllKeys.mockResolvedValue(sessionKeys)
        mockAsyncStorage.multiGet.mockResolvedValue([
          ['wc@2:session_topic:session123456789012345678901234567890123456789012345', JSON.stringify({
            topic: 'session123456789012345678901234567890123456789012345',
            expiry: Date.now() + 3600000,
            peer: {
              metadata: { name: 'Test Wallet' }
            },
            createdAt: Date.now() - 1800000, // 30 minutes ago
          })],
          ['reown_appkit_session', 'simple_session_data'],
        ])

        const debugInfo = await SessionManager.generateDebugInfo()
        
        expect(debugInfo).toMatchObject({
          totalKeys: 2,
          sessionKeys: 2,
          sessions: expect.arrayContaining([
            expect.objectContaining({
              key: expect.stringContaining('wc@2:session_topic'),
              isValid: true,
              age: expect.any(Number),
              peerName: 'Test Wallet',
            })
          ])
        })
      })

      it('should handle sessions with invalid data', async () => {
        mockAsyncStorage.getAllKeys.mockResolvedValue(['wc@2:session_topic:invalid'])
        mockAsyncStorage.multiGet.mockResolvedValue([
          ['wc@2:session_topic:invalid', 'invalid_json_data']
        ])

        const debugInfo = await SessionManager.generateDebugInfo()
        
        expect(debugInfo.sessions[0].isValid).toBe(false)
        expect(debugInfo.sessions[0].error).toBeDefined()
      })
    })

    describe('Empty Storage Scenarios', () => {
      it('should handle empty storage gracefully', async () => {
        mockAsyncStorage.getAllKeys.mockResolvedValue([])

        const debugInfo = await SessionManager.generateDebugInfo()
        
        expect(debugInfo).toEqual({
          totalKeys: 0,
          sessionKeys: 0,
          sessions: []
        })
      })
    })

    describe('Error Handling in Debug Generation', () => {
      it('should handle storage errors during debug info generation', async () => {
        mockAsyncStorage.getAllKeys.mockRejectedValue(new Error('Storage unavailable'))

        const debugInfo = await SessionManager.generateDebugInfo()
        
        expect(debugInfo).toEqual({
          error: 'Failed to generate debug info: Storage unavailable',
          totalKeys: 0,
          sessionKeys: 0,
          sessions: []
        })
      })
    })
  })

  describe('Static Class Properties', () => {
    it('should have all required static methods', () => {
      expect(typeof SessionManager.clearSessionByErrorId).toBe('function')
      expect(typeof SessionManager.forceResetAllConnections).toBe('function')
      expect(typeof SessionManager.preventiveSessionCleanup).toBe('function')
      expect(typeof SessionManager.validateSessionStructure).toBe('function')
      expect(typeof SessionManager.categorizeSessionError).toBe('function')
      expect(typeof SessionManager.extractPeerInfo).toBe('function')
      expect(typeof SessionManager.calculateSessionAge).toBe('function')
      expect(typeof SessionManager.generateDebugInfo).toBe('function')
    })

    it('should not be instantiable', () => {
      expect(() => new (SessionManager as any)()).toThrow()
    })
  })

  describe('Integration and Performance Tests', () => {
    it('should handle concurrent operations safely', async () => {
      const sessionId = 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd'
      mockAsyncStorage.getAllKeys.mockResolvedValue([`wc@2:session_topic:${sessionId}`])
      mockAsyncStorage.multiRemove.mockResolvedValue()

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
      
      mockAsyncStorage.getAllKeys.mockResolvedValue(
        sessionIds.map(id => `wc@2:session_topic:${id}`)
      )
      mockAsyncStorage.multiRemove.mockResolvedValue()

      const start = performance.now()
      
      await Promise.all(
        sessionIds.map(id => SessionManager.clearSessionByErrorId(id))
      )
      
      const end = performance.now()
      expect(end - start).toBeLessThan(2000) // Should handle 50 operations within 2 seconds
    })

    it('should not cause memory leaks with repeated operations', async () => {
      const initialMemory = process.memoryUsage().heapUsed
      
      mockAsyncStorage.getAllKeys.mockResolvedValue(['wc@2:session_topic:test'])
      mockAsyncStorage.multiRemove.mockResolvedValue()

      for (let i = 0; i < 100; i++) {
        await SessionManager.preventiveSessionCleanup()
      }
      
      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = finalMemory - initialMemory
      
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024) // Less than 50MB
    })
  })
})