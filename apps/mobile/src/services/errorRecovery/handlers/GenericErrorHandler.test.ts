import { ErrorType } from '../../../utils/errorHandling'
import { GenericErrorHandler, GenericErrorContext } from './GenericErrorHandler'
import { RecoveryActions } from './ErrorHandler'

// Mock the utility functions
jest.mock('../../../utils', () => ({
  isUserInitiatedError: jest.fn(),
}))

describe('GenericErrorHandler', () => {
  let handler: GenericErrorHandler
  let mockDisconnectFunction: jest.Mock
  let mockAppError: any

  beforeEach(() => {
    mockDisconnectFunction = jest.fn()
    handler = new GenericErrorHandler(mockDisconnectFunction)

    mockAppError = {
      name: 'AppError',
      message: 'Test error message',
      type: ErrorType.AUTHENTICATION_FAILED,
      userFriendlyMessage: 'Authentication failed. Please try connecting your wallet again.',
    }

    jest.clearAllMocks()
  })

  describe('Constructor and Basic Properties', () => {
    it('should initialize with disconnect function', () => {
      expect(handler).toBeDefined()
      expect(handler.getHandlerName()).toBe('generic-error')
    })

    it('should initialize without disconnect function', () => {
      const handlerWithoutDisconnect = new GenericErrorHandler(null)
      expect(handlerWithoutDisconnect).toBeDefined()
      expect(handlerWithoutDisconnect.getHandlerName()).toBe('generic-error')
    })

    it('should return correct handler name', () => {
      expect(handler.getHandlerName()).toBe('generic-error')
    })
  })

  describe('handle method', () => {
    const createMockContext = (overrides: Partial<GenericErrorContext> = {}): GenericErrorContext => ({
      appError: mockAppError,
      isConnected: true,
      originalError: new Error('Original error'),
      ...overrides,
    })

    describe('User-Initiated Errors', () => {
      beforeEach(() => {
        const { isUserInitiatedError } = require('../../../utils')
        isUserInitiatedError.mockReturnValue(true)
      })

      it('should handle user-initiated errors without disconnecting', () => {
        const context = createMockContext({ isConnected: true })

        const result = handler.handle(context)

        expect(result.shouldDisconnect).toBe(false)
        expect(result.shouldShowError).toBe(true)
        expect(result.errorDelay).toBe(1500)
        expect(result.cleanupPerformed).toBe(false)
        expect(mockDisconnectFunction).not.toHaveBeenCalled()
      })

      it('should handle user-initiated errors when not connected', () => {
        const context = createMockContext({ isConnected: false })

        const result = handler.handle(context)

        expect(result.shouldDisconnect).toBe(false)
        expect(result.shouldShowError).toBe(true)
        expect(mockDisconnectFunction).not.toHaveBeenCalled()
      })

      it('should log user-initiated error details', () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
        const context = createMockContext()

        handler.handle(context)

        expect(consoleSpy).toHaveBeenCalledWith('Authentication error details:', {
          errorType: mockAppError.type,
          isUserInitiated: true,
          message: mockAppError.userFriendlyMessage,
          originalError: mockAppError.originalError,
        })

        consoleSpy.mockRestore()
      })

      it('should use immediate delay for user-initiated errors when not disconnecting', () => {
        const context = createMockContext({ isConnected: false })

        const result = handler.handle(context)

        expect(result.errorDelay).toBe(1500)
      })
    })

    describe('Technical Failures', () => {
      beforeEach(() => {
        const { isUserInitiatedError } = require('../../../utils')
        isUserInitiatedError.mockReturnValue(false)
      })

      it('should disconnect and show error for technical failures when connected', () => {
        const context = createMockContext({ isConnected: true })

        const result = handler.handle(context)

        expect(result.shouldDisconnect).toBe(true)
        expect(result.shouldShowError).toBe(true)
        expect(result.errorDelay).toBe(2000) // Delay after disconnect
        expect(result.cleanupPerformed).toBe(false)
        expect(mockDisconnectFunction).toHaveBeenCalledTimes(1)
      })

      it('should not disconnect when already disconnected', () => {
        const context = createMockContext({ isConnected: false })

        const result = handler.handle(context)

        expect(result.shouldDisconnect).toBe(false)
        expect(result.shouldShowError).toBe(true)
        expect(result.errorDelay).toBe(0) // Immediate for non-disconnect scenario
        expect(mockDisconnectFunction).not.toHaveBeenCalled()
      })

      it('should log disconnect action for technical failures', () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
        const context = createMockContext({ isConnected: true })

        handler.handle(context)

        expect(consoleSpy).toHaveBeenCalledWith('Disconnecting wallet due to authentication failure')
        expect(consoleSpy).toHaveBeenCalledWith('Scheduling error toast after disconnect (2s delay)')

        consoleSpy.mockRestore()
      })

      it('should handle disconnect function throwing error', () => {
        mockDisconnectFunction.mockImplementation(() => {
          throw new Error('Disconnect failed')
        })

        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()
        const context = createMockContext({ isConnected: true })

        const result = handler.handle(context)

        expect(result.shouldDisconnect).toBe(true)
        expect(consoleWarnSpy).toHaveBeenCalledWith('Failed to disconnect wallet:', expect.any(Error))
        expect(mockDisconnectFunction).toHaveBeenCalled()

        consoleWarnSpy.mockRestore()
      })

      it('should gracefully handle missing disconnect function', () => {
        const handlerWithoutDisconnect = new GenericErrorHandler(null)
        const context = createMockContext({ isConnected: true })

        const result = handlerWithoutDisconnect.handle(context)

        expect(result.shouldDisconnect).toBe(true)
        expect(result.shouldShowError).toBe(true)
        // Should not throw even without disconnect function
      })
    })

    describe('Error Delay Calculation', () => {
      it('should calculate 2000ms delay for disconnect scenarios', () => {
        const { isUserInitiatedError } = require('../../../utils')
        isUserInitiatedError.mockReturnValue(false)

        const context = createMockContext({ isConnected: true })
        const result = handler.handle(context)

        expect(result.errorDelay).toBe(2000)
      })

      it('should calculate 1500ms delay for user-initiated errors', () => {
        const { isUserInitiatedError } = require('../../../utils')
        isUserInitiatedError.mockReturnValue(true)

        const context = createMockContext({ isConnected: true })
        const result = handler.handle(context)

        expect(result.errorDelay).toBe(1500)
      })

      it('should calculate 0ms delay for non-disconnect technical errors', () => {
        const { isUserInitiatedError } = require('../../../utils')
        isUserInitiatedError.mockReturnValue(false)

        const context = createMockContext({ isConnected: false })
        const result = handler.handle(context)

        expect(result.errorDelay).toBe(0)
      })

      it('should use createResult with calculated delay', () => {
        const { isUserInitiatedError } = require('../../../utils')
        isUserInitiatedError.mockReturnValue(false)

        const context = createMockContext({ isConnected: true })
        const result = handler.handle(context)

        const expectedResult = RecoveryActions.createResult(true, true, 2000, false)
        expect(result).toEqual(expectedResult)
      })
    })

    describe('Logging Behavior', () => {
      it('should log error details for all errors', () => {
        const { isUserInitiatedError } = require('../../../utils')
        isUserInitiatedError.mockReturnValue(false)

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
        const context = createMockContext()

        handler.handle(context)

        expect(consoleSpy).toHaveBeenCalledWith('Authentication error details:', {
          errorType: mockAppError.type,
          isUserInitiated: false,
          message: mockAppError.userFriendlyMessage,
          originalError: mockAppError.originalError,
        })

        consoleSpy.mockRestore()
      })

      it('should log different messages for disconnect vs non-disconnect scenarios', () => {
        const { isUserInitiatedError } = require('../../../utils')
        isUserInitiatedError.mockReturnValue(false)

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

        // Test disconnect scenario
        const connectedContext = createMockContext({ isConnected: true })
        handler.handle(connectedContext)
        expect(consoleSpy).toHaveBeenCalledWith('Scheduling error toast after disconnect (2s delay)')

        consoleSpy.mockClear()

        // Test non-disconnect scenario
        const disconnectedContext = createMockContext({ isConnected: false })
        handler.handle(disconnectedContext)
        expect(consoleSpy).toHaveBeenCalledWith('Scheduling error toast for non-disconnect scenario (0ms delay)')

        consoleSpy.mockRestore()
      })

      it('should log user-initiated scenarios correctly', () => {
        const { isUserInitiatedError } = require('../../../utils')
        isUserInitiatedError.mockReturnValue(true)

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
        const context = createMockContext({ isConnected: true })

        handler.handle(context)

        expect(consoleSpy).toHaveBeenCalledWith('Scheduling error toast for non-disconnect scenario (1500ms delay)')

        consoleSpy.mockRestore()
      })
    })

    describe('Context Validation', () => {
      it('should handle all required context properties', () => {
        const { isUserInitiatedError } = require('../../../utils')
        isUserInitiatedError.mockReturnValue(false)

        const context: GenericErrorContext = {
          appError: mockAppError,
          isConnected: true,
          originalError: new Error('Original'),
        }

        const result = handler.handle(context)

        expect(result).toBeDefined()
        expect(result.shouldDisconnect).toBe(true)
      })

      it('should handle missing originalError gracefully', () => {
        const { isUserInitiatedError } = require('../../../utils')
        isUserInitiatedError.mockReturnValue(false)

        const context: GenericErrorContext = {
          appError: mockAppError,
          isConnected: false,
          originalError: undefined,
        }

        const result = handler.handle(context)

        expect(result).toBeDefined()
      })

      it('should handle different error types', () => {
        const { isUserInitiatedError } = require('../../../utils')
        isUserInitiatedError.mockReturnValue(true)

        const differentAppError = {
          ...mockAppError,
          type: ErrorType.SIGNATURE_REJECTED,
        }

        const context = createMockContext({ appError: differentAppError })
        const result = handler.handle(context)

        expect(result.shouldDisconnect).toBe(false) // User-initiated
        expect(result.shouldShowError).toBe(true)
      })
    })

    describe('Return Value Patterns', () => {
      it('should return consistent structure for all scenarios', () => {
        const { isUserInitiatedError } = require('../../../utils')

        const scenarios = [
          { userInitiated: true, connected: true },
          { userInitiated: true, connected: false },
          { userInitiated: false, connected: true },
          { userInitiated: false, connected: false },
        ]

        scenarios.forEach((scenario) => {
          isUserInitiatedError.mockReturnValue(scenario.userInitiated)
          const context = createMockContext({ isConnected: scenario.connected })

          const result = handler.handle(context)

          expect(result).toHaveProperty('shouldDisconnect')
          expect(result).toHaveProperty('shouldShowError')
          expect(result).toHaveProperty('errorDelay')
          expect(result).toHaveProperty('cleanupPerformed')
          expect(typeof result.shouldDisconnect).toBe('boolean')
          expect(typeof result.shouldShowError).toBe('boolean')
          expect(typeof result.errorDelay).toBe('number')
          expect(typeof result.cleanupPerformed).toBe('boolean')
        })
      })

      it('should never perform cleanup', () => {
        const { isUserInitiatedError } = require('../../../utils')
        isUserInitiatedError.mockReturnValue(false)

        const context = createMockContext({ isConnected: true })
        const result = handler.handle(context)

        expect(result.cleanupPerformed).toBe(false)
      })

      it('should always show error', () => {
        const { isUserInitiatedError } = require('../../../utils')

        // Test both user-initiated and technical errors
        isUserInitiatedError.mockReturnValue(true)
        const userResult = handler.handle(createMockContext())
        expect(userResult.shouldShowError).toBe(true)

        isUserInitiatedError.mockReturnValue(false)
        const techResult = handler.handle(createMockContext())
        expect(techResult.shouldShowError).toBe(true)
      })
    })

    describe('Edge Cases', () => {
      it('should handle null appError gracefully', () => {
        const { isUserInitiatedError } = require('../../../utils')
        isUserInitiatedError.mockReturnValue(false)

        const context = createMockContext({ appError: null as any })

        // Should not throw
        const result = handler.handle(context)
        expect(result).toBeDefined()
      })

      it('should handle complex originalError objects', () => {
        const { isUserInitiatedError } = require('../../../utils')
        isUserInitiatedError.mockReturnValue(false)

        const complexError = {
          message: 'Complex error',
          code: 500,
          nested: { innerError: 'inner' },
          stack: 'stack trace...',
        }

        const context = createMockContext({ originalError: complexError })
        const result = handler.handle(context)

        expect(result).toBeDefined()
      })

      it('should handle boolean edge cases for isConnected', () => {
        const { isUserInitiatedError } = require('../../../utils')
        isUserInitiatedError.mockReturnValue(false)

        // Test explicit false
        const falseContext = createMockContext({ isConnected: false })
        const falseResult = handler.handle(falseContext)
        expect(falseResult.shouldDisconnect).toBe(false)

        // Test explicit true
        const trueContext = createMockContext({ isConnected: true })
        const trueResult = handler.handle(trueContext)
        expect(trueResult.shouldDisconnect).toBe(true)
      })

      it('should handle very long error messages', () => {
        const { isUserInitiatedError } = require('../../../utils')
        isUserInitiatedError.mockReturnValue(false)

        const longMessage = 'A'.repeat(10000)
        const longAppError = {
          ...mockAppError,
          message: longMessage,
          userFriendlyMessage: longMessage,
        }

        const context = createMockContext({ appError: longAppError })
        const result = handler.handle(context)

        expect(result).toBeDefined()
      })
    })

    describe('Performance', () => {
      it('should handle errors quickly', () => {
        const { isUserInitiatedError } = require('../../../utils')
        isUserInitiatedError.mockReturnValue(false)

        const context = createMockContext()
        const start = performance.now()

        handler.handle(context)

        const end = performance.now()
        expect(end - start).toBeLessThan(50)
      })

      it('should handle multiple errors efficiently', () => {
        const { isUserInitiatedError } = require('../../../utils')
        isUserInitiatedError.mockReturnValue(false)

        const contexts = Array.from({ length: 1000 }, (_, i) =>
          createMockContext({
            appError: { ...mockAppError, message: `Error ${i}` },
            isConnected: i % 2 === 0,
          })
        )

        const start = performance.now()

        contexts.forEach((context) => handler.handle(context))

        const end = performance.now()
        expect(end - start).toBeLessThan(2000)
      })
    })

    describe('Integration with Utilities', () => {
      it('should call isUserInitiatedError with correct appError', () => {
        const { isUserInitiatedError } = require('../../../utils')
        isUserInitiatedError.mockReturnValue(false)

        const context = createMockContext()
        handler.handle(context)

        expect(isUserInitiatedError).toHaveBeenCalledWith(mockAppError)
        expect(isUserInitiatedError).toHaveBeenCalledTimes(1)
      })

      it('should handle isUserInitiatedError throwing error', () => {
        const { isUserInitiatedError } = require('../../../utils')
        isUserInitiatedError.mockImplementation(() => {
          throw new Error('Utility function failed')
        })

        const context = createMockContext()

        // Should handle gracefully (may depend on implementation)
        expect(() => handler.handle(context)).toThrow('Utility function failed')
      })
    })

    describe('Disconnect Function Behavior', () => {
      it('should call disconnect function only when necessary', () => {
        const { isUserInitiatedError } = require('../../../utils')

        // User-initiated, connected - should not disconnect
        isUserInitiatedError.mockReturnValue(true)
        handler.handle(createMockContext({ isConnected: true }))
        expect(mockDisconnectFunction).not.toHaveBeenCalled()

        mockDisconnectFunction.mockClear()

        // Technical failure, connected - should disconnect
        isUserInitiatedError.mockReturnValue(false)
        handler.handle(createMockContext({ isConnected: true }))
        expect(mockDisconnectFunction).toHaveBeenCalledTimes(1)

        mockDisconnectFunction.mockClear()

        // Technical failure, not connected - should not disconnect
        isUserInitiatedError.mockReturnValue(false)
        handler.handle(createMockContext({ isConnected: false }))
        expect(mockDisconnectFunction).not.toHaveBeenCalled()
      })

      it('should handle async disconnect functions', () => {
        const asyncDisconnect = jest.fn().mockResolvedValue(undefined)
        const asyncHandler = new GenericErrorHandler(asyncDisconnect)
        const { isUserInitiatedError } = require('../../../utils')
        isUserInitiatedError.mockReturnValue(false)

        const context = createMockContext({ isConnected: true })
        const result = asyncHandler.handle(context)

        expect(result).toBeDefined()
        expect(asyncDisconnect).toHaveBeenCalled()
      })
    })
  })

  describe('Handler Contract Compliance', () => {
    it('should implement ErrorHandler interface correctly', () => {
      expect(typeof handler.handle).toBe('function')
      expect(typeof handler.getHandlerName).toBe('function')

      const { isUserInitiatedError } = require('../../../utils')
      isUserInitiatedError.mockReturnValue(false)

      const context = createMockContext()
      const result = handler.handle(context)

      expect(result).toHaveProperty('shouldDisconnect')
      expect(result).toHaveProperty('shouldShowError')
      expect(result).toHaveProperty('errorDelay')
      expect(result).toHaveProperty('cleanupPerformed')
    })

    it('should return consistent handler name', () => {
      expect(handler.getHandlerName()).toBe('generic-error')
    })

    it('should handle GenericErrorContext correctly', () => {
      const { isUserInitiatedError } = require('../../../utils')
      isUserInitiatedError.mockReturnValue(false)

      const context: GenericErrorContext = {
        appError: mockAppError,
        isConnected: true,
        originalError: new Error('Test'),
      }

      const result = handler.handle(context)
      expect(result).toBeDefined()
    })
  })

  const createMockContext = (overrides: Partial<GenericErrorContext> = {}): GenericErrorContext => ({
    appError: mockAppError,
    isConnected: true,
    originalError: new Error('Original error'),
    ...overrides,
  })
})
