import { SessionErrorContext } from '@superpool/types'
import { SessionErrorHandler } from './SessionErrorHandler'
import { RecoveryActions } from './ErrorHandler'

// Mock dependencies
jest.mock('../../../utils', () => ({
  SessionManager: {
    clearSessionByErrorId: jest.fn(),
    forceResetAllConnections: jest.fn(),
    preventiveSessionCleanup: jest.fn(),
  },
  authToasts: {
    sessionError: jest.fn(),
  },
}))

describe('SessionErrorHandler', () => {
  let handler: SessionErrorHandler
  let mockDisconnectFunction: jest.Mock
  
  const mockSessionContext: SessionErrorContext = {
    errorMessage: 'WalletConnect session error',
    sessionId: 'abc123',
    isSessionError: true,
  }

  beforeEach(() => {
    mockDisconnectFunction = jest.fn()
    handler = new SessionErrorHandler(mockDisconnectFunction)
    jest.clearAllMocks()
    jest.clearAllTimers()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
  })

  describe('Constructor and Basic Properties', () => {
    it('should initialize with disconnect function', () => {
      expect(handler).toBeDefined()
      expect(handler.getHandlerName()).toBe('session-error')
    })

    it('should initialize without disconnect function', () => {
      const handlerWithoutDisconnect = new SessionErrorHandler(null)
      expect(handlerWithoutDisconnect).toBeDefined()
      expect(handlerWithoutDisconnect.getHandlerName()).toBe('session-error')
    })

    it('should return correct handler name', () => {
      expect(handler.getHandlerName()).toBe('session-error')
    })
  })

  describe('handle method', () => {

    describe('Success Scenarios', () => {
      beforeEach(() => {
        const { SessionManager } = require('../../../utils')
        SessionManager.clearSessionByErrorId.mockResolvedValue(undefined)
        SessionManager.forceResetAllConnections.mockResolvedValue(undefined)
      })

      it('should handle session error with session ID successfully', async () => {
        const result = await handler.handle(mockSessionContext)

        expect(result.shouldDisconnect).toBe(true)
        expect(result.shouldShowError).toBe(false)
        expect(result.errorDelay).toBe(1500)
        expect(result.cleanupPerformed).toBe(true)

        // Verify specific session cleanup was called
        const { SessionManager } = require('../../../utils')
        expect(SessionManager.clearSessionByErrorId).toHaveBeenCalledWith('abc123')
        expect(SessionManager.forceResetAllConnections).toHaveBeenCalled()
        
        // Verify disconnect was called
        expect(mockDisconnectFunction).toHaveBeenCalled()
      })

      it('should handle session error without session ID', async () => {
        const contextWithoutId: SessionErrorContext = {
          ...mockSessionContext,
          sessionId: undefined,
        }

        const result = await handler.handle(contextWithoutId)

        expect(result.cleanupPerformed).toBe(true)

        // Should skip specific session cleanup but still do comprehensive cleanup
        const { SessionManager } = require('../../../utils')
        expect(SessionManager.clearSessionByErrorId).not.toHaveBeenCalled()
        expect(SessionManager.forceResetAllConnections).toHaveBeenCalled()
      })

      it('should show session error feedback with correct timing', async () => {
        await handler.handle(mockSessionContext)

        // Initially no toast should be called
        const { authToasts } = require('../../../utils')
        expect(authToasts.sessionError).not.toHaveBeenCalled()

        // After 1500ms delay
        jest.advanceTimersByTime(1500)
        expect(authToasts.sessionError).toHaveBeenCalled()
      })

      it('should log appropriate messages during success', async () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

        await handler.handle(mockSessionContext)

        expect(consoleSpy).toHaveBeenCalledWith('🚨 Detected WalletConnect session error:', mockSessionContext.errorMessage)
        expect(consoleSpy).toHaveBeenCalledWith('🎯 Attempting to clear specific session: abc123')
        expect(consoleSpy).toHaveBeenCalledWith('🧹 Performing comprehensive session cleanup...')
        expect(consoleSpy).toHaveBeenCalledWith('🔌 Disconnecting wallet after session error handling...')

        consoleSpy.mockRestore()
      })
    })

    describe('Error Scenarios', () => {
      it('should return service unavailable when disconnect function is null', async () => {
        const handlerWithoutDisconnect = new SessionErrorHandler(null)
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

        const result = await handlerWithoutDisconnect.handle(mockSessionContext)

        expect(result).toEqual(RecoveryActions.serviceUnavailable())
        expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Cannot handle session error: disconnect function not available')
        expect(mockDisconnectFunction).not.toHaveBeenCalled()

        consoleErrorSpy.mockRestore()
      })

      it('should handle specific session cleanup failure', async () => {
        const { SessionManager } = require('../../../utils')
        SessionManager.clearSessionByErrorId.mockRejectedValue(new Error('Cleanup failed'))
        SessionManager.forceResetAllConnections.mockRejectedValue(new Error('Force reset failed'))
        SessionManager.preventiveSessionCleanup.mockResolvedValue(undefined)

        const result = await handler.handle(mockSessionContext)

        expect(result.cleanupPerformed).toBe(true) // Fallback succeeded
        expect(SessionManager.clearSessionByErrorId).toHaveBeenCalledWith('abc123')
        expect(SessionManager.forceResetAllConnections).toHaveBeenCalled()
        expect(SessionManager.preventiveSessionCleanup).toHaveBeenCalled()
      })

      it('should handle complete cleanup failure', async () => {
        const { SessionManager } = require('../../../utils')
        SessionManager.clearSessionByErrorId.mockRejectedValue(new Error('Specific cleanup failed'))
        SessionManager.forceResetAllConnections.mockRejectedValue(new Error('Force reset failed'))
        SessionManager.preventiveSessionCleanup.mockRejectedValue(new Error('Fallback failed'))

        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

        const result = await handler.handle(mockSessionContext)

        expect(result.cleanupPerformed).toBe(false)
        expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Session cleanup failed, attempting fallback cleanup:', expect.any(Error))
        expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Fallback session cleanup also failed:', expect.any(Error))

        consoleErrorSpy.mockRestore()
      })

      it('should log warning when cleanup is incomplete', async () => {
        const { SessionManager } = require('../../../utils')
        SessionManager.clearSessionByErrorId.mockRejectedValue(new Error('Cleanup failed'))
        SessionManager.forceResetAllConnections.mockRejectedValue(new Error('Force reset failed'))
        SessionManager.preventiveSessionCleanup.mockRejectedValue(new Error('Fallback failed'))

        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()

        await handler.handle(mockSessionContext)

        expect(consoleWarnSpy).toHaveBeenCalledWith('⚠️ Session cleanup incomplete - some orphaned sessions may remain')

        consoleWarnSpy.mockRestore()
      })

      it('should handle disconnect function throwing error', async () => {
        const { SessionManager } = require('../../../utils')
        SessionManager.clearSessionByErrorId.mockResolvedValue(undefined)
        SessionManager.forceResetAllConnections.mockResolvedValue(undefined)
        
        mockDisconnectFunction.mockImplementation(() => {
          throw new Error('Disconnect failed')
        })

        // Should not throw, should handle gracefully
        const result = await handler.handle(mockSessionContext)
        expect(result).toBeDefined()
        expect(result.cleanupPerformed).toBe(true)
      })
    })

    describe('Cleanup Flow', () => {
      it('should perform specific session cleanup first when session ID is available', async () => {
        const { SessionManager } = require('../../../utils')
        const clearSpecificSpy = SessionManager.clearSessionByErrorId.mockResolvedValue(undefined)
        const forceResetSpy = SessionManager.forceResetAllConnections.mockResolvedValue(undefined)

        await handler.handle(mockSessionContext)

        expect(clearSpecificSpy).toHaveBeenCalledWith('abc123')
        expect(forceResetSpy).toHaveBeenCalled()

        // Check call order
        const clearSpecificCallTime = clearSpecificSpy.mock.invocationCallOrder[0]
        const forceResetCallTime = forceResetSpy.mock.invocationCallOrder[0]
        expect(clearSpecificCallTime).toBeLessThan(forceResetCallTime)
      })

      it('should skip specific cleanup when no session ID', async () => {
        const contextWithoutId: SessionErrorContext = {
          ...mockSessionContext,
          sessionId: undefined,
        }

        const { SessionManager } = require('../../../utils')
        SessionManager.forceResetAllConnections.mockResolvedValue(undefined)

        await handler.handle(contextWithoutId)

        expect(SessionManager.clearSessionByErrorId).not.toHaveBeenCalled()
        expect(SessionManager.forceResetAllConnections).toHaveBeenCalled()
      })

      it('should attempt fallback cleanup on primary cleanup failure', async () => {
        const { SessionManager } = require('../../../utils')
        SessionManager.clearSessionByErrorId.mockRejectedValue(new Error('Primary failed'))
        SessionManager.forceResetAllConnections.mockRejectedValue(new Error('Force reset failed'))
        SessionManager.preventiveSessionCleanup.mockResolvedValue(undefined)

        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()

        await handler.handle(mockSessionContext)

        expect(consoleLogSpy).toHaveBeenCalledWith('🔄 Attempting preventive session cleanup as fallback...')
        expect(SessionManager.preventiveSessionCleanup).toHaveBeenCalled()

        consoleLogSpy.mockRestore()
      })
    })

    describe('Return Values', () => {
      it('should return session error result with cleanup success', async () => {
        const { SessionManager } = require('../../../utils')
        SessionManager.clearSessionByErrorId.mockResolvedValue(undefined)
        SessionManager.forceResetAllConnections.mockResolvedValue(undefined)

        const result = await handler.handle(mockSessionContext)

        expect(result).toEqual(RecoveryActions.sessionError(true))
      })

      it('should return session error result with cleanup failure', async () => {
        const { SessionManager } = require('../../../utils')
        SessionManager.clearSessionByErrorId.mockRejectedValue(new Error('Failed'))
        SessionManager.forceResetAllConnections.mockRejectedValue(new Error('Failed'))
        SessionManager.preventiveSessionCleanup.mockRejectedValue(new Error('Failed'))

        const result = await handler.handle(mockSessionContext)

        expect(result).toEqual(RecoveryActions.sessionError(false))
      })

      it('should always set shouldDisconnect to true', async () => {
        const { SessionManager } = require('../../../utils')
        SessionManager.forceResetAllConnections.mockResolvedValue(undefined)

        const result = await handler.handle(mockSessionContext)

        expect(result.shouldDisconnect).toBe(true)
      })

      it('should never show error in session error results', async () => {
        const { SessionManager } = require('../../../utils')
        SessionManager.forceResetAllConnections.mockResolvedValue(undefined)

        const result = await handler.handle(mockSessionContext)

        expect(result.shouldShowError).toBe(false)
      })
    })

    describe('Timing and Feedback', () => {
      it('should schedule feedback with correct delay', async () => {
        const { SessionManager, authToasts } = require('../../../utils')
        SessionManager.forceResetAllConnections.mockResolvedValue(undefined)

        await handler.handle(mockSessionContext)

        // Toast should not be called immediately
        expect(authToasts.sessionError).not.toHaveBeenCalled()

        // Should be called after 1500ms
        jest.advanceTimersByTime(1499)
        expect(authToasts.sessionError).not.toHaveBeenCalled()

        jest.advanceTimersByTime(1)
        expect(authToasts.sessionError).toHaveBeenCalledTimes(1)
      })

      it('should not interfere with multiple simultaneous handlers', async () => {
        const { SessionManager, authToasts } = require('../../../utils')
        SessionManager.forceResetAllConnections.mockResolvedValue(undefined)

        const handler2 = new SessionErrorHandler(mockDisconnectFunction)

        // Handle two errors simultaneously
        await Promise.all([
          handler.handle(mockSessionContext),
          handler2.handle(mockSessionContext)
        ])

        // Both should schedule their own toasts
        jest.advanceTimersByTime(1500)
        expect(authToasts.sessionError).toHaveBeenCalledTimes(2)
      })
    })

    describe('Edge Cases', () => {
      it('should handle empty session ID', async () => {
        const contextWithEmptyId: SessionErrorContext = {
          ...mockSessionContext,
          sessionId: '',
        }

        const { SessionManager } = require('../../../utils')
        SessionManager.clearSessionByErrorId.mockResolvedValue(undefined)
        SessionManager.forceResetAllConnections.mockResolvedValue(undefined)

        await handler.handle(contextWithEmptyId)

        expect(SessionManager.clearSessionByErrorId).toHaveBeenCalledWith('')
        expect(SessionManager.forceResetAllConnections).toHaveBeenCalled()
      })

      it('should handle very long session IDs', async () => {
        const longSessionId = 'a'.repeat(1000)
        const contextWithLongId: SessionErrorContext = {
          ...mockSessionContext,
          sessionId: longSessionId,
        }

        const { SessionManager } = require('../../../utils')
        SessionManager.clearSessionByErrorId.mockResolvedValue(undefined)
        SessionManager.forceResetAllConnections.mockResolvedValue(undefined)

        await handler.handle(contextWithLongId)

        expect(SessionManager.clearSessionByErrorId).toHaveBeenCalledWith(longSessionId)
      })

      it('should handle special characters in error messages', async () => {
        const specialMessageContext: SessionErrorContext = {
          errorMessage: 'WalletConnect error: [special] chars & symbols!',
          sessionId: 'abc-123_def',
          isSessionError: true,
        }

        const { SessionManager } = require('../../../utils')
        SessionManager.forceResetAllConnections.mockResolvedValue(undefined)

        const result = await handler.handle(specialMessageContext)

        expect(result).toBeDefined()
        expect(result.cleanupPerformed).toBe(true)
      })

      it('should handle concurrent cleanup operations', async () => {
        const { SessionManager } = require('../../../utils')
        
        let resolveCleanup: () => void
        const cleanupPromise = new Promise<void>(resolve => {
          resolveCleanup = resolve
        })
        
        SessionManager.forceResetAllConnections.mockReturnValue(cleanupPromise)

        // Start multiple handlers simultaneously
        const promises = [
          handler.handle(mockSessionContext),
          handler.handle({ ...mockSessionContext, sessionId: 'other-session' }),
        ]

        // Let them all start, then resolve
        resolveCleanup!()
        const results = await Promise.all(promises)

        expect(results).toHaveLength(2)
        expect(results.every(r => r.shouldDisconnect)).toBe(true)
        expect(mockDisconnectFunction).toHaveBeenCalledTimes(2)
      })
    })

    describe('Performance', () => {
      it('should handle session errors quickly', async () => {
        const { SessionManager } = require('../../../utils')
        SessionManager.forceResetAllConnections.mockResolvedValue(undefined)

        const start = performance.now()
        
        await handler.handle(mockSessionContext)
        
        const end = performance.now()
        expect(end - start).toBeLessThan(50) // Should be very fast
      })

      it('should handle multiple session errors efficiently', async () => {
        const { SessionManager } = require('../../../utils')
        SessionManager.forceResetAllConnections.mockResolvedValue(undefined)

        const contexts = Array.from({ length: 100 }, (_, i) => ({
          ...mockSessionContext,
          sessionId: `session-${i}`,
        }))

        const start = performance.now()
        
        await Promise.all(contexts.map(context => handler.handle(context)))
        
        const end = performance.now()
        expect(end - start).toBeLessThan(1000) // Should handle 100 errors within 1 second
      })
    })
  })

  describe('Integration with RecoveryActions', () => {
    it('should return results consistent with RecoveryActions.sessionError', async () => {
      const { SessionManager } = require('../../../utils')
      SessionManager.forceResetAllConnections.mockResolvedValue(undefined)

      const handlerResult = await handler.handle(mockSessionContext)
      const directResult = RecoveryActions.sessionError(true)

      expect(handlerResult).toEqual(directResult)
    })

    it('should handle both success and failure cases correctly', async () => {
      const { SessionManager } = require('../../../utils')
      
      // Test success case
      SessionManager.forceResetAllConnections.mockResolvedValue(undefined)
      const successResult = await handler.handle(mockSessionContext)
      expect(successResult).toEqual(RecoveryActions.sessionError(true))

      // Test failure case
      SessionManager.forceResetAllConnections.mockRejectedValue(new Error('Failed'))
      SessionManager.preventiveSessionCleanup.mockRejectedValue(new Error('Failed'))
      const failureResult = await handler.handle(mockSessionContext)
      expect(failureResult).toEqual(RecoveryActions.sessionError(false))
    })
  })
})