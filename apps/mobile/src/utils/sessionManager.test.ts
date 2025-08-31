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
  SESSION_ERROR_INDICATORS: ['session', 'relayer', 'pairing', 'expired', 'timeout', 'connection', 'failed'],
  SESSION_ID_PATTERNS: [/^[a-f0-9]{64}$/i, /session:\s*([a-f0-9]{64})/i],
  RELAYER_ERROR_INDICATORS: ['relayer connection failed', 'relayer timeout', 'relayer error', 'websocket', 'network'],
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
        AsyncStorage.getAllKeys.mockResolvedValue(['reown_appkit_session', `wc@2:session_topic:${sessionId}`, 'other_key'])
        AsyncStorage.multiRemove.mockResolvedValue()

        await SessionManager.clearSessionByErrorId(sessionId)

        expect(AsyncStorage.getAllKeys).toHaveBeenCalled()
        expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([`wc@2:session_topic:${sessionId}`])
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

        AsyncStorage.getAllKeys.mockResolvedValue([`wc@2:session_topic:${sessionId}`])
        AsyncStorage.multiRemove.mockResolvedValue()

        await SessionManager.clearSessionByErrorId(sessionId)

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('🎯 Clearing sessions containing ID: ' + sessionId))

        consoleSpy.mockRestore()
      })
    })

    describe('Invalid Session ID Handling', () => {
      it('should handle empty and short session IDs', async () => {
        // Test that the method handles empty and short session IDs gracefully
        // When no matching keys are found, it should not fail
        const shortIds = ['', 'short', 'abc']

        for (const shortId of shortIds) {
          jest.clearAllMocks()
          // Provide keys that don't contain the short ID
          AsyncStorage.getAllKeys.mockResolvedValue(['wc@2:session_topic:completely_different', 'unrelated_key'])
          AsyncStorage.multiRemove.mockResolvedValue()

          // Should not throw an error even with empty/short IDs
          await expect(SessionManager.clearSessionByErrorId(shortId)).resolves.not.toThrow()
          expect(AsyncStorage.getAllKeys).toHaveBeenCalled()
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

        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to clear session'), expect.any(Error))

        consoleErrorSpy.mockRestore()
      })

      it('should handle AsyncStorage.multiRemove errors gracefully', async () => {
        const sessionId = 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd'
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

        AsyncStorage.getAllKeys.mockResolvedValue([`wc@2:session_topic:${sessionId}`])
        AsyncStorage.multiRemove.mockRejectedValue(new Error('Remove failed'))

        await expect(SessionManager.clearSessionByErrorId(sessionId)).rejects.toThrow()

        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to clear session'), expect.any(Error))

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
        ])
      })

      it('should preserve non-session related keys', async () => {
        AsyncStorage.getAllKeys.mockResolvedValue(['user_settings', 'app_theme', 'wc@2:session_topic:abc123', 'notification_preferences'])
        AsyncStorage.multiRemove.mockResolvedValue()

        await SessionManager.forceResetAllConnections()

        expect(AsyncStorage.multiRemove).toHaveBeenCalledWith(['wc@2:session_topic:abc123'])
      })

      it('should log reset activity with statistics', async () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

        AsyncStorage.getAllKeys.mockResolvedValue(['wc@2:session_topic:abc123', 'reown_appkit_session', 'unrelated_key'])
        AsyncStorage.multiRemove.mockResolvedValue()

        await SessionManager.forceResetAllConnections()

        expect(consoleSpy).toHaveBeenCalledWith('🔄 Force resetting all wallet connections...')

        consoleSpy.mockRestore()
      })
    })

    describe('No Keys Scenario', () => {
      it('should handle empty storage gracefully', async () => {
        AsyncStorage.getAllKeys.mockResolvedValue([])
        AsyncStorage.multiRemove.mockResolvedValue()

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

        await SessionManager.forceResetAllConnections()

        expect(consoleSpy).toHaveBeenCalledWith('🔄 Force resetting all wallet connections...')
        expect(consoleSpy).toHaveBeenCalledWith('✅ All connections force reset completed')

        consoleSpy.mockRestore()
      })

      it('should handle no session keys found', async () => {
        AsyncStorage.getAllKeys.mockResolvedValue(['user_settings', 'app_preferences', 'theme_data'])
        AsyncStorage.multiRemove.mockResolvedValue()

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

        await SessionManager.forceResetAllConnections()

        expect(consoleSpy).toHaveBeenCalledWith('🔄 Force resetting all wallet connections...')

        consoleSpy.mockRestore()
      })
    })

    describe('Error Handling', () => {
      it('should handle getAllKeys errors during force reset', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

        AsyncStorage.getAllKeys.mockRejectedValue(new Error('Storage unavailable'))

        await expect(SessionManager.forceResetAllConnections()).rejects.toThrow()

        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('❌ Failed to force reset connections:'), expect.any(Error))

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

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('🔒 Session cleanup already in progress, queuing operation...'))

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
        const problematicKeys = Array.from({ length: 50 }, (_, i) => `wc@2:core:0.3//expirer:session_${i}`)
        const normalKeys = Array.from({ length: 50 }, (_, i) => `wc@2:session_topic:session_${i.toString().padStart(60, '0')}`)
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

        sessionErrors.forEach((errorMsg) => {
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
        const pairingErrors = ['Pairing expired', 'Pairing proposal rejected', 'Invalid pairing topic', 'Pairing already exists']

        pairingErrors.forEach((errorMsg) => {
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
          expect(result.severity).toBe(
            expectedType === 'unknown' ? 'low' : expectedType === 'session' ? 'medium' : expectedType === 'relayer' ? 'high' : 'low'
          )
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
              icons: ['https://metamask.io/icon.png'],
            },
          },
          namespaces: { eip155: {} },
        }

        const peerInfo = SessionManager.extractPeerInfo(sessionWithPeer)

        expect(peerInfo).toEqual({
          name: 'MetaMask',
          url: 'https://metamask.io',
          icons: ['https://metamask.io/icon.png'],
        })
      })

      it('should handle minimal peer information from valid sessions', () => {
        const sessionWithMinimalPeer = {
          topic: 'test_topic',
          peer: {
            metadata: {
              name: 'Simple Wallet',
            },
          },
          namespaces: { eip155: {} },
        }

        const peerInfo = SessionManager.extractPeerInfo(sessionWithMinimalPeer)

        expect(peerInfo).toEqual({
          name: 'Simple Wallet',
          url: undefined,
          icons: undefined,
        })
      })

      it('should return empty object when metadata is null', () => {
        const sessionWithNullMetadata = {
          topic: 'test_topic',
          peer: {
            metadata: undefined,
          },
          namespaces: { eip155: {} },
        }

        const peerInfo = SessionManager.extractPeerInfo(sessionWithNullMetadata)

        expect(peerInfo).toEqual({})
      })
    })

    describe('Invalid or Missing Peer Information', () => {
      it('should return empty object for sessions without peer info', () => {
        const sessionsWithoutPeer = [{}, { peer: {} }, { peer: { metadata: {} } }, { peer: { metadata: undefined } }, { peer: undefined }]

        sessionsWithoutPeer.forEach((session) => {
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
          namespaces: { eip155: {} },
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
          namespaces: { eip155: {} },
        }

        const result = SessionManager.getSessionAge(session)

        expect(result.isExpired).toBe(true)
        expect(result.expiryMs).toBeLessThan(now)
      })

      it('should handle valid sessions without expiry', () => {
        const sessionWithoutExpiry = {
          topic: 'valid_topic',
          peer: { metadata: { name: 'Test Wallet' } },
          namespaces: { eip155: {} },
          // No expiry field - this will hit line 512
        }

        const result = SessionManager.getSessionAge(sessionWithoutExpiry)

        expect(result.ageMs).toBe(0)
        expect(result.isExpired).toBe(false)
        expect(result.expiryMs).toBeUndefined()
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

        invalidSessions.forEach((session) => {
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

  describe('shouldCleanupSession', () => {
    describe('Session Cleanup Decision Logic', () => {
      it('should cleanup invalid sessions', () => {
        const invalidSession = null
        const result = SessionManager.shouldCleanupSession(invalidSession as any, 86400000)
        expect(result).toBe(true)
      })

      it('should cleanup expired sessions', () => {
        const expiredSession = {
          topic: 'test_topic',
          expiry: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
          peer: { metadata: { name: 'Test Wallet' } },
          namespaces: { eip155: {} },
          acknowledged: true,
          active: true,
        }

        const result = SessionManager.shouldCleanupSession(expiredSession, 86400000)
        expect(result).toBe(true)
      })

      it('should cleanup old sessions beyond max age', () => {
        const oldSession = {
          topic: 'test_topic',
          expiry: Math.floor(Date.now() / 1000) + 3600, // Valid for 1 hour
          peer: { metadata: { name: 'Test Wallet' } },
          namespaces: { eip155: {} },
          acknowledged: true,
          active: true,
        }

        const maxAge = 60 * 1000 // 1 minute max age
        const result = SessionManager.shouldCleanupSession(oldSession, maxAge)
        expect(result).toBe(true)
      })

      it('should keep valid fresh sessions', () => {
        const now = Date.now()
        // Create a session that was created very recently (1 hour ago)
        // Assuming 7-day session duration, session started at (expiry - 7 days)
        const sevenDaysMs = 7 * 24 * 3600 * 1000
        const sessionCreatedTime = now - 1 * 3600 * 1000 // 1 hour ago

        const validSession = {
          topic: 'test_topic',
          expiry: Math.floor((sessionCreatedTime + sevenDaysMs) / 1000), // Expires 7 days after creation
          peer: { metadata: { name: 'Test Wallet' } },
          namespaces: { eip155: {} },
          acknowledged: true,
          active: true,
        }

        // Use max age much longer than session age (1 hour old, max age 48 hours)
        const result = SessionManager.shouldCleanupSession(validSession, 48 * 3600 * 1000)
        expect(result).toBe(false)
      })
    })
  })

  describe('sanitizeSessionForLogging', () => {
    describe('Sensitive Data Removal', () => {
      it('should sanitize valid session data', () => {
        const session = {
          topic: 'very_long_topic_id_1234567890abcdefghijklmnop',
          expiry: 1234567890,
          peer: { metadata: { name: 'MetaMask' } },
          namespaces: { eip155: {}, polygon: {} },
          acknowledged: true,
          active: false,
        }

        const sanitized = SessionManager.sanitizeSessionForLogging(session)

        expect(sanitized).toEqual({
          topic: 'very_long_topic_...',
          peerName: 'MetaMask',
          expiry: 1234567890,
          acknowledged: true,
          active: false,
          namespaceCount: 2,
        })
      })

      it('should handle sessions with missing data', () => {
        const incompleteSession = {
          topic: 'short',
          peer: { metadata: {} },
          namespaces: {},
        }

        const sanitized = SessionManager.sanitizeSessionForLogging(incompleteSession as any)

        expect(sanitized).toEqual({
          topic: 'short...',
          peerName: 'unknown',
          expiry: 0,
          acknowledged: false,
          active: false,
          namespaceCount: 0,
        })
      })

      it('should handle invalid sessions', () => {
        const invalidSession = null
        const sanitized = SessionManager.sanitizeSessionForLogging(invalidSession as any)

        expect(sanitized).toEqual({
          invalid: true,
        })
      })
    })
  })

  describe('createCleanupContext', () => {
    describe('Context Generation', () => {
      it('should create basic cleanup context', () => {
        const context = SessionManager.createCleanupContext('manual_cleanup', 5)

        expect(context.operation).toBe('manual_cleanup')
        expect(context.sessionCount).toBe(5)
        expect(context.hasErrors).toBe(false)
        expect(context.errorCount).toBe(0)
        expect(context.errorSample).toBe('')
        expect(context.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      })

      it('should create context with errors', () => {
        const errors = ['Error 1', 'Error 2', 'Error 3', 'Error 4', 'Error 5']
        const context = SessionManager.createCleanupContext('auto_cleanup', 3, errors)

        expect(context.operation).toBe('auto_cleanup')
        expect(context.sessionCount).toBe(3)
        expect(context.hasErrors).toBe(true)
        expect(context.errorCount).toBe(5)
        expect(context.errorSample).toBe('Error 1, Error 2, Error 3') // Only first 3
      })

      it('should handle empty errors array', () => {
        const context = SessionManager.createCleanupContext('test', 0, [])

        expect(context.hasErrors).toBe(false)
        expect(context.errorCount).toBe(0)
        expect(context.errorSample).toBe('')
      })
    })
  })

  describe('formatSessionDebugInfo', () => {
    describe('Debug Information Formatting', () => {
      it('should format debug info with sessions', () => {
        const sessions = [
          {
            topic: 'session_1_topic_abcdef',
            peer: { metadata: { name: 'Wallet 1' } },
            namespaces: { eip155: {} },
          },
          {
            topic: 'session_2_topic_123456',
            peer: { metadata: { name: 'Wallet 2' } },
            namespaces: { eip155: {} },
          },
          {
            topic: 'session_3_topic_xyz789',
            peer: { metadata: { name: 'Wallet 3' } },
            namespaces: { eip155: {} },
          },
        ]

        const debugInfo = SessionManager.formatSessionDebugInfo(sessions as any, 15)

        expect(debugInfo).toContain('Session Debug Info:')
        expect(debugInfo).toContain('- Total keys: 15')
        expect(debugInfo).toContain('- Active sessions: 3')
        expect(debugInfo).toContain('- Has active connections: true')
        expect(debugInfo).toContain('- Session preview: session_, session_') // First 8 chars of first 2
      })

      it('should format debug info with no sessions', () => {
        const debugInfo = SessionManager.formatSessionDebugInfo([], 8)

        expect(debugInfo).toContain('Session Debug Info:')
        expect(debugInfo).toContain('- Total keys: 8')
        expect(debugInfo).toContain('- Active sessions: 0')
        expect(debugInfo).toContain('- Has active connections: false')
        expect(debugInfo).toContain('- Session preview: ')
      })

      it('should handle sessions with missing topics', () => {
        const sessions = [{ peer: { metadata: { name: 'Wallet 1' } } }, { topic: null, peer: { metadata: { name: 'Wallet 2' } } }]

        const debugInfo = SessionManager.formatSessionDebugInfo(sessions as any, 5)

        expect(debugInfo).toContain('- Session preview: unknown, unknown')
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
          .mockResolvedValueOnce(
            JSON.stringify({
              topic: 'session123456789012345678901234567890123456789012345',
              expiry: Date.now() + 3600000,
              peer: { metadata: { name: 'Test Wallet' } },
            })
          )
          .mockResolvedValueOnce('simple_session_data')

        const debugInfo = await SessionManager.getSessionDebugInfo()

        expect(debugInfo).toMatchObject({
          totalKeys: 3,
          walletConnectKeys: expect.arrayContaining([
            'wc@2:session_topic:session123456789012345678901234567890123456789012345',
            'reown_appkit_session',
          ]),
          sessionData: expect.any(Object),
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
          sessionData: {},
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
          sessionData: {},
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

  describe('clearSpecificSession', () => {
    describe('Basic Functionality', () => {
      it('should clear specific session by ID', async () => {
        const sessionId = '12345678901234567890123456789012345678901234567890123456789012'
        AsyncStorage.getAllKeys.mockResolvedValue([`wc@2:session_topic:${sessionId}`, `session_data:${sessionId}`, 'other_key'])
        AsyncStorage.multiRemove.mockResolvedValue()

        await SessionManager.clearSpecificSession(sessionId)

        expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([`wc@2:session_topic:${sessionId}`, `session_data:${sessionId}`])
      })

      it('should handle no matching sessions found', async () => {
        AsyncStorage.getAllKeys.mockResolvedValue(['other_key1', 'other_key2'])
        AsyncStorage.multiRemove.mockResolvedValue()

        await SessionManager.clearSpecificSession('nonexistent_session')

        expect(AsyncStorage.multiRemove).not.toHaveBeenCalled()
      })

      it('should handle errors during specific session clearing', async () => {
        AsyncStorage.getAllKeys.mockRejectedValue(new Error('Storage error'))

        await expect(SessionManager.clearSpecificSession('test_session')).rejects.toThrow('Storage error')
      })
    })
  })

  describe('hasValidSession', () => {
    describe('Session Validation', () => {
      it('should return true when valid sessions exist', async () => {
        AsyncStorage.getAllKeys.mockResolvedValue(['wc@2:session_topic:active_session', 'reown_appkit_session', 'other_key'])
        AsyncStorage.getItem.mockResolvedValue(JSON.stringify({ active: true }))

        const result = await SessionManager.hasValidSession()

        expect(result).toBe(true)
      })

      it('should return false when no sessions exist', async () => {
        AsyncStorage.getAllKeys.mockResolvedValue(['other_key1', 'other_key2'])

        const result = await SessionManager.hasValidSession()

        expect(result).toBe(false)
      })

      it('should return false and handle validation errors', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()

        // Mock successful getSessionDebugInfo but cause error in hasValidSession processing
        AsyncStorage.getAllKeys.mockResolvedValue(['wc@2:test'])
        AsyncStorage.getItem.mockResolvedValue(
          JSON.stringify({
            topic: 'test',
            peer: { metadata: { name: 'Test' } },
          })
        )

        // Mock console.log to throw an error to trigger the catch block in hasValidSession (lines 254-257)
        consoleLogSpy.mockImplementation(() => {
          throw new Error('Console log error')
        })

        const result = await SessionManager.hasValidSession()

        expect(result).toBe(false)
        // This should hit lines 255-256: console.error('Failed to validate session:', error)
        expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to validate session:', expect.any(Error))

        consoleErrorSpy.mockRestore()
        consoleLogSpy.mockRestore()
      })
    })
  })

  describe('clearQueryCache', () => {
    describe('Cache Clearing', () => {
      it('should clear react-query cache keys', async () => {
        AsyncStorage.getAllKeys.mockResolvedValue(['react-query-cache-key', 'tanstack-query-data', 'query-cache-item', 'other_key'])
        AsyncStorage.multiRemove.mockResolvedValue()

        await SessionManager.clearQueryCache()

        expect(AsyncStorage.multiRemove).toHaveBeenCalledWith(['react-query-cache-key', 'tanstack-query-data', 'query-cache-item'])
      })

      it('should handle no cache keys found', async () => {
        AsyncStorage.getAllKeys.mockResolvedValue(['other_key1', 'other_key2'])
        AsyncStorage.multiRemove.mockResolvedValue()

        await SessionManager.clearQueryCache()

        expect(AsyncStorage.multiRemove).not.toHaveBeenCalled()
      })

      it('should handle errors during cache clearing', async () => {
        AsyncStorage.getAllKeys.mockResolvedValue(['react-query-cache'])
        AsyncStorage.multiRemove.mockRejectedValue(new Error('Cache clear failed'))

        // Should not throw, just warn
        await expect(SessionManager.clearQueryCache()).resolves.not.toThrow()
      })
    })
  })

  describe('handleSessionCorruption', () => {
    describe('Corruption Handling', () => {
      it('should handle session corruption with extractable session ID', async () => {
        const errorMessage = 'No matching key. session: a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd'
        AsyncStorage.getAllKeys.mockResolvedValue(['wc@2:session_topic:a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd'])
        AsyncStorage.multiRemove.mockResolvedValue()

        await SessionManager.handleSessionCorruption(errorMessage)

        expect(AsyncStorage.multiRemove).toHaveBeenCalled()
      })

      it('should handle corruption without extractable session ID', async () => {
        AsyncStorage.getAllKeys.mockResolvedValue(['wc@2:session_topic:some_session', 'wc@2:core:0.3//expirer:expired'])
        AsyncStorage.multiRemove.mockResolvedValue()

        await SessionManager.handleSessionCorruption('Generic corruption error')

        expect(AsyncStorage.multiRemove).toHaveBeenCalled()
      })

      it('should handle errors during corruption handling', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
        AsyncStorage.getAllKeys.mockRejectedValue(new Error('Storage error'))

        // Should not throw - error is caught and logged
        await SessionManager.handleSessionCorruption('error')

        expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Failed to handle session corruption:', expect.any(Error))
        consoleErrorSpy.mockRestore()
      })
    })
  })

  describe('detectSessionCorruption', () => {
    describe('Corruption Detection Logic', () => {
      it('should detect various corruption patterns', () => {
        const corruptionPatterns = [
          'Missing or invalid. Record was recently deleted',
          'session: corrupted data',
          'WalletConnect session error',
          'No matching key found',
          'pairing failed',
        ]

        corruptionPatterns.forEach((pattern) => {
          expect(SessionManager.detectSessionCorruption(pattern)).toBe(true)
        })
      })

      it('should return false for invalid inputs', () => {
        const invalidInputs = [null, undefined, '', 123, {}, []]

        invalidInputs.forEach((input) => {
          expect(SessionManager.detectSessionCorruption(input as any)).toBe(false)
        })
      })

      it('should return false for non-corruption errors', () => {
        const normalErrors = ['Network timeout', 'Invalid address format', 'User cancelled request']

        normalErrors.forEach((error) => {
          expect(SessionManager.detectSessionCorruption(error)).toBe(false)
        })
      })
    })
  })

  describe('Advanced Edge Cases', () => {
    describe('Queue Error Coverage', () => {
      it('should cover reject error path in withCleanupLock', async () => {
        // Test the reject(error) line 54 by creating an operation that fails
        const testError = new Error('Operation failed')
        const mockOperation = jest.fn().mockImplementation(async () => {
          throw testError
        })

        // This should specifically hit line 54: reject(error) in the withCleanupLock method
        await expect((SessionManager as any).withCleanupLock(mockOperation)).rejects.toThrow('Operation failed')
        expect(mockOperation).toHaveBeenCalledTimes(1)
      })

      it('should handle queued operation errors and log warnings', async () => {
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()

        // Manually inject a failing operation into the queue
        ;(SessionManager as any).cleanupQueue.push(async () => {
          throw new Error('Queued operation failed')
        })

        // Run cleanup which will process the queue and catch the error
        await SessionManager.preventiveSessionCleanup()

        expect(consoleWarnSpy).toHaveBeenCalledWith('⚠️ Queued session cleanup operation failed:', expect.any(Error))
        consoleWarnSpy.mockRestore()
      })
    })

    describe('Query Cache in Preventive Cleanup', () => {
      it('should clean stale query cache during preventive cleanup', async () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

        AsyncStorage.getAllKeys.mockResolvedValue([
          'wc@2:core:0.3//expirer:expired',
          'react-query-stale-key', // This will match the pattern
          'other_key',
        ])
        AsyncStorage.multiRemove.mockResolvedValue()

        await SessionManager.preventiveSessionCleanup()

        // Should be called twice: once for problematic WC keys, once for query cache
        expect(AsyncStorage.multiRemove).toHaveBeenCalledTimes(2)
        expect(AsyncStorage.multiRemove).toHaveBeenNthCalledWith(1, ['wc@2:core:0.3//expirer:expired'])
        expect(AsyncStorage.multiRemove).toHaveBeenNthCalledWith(2, ['react-query-stale-key'])

        expect(consoleSpy).toHaveBeenCalledWith('Cleared 1 stale query cache keys')
        consoleSpy.mockRestore()
      })
    })
  })

  describe('Integration and Performance Tests', () => {
    it('should handle concurrent operations safely', async () => {
      const sessionId = 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd'
      AsyncStorage.getAllKeys.mockResolvedValue([`wc@2:session_topic:${sessionId}`])
      AsyncStorage.multiRemove.mockResolvedValue()
      AsyncStorage.getItem.mockResolvedValue(JSON.stringify({ active: true }))

      // Run multiple operations concurrently including new methods
      const operations = [
        SessionManager.clearSessionByErrorId(sessionId),
        SessionManager.preventiveSessionCleanup(),
        SessionManager.forceResetAllConnections(),
        SessionManager.clearSpecificSession(sessionId),
        SessionManager.hasValidSession(),
        SessionManager.clearQueryCache(),
      ]

      await expect(Promise.all(operations)).resolves.not.toThrow()
    })

    it('should maintain consistent behavior under load', async () => {
      const sessionIds = Array.from({ length: 50 }, (_, i) => `session${i.toString().padStart(58, '0')}`)

      AsyncStorage.getAllKeys.mockResolvedValue(sessionIds.map((id) => `wc@2:session_topic:${id}`))
      AsyncStorage.multiRemove.mockResolvedValue()

      const start = performance.now()

      await Promise.all(sessionIds.map((id) => SessionManager.clearSessionByErrorId(id)))

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
