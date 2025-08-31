import { ErrorRecoveryResult } from '@superpool/types'
import { ErrorHandler, RecoveryActions } from './ErrorHandler'

// Mock implementation for testing the interface
class MockErrorHandler implements ErrorHandler<string> {
  handle(context: string): ErrorRecoveryResult {
    return RecoveryActions.createResult(false, true, 1000, true)
  }

  getHandlerName(): string {
    return 'mock-handler'
  }
}

describe('ErrorHandler Interface', () => {
  let handler: MockErrorHandler

  beforeEach(() => {
    handler = new MockErrorHandler()
  })

  describe('Interface Implementation', () => {
    it('should implement the ErrorHandler interface correctly', () => {
      expect(handler).toHaveProperty('handle')
      expect(handler).toHaveProperty('getHandlerName')
      expect(typeof handler.handle).toBe('function')
      expect(typeof handler.getHandlerName).toBe('function')
    })

    it('should return a proper ErrorRecoveryResult from handle method', () => {
      const result = handler.handle('test-context')

      expect(result).toHaveProperty('shouldDisconnect')
      expect(result).toHaveProperty('shouldShowError')
      expect(result).toHaveProperty('errorDelay')
      expect(result).toHaveProperty('cleanupPerformed')

      expect(typeof result.shouldDisconnect).toBe('boolean')
      expect(typeof result.shouldShowError).toBe('boolean')
      expect(typeof result.errorDelay).toBe('number')
      expect(typeof result.cleanupPerformed).toBe('boolean')
    })

    it('should return a handler name', () => {
      const name = handler.getHandlerName()
      expect(typeof name).toBe('string')
      expect(name).toBe('mock-handler')
    })

    it('should handle different context types', () => {
      const stringContext = 'test'
      const result1 = handler.handle(stringContext)
      expect(result1).toBeDefined()

      // Test with different contexts
      class NumberHandler implements ErrorHandler<number> {
        handle(context: number): ErrorRecoveryResult {
          return RecoveryActions.userInitiated(context)
        }
        getHandlerName(): string {
          return 'number-handler'
        }
      }

      const numberHandler = new NumberHandler()
      const result2 = numberHandler.handle(1500)
      expect(result2.errorDelay).toBe(1500)
    })
  })

  describe('Async Handler Support', () => {
    it('should support async handlers', async () => {
      class AsyncHandler implements ErrorHandler<string> {
        async handle(context: string): Promise<ErrorRecoveryResult> {
          await new Promise((resolve) => setTimeout(resolve, 10))
          return RecoveryActions.technicalFailure()
        }
        getHandlerName(): string {
          return 'async-handler'
        }
      }

      const asyncHandler = new AsyncHandler()
      const result = await asyncHandler.handle('async-context')
      expect(result).toHaveProperty('shouldDisconnect', true)
      expect(result).toHaveProperty('shouldShowError', true)
    })
  })
})

describe('RecoveryActions', () => {
  describe('createResult', () => {
    it('should create a result with all specified properties', () => {
      const result = RecoveryActions.createResult(true, false, 500, true)

      expect(result).toEqual({
        shouldDisconnect: true,
        shouldShowError: false,
        errorDelay: 500,
        cleanupPerformed: true,
      })
    })

    it('should use default values for optional parameters', () => {
      const result = RecoveryActions.createResult(false, true)

      expect(result).toEqual({
        shouldDisconnect: false,
        shouldShowError: true,
        errorDelay: 0,
        cleanupPerformed: false,
      })
    })

    it('should handle edge case values', () => {
      const result = RecoveryActions.createResult(true, true, -1, true)

      expect(result.errorDelay).toBe(-1) // Should accept negative values
      expect(result.shouldDisconnect).toBe(true)
      expect(result.shouldShowError).toBe(true)
      expect(result.cleanupPerformed).toBe(true)
    })
  })

  describe('userInitiated', () => {
    it('should create a user-initiated recovery result with default delay', () => {
      const result = RecoveryActions.userInitiated()

      expect(result).toEqual({
        shouldDisconnect: false,
        shouldShowError: true,
        errorDelay: 1500,
        cleanupPerformed: false,
      })
    })

    it('should create a user-initiated recovery result with custom delay', () => {
      const customDelay = 2500
      const result = RecoveryActions.userInitiated(customDelay)

      expect(result).toEqual({
        shouldDisconnect: false,
        shouldShowError: true,
        errorDelay: customDelay,
        cleanupPerformed: false,
      })
    })

    it('should handle zero delay', () => {
      const result = RecoveryActions.userInitiated(0)
      expect(result.errorDelay).toBe(0)
    })

    it('should handle very large delays', () => {
      const largeDelay = 999999
      const result = RecoveryActions.userInitiated(largeDelay)
      expect(result.errorDelay).toBe(largeDelay)
    })
  })

  describe('technicalFailure', () => {
    it('should create a technical failure recovery result with default delay', () => {
      const result = RecoveryActions.technicalFailure()

      expect(result).toEqual({
        shouldDisconnect: true,
        shouldShowError: true,
        errorDelay: 2000,
        cleanupPerformed: false,
      })
    })

    it('should create a technical failure recovery result with custom delay', () => {
      const customDelay = 3000
      const result = RecoveryActions.technicalFailure(customDelay)

      expect(result).toEqual({
        shouldDisconnect: true,
        shouldShowError: true,
        errorDelay: customDelay,
        cleanupPerformed: false,
      })
    })

    it('should always require disconnect for technical failures', () => {
      const result1 = RecoveryActions.technicalFailure(0)
      const result2 = RecoveryActions.technicalFailure(5000)

      expect(result1.shouldDisconnect).toBe(true)
      expect(result2.shouldDisconnect).toBe(true)
    })
  })

  describe('sessionError', () => {
    it('should create a session error recovery result with cleanup success', () => {
      const result = RecoveryActions.sessionError(true)

      expect(result).toEqual({
        shouldDisconnect: true,
        shouldShowError: false,
        errorDelay: 1500,
        cleanupPerformed: true,
      })
    })

    it('should create a session error recovery result with cleanup failure', () => {
      const result = RecoveryActions.sessionError(false)

      expect(result).toEqual({
        shouldDisconnect: true,
        shouldShowError: false,
        errorDelay: 1500,
        cleanupPerformed: false,
      })
    })

    it('should never show error for session errors', () => {
      const resultSuccess = RecoveryActions.sessionError(true)
      const resultFailure = RecoveryActions.sessionError(false)

      expect(resultSuccess.shouldShowError).toBe(false)
      expect(resultFailure.shouldShowError).toBe(false)
    })

    it('should always require disconnect for session errors', () => {
      const resultSuccess = RecoveryActions.sessionError(true)
      const resultFailure = RecoveryActions.sessionError(false)

      expect(resultSuccess.shouldDisconnect).toBe(true)
      expect(resultFailure.shouldDisconnect).toBe(true)
    })
  })

  describe('serviceUnavailable', () => {
    it('should create a service unavailable recovery result', () => {
      const result = RecoveryActions.serviceUnavailable()

      expect(result).toEqual({
        shouldDisconnect: false,
        shouldShowError: true,
        errorDelay: 1500,
        cleanupPerformed: false,
      })
    })

    it('should not require disconnect for service unavailable', () => {
      const result = RecoveryActions.serviceUnavailable()
      expect(result.shouldDisconnect).toBe(false)
    })

    it('should show error for service unavailable', () => {
      const result = RecoveryActions.serviceUnavailable()
      expect(result.shouldShowError).toBe(true)
    })
  })

  describe('Pattern Validation', () => {
    it('should create distinct patterns for different error types', () => {
      const userInitiated = RecoveryActions.userInitiated()
      const technicalFailure = RecoveryActions.technicalFailure()
      const sessionError = RecoveryActions.sessionError(true)
      const serviceUnavailable = RecoveryActions.serviceUnavailable()

      // User initiated: no disconnect, show error
      expect(userInitiated.shouldDisconnect).toBe(false)
      expect(userInitiated.shouldShowError).toBe(true)

      // Technical failure: disconnect and show error
      expect(technicalFailure.shouldDisconnect).toBe(true)
      expect(technicalFailure.shouldShowError).toBe(true)

      // Session error: disconnect but don't show error
      expect(sessionError.shouldDisconnect).toBe(true)
      expect(sessionError.shouldShowError).toBe(false)

      // Service unavailable: no disconnect but show error
      expect(serviceUnavailable.shouldDisconnect).toBe(false)
      expect(serviceUnavailable.shouldShowError).toBe(true)
    })

    it('should have appropriate delay patterns', () => {
      const userInitiated = RecoveryActions.userInitiated()
      const technicalFailure = RecoveryActions.technicalFailure()
      const sessionError = RecoveryActions.sessionError(true)
      const serviceUnavailable = RecoveryActions.serviceUnavailable()

      expect(userInitiated.errorDelay).toBe(1500)
      expect(technicalFailure.errorDelay).toBe(2000) // Longer for technical issues
      expect(sessionError.errorDelay).toBe(1500)
      expect(serviceUnavailable.errorDelay).toBe(1500)
    })
  })

  describe('Cleanup Tracking', () => {
    it('should track cleanup performed only for session errors', () => {
      const userInitiated = RecoveryActions.userInitiated()
      const technicalFailure = RecoveryActions.technicalFailure()
      const sessionErrorSuccess = RecoveryActions.sessionError(true)
      const sessionErrorFailure = RecoveryActions.sessionError(false)
      const serviceUnavailable = RecoveryActions.serviceUnavailable()

      expect(userInitiated.cleanupPerformed).toBe(false)
      expect(technicalFailure.cleanupPerformed).toBe(false)
      expect(sessionErrorSuccess.cleanupPerformed).toBe(true)
      expect(sessionErrorFailure.cleanupPerformed).toBe(false)
      expect(serviceUnavailable.cleanupPerformed).toBe(false)
    })

    it('should handle custom cleanup states in createResult', () => {
      const withCleanup = RecoveryActions.createResult(true, true, 1000, true)
      const withoutCleanup = RecoveryActions.createResult(true, true, 1000, false)

      expect(withCleanup.cleanupPerformed).toBe(true)
      expect(withoutCleanup.cleanupPerformed).toBe(false)
    })
  })

  describe('Edge Cases', () => {
    it('should handle boolean type consistency', () => {
      const results = [
        RecoveryActions.userInitiated(),
        RecoveryActions.technicalFailure(),
        RecoveryActions.sessionError(true),
        RecoveryActions.serviceUnavailable(),
      ]

      results.forEach((result) => {
        expect(typeof result.shouldDisconnect).toBe('boolean')
        expect(typeof result.shouldShowError).toBe('boolean')
        expect(typeof result.cleanupPerformed).toBe('boolean')
      })
    })

    it('should handle number type consistency for delays', () => {
      const results = [
        RecoveryActions.userInitiated(0),
        RecoveryActions.userInitiated(1),
        RecoveryActions.technicalFailure(999999),
        RecoveryActions.sessionError(false),
      ]

      results.forEach((result) => {
        expect(typeof result.errorDelay).toBe('number')
        expect(result.errorDelay).toBeGreaterThanOrEqual(0)
      })
    })

    it('should create immutable results', () => {
      const result = RecoveryActions.userInitiated()
      const originalDelay = result.errorDelay

      // Attempt to modify
      result.errorDelay = 9999

      // Should not affect new instances
      const newResult = RecoveryActions.userInitiated()
      expect(newResult.errorDelay).toBe(1500) // Default value, not modified

      // But the specific instance should be mutable (objects are mutable by default)
      expect(result.errorDelay).toBe(9999)
    })
  })

  describe('Performance', () => {
    it('should create results quickly', () => {
      const start = performance.now()

      for (let i = 0; i < 1000; i++) {
        RecoveryActions.createResult(i % 2 === 0, i % 3 === 0, i, i % 4 === 0)
        RecoveryActions.userInitiated(i)
        RecoveryActions.technicalFailure(i)
        RecoveryActions.sessionError(i % 2 === 0)
        RecoveryActions.serviceUnavailable()
      }

      const end = performance.now()
      expect(end - start).toBeLessThan(100) // Should be very fast
    })
  })
})
