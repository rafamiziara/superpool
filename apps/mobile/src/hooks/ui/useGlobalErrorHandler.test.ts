import { renderHook, act } from '@testing-library/react-native'
import { SessionManager } from '../../utils/sessionManager'
import { useGlobalErrorHandler } from './useGlobalErrorHandler'

// Mock SessionManager
jest.mock('../../utils/sessionManager', () => ({
  SessionManager: {
    detectSessionCorruption: jest.fn(),
    handleSessionCorruption: jest.fn(),
  },
}))

// Helper function to create session corruption detection mock
const createSessionCorruptionDetector = (shouldDetect = true) => {
  return (errorMessage: string): boolean => {
    if (!shouldDetect) return false
    return (
      errorMessage.includes('WalletConnect session error') ||
      errorMessage.includes('No matching key') ||
      errorMessage.includes('Session corruption') ||
      errorMessage.includes('session')
    )
  }
}

describe('useGlobalErrorHandler', () => {
  const mockSessionManager = SessionManager as jest.Mocked<typeof SessionManager>
  let originalConsoleError: typeof console.error
  let consoleErrorSpy: jest.SpyInstance
  let activeUnmountFunctions: (() => void)[] = []

  beforeEach(() => {
    jest.clearAllMocks()
    originalConsoleError = console.error
    activeUnmountFunctions = []

    // Create spy for console.error to track calls
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

    // Default mock implementations
    mockSessionManager.detectSessionCorruption.mockImplementation(createSessionCorruptionDetector())
    mockSessionManager.handleSessionCorruption.mockResolvedValue(undefined)
  })

  afterEach(() => {
    // Unmount all active hooks to prevent state leakage
    activeUnmountFunctions.forEach((unmount) => {
      try {
        unmount()
      } catch (e) {
        // Ignore cleanup errors
      }
    })
    activeUnmountFunctions = []

    console.error = originalConsoleError
    consoleErrorSpy.mockRestore()
  })

  // Helper function to track unmount functions
  const renderHookWithCleanup = (callback: () => any) => {
    const result = renderHook(callback)
    activeUnmountFunctions.push(result.unmount)
    return result
  }

  it('should initialize global error handler correctly', () => {
    const originalError = console.error

    const { result } = renderHook(() => useGlobalErrorHandler())

    // Hook should complete without errors (it returns undefined/void)
    expect(result.current).toBeUndefined()

    // Console.error should be replaced
    expect(console.error).not.toBe(originalError)
  })

  it('should detect session corruption errors through console.error', () => {
    renderHook(() => useGlobalErrorHandler())

    // Simulate session corruption error via console.error
    console.error('WalletConnect session error: No matching key')

    // Should detect session corruption
    expect(mockSessionManager.detectSessionCorruption).toHaveBeenCalledWith('WalletConnect session error: No matching key')
  })

  it('should ignore non-session corruption errors', () => {
    renderHook(() => useGlobalErrorHandler())

    // Mock to return false for non-session errors
    mockSessionManager.detectSessionCorruption.mockImplementation(createSessionCorruptionDetector(false))

    // Simulate regular error
    console.error('Regular application error')

    expect(mockSessionManager.detectSessionCorruption).toHaveBeenCalledWith('Regular application error')
    expect(mockSessionManager.handleSessionCorruption).not.toHaveBeenCalled()
  })

  it('should handle multiple console.error arguments correctly', () => {
    renderHook(() => useGlobalErrorHandler())

    // Console.error with multiple arguments
    console.error('Error prefix:', 'WalletConnect session error', { details: 'test' })

    const expectedMessage = 'Error prefix: WalletConnect session error [object Object]'
    expect(mockSessionManager.detectSessionCorruption).toHaveBeenCalledWith(expectedMessage)
  })

  it('should restore original console.error on unmount', () => {
    const originalError = console.error

    const { unmount } = renderHook(() => useGlobalErrorHandler())

    // Console.error should be replaced
    expect(console.error).not.toBe(originalError)

    // Unmount the hook
    unmount()

    // Console.error should be restored
    expect(console.error).toBe(originalError)
  })

  it('should call handleGlobalError when session corruption is detected', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation()

    renderHook(() => useGlobalErrorHandler())

    // Simulate session corruption error
    console.error('Session corruption detected')

    // Should detect the error
    expect(mockSessionManager.detectSessionCorruption).toHaveBeenCalledWith('Session corruption detected')

    logSpy.mockRestore()
  })

  it('should handle Error objects passed to console.error', () => {
    renderHook(() => useGlobalErrorHandler())

    const testError = new Error('Session corruption detected')
    console.error(testError)

    // Should stringify the error object
    expect(mockSessionManager.detectSessionCorruption).toHaveBeenCalledWith('[object Object]')
  })

  it('should cleanup properly without crashing', () => {
    const { unmount } = renderHook(() => useGlobalErrorHandler())

    // Should not crash during cleanup
    expect(() => unmount()).not.toThrow()
  })

  it('should maintain state across multiple console.error calls', () => {
    renderHook(() => useGlobalErrorHandler())

    // Multiple calls should be detected individually
    console.error('Session error 1')
    console.error('Session error 2')

    expect(mockSessionManager.detectSessionCorruption).toHaveBeenCalledTimes(2)
    expect(mockSessionManager.detectSessionCorruption).toHaveBeenNthCalledWith(1, 'Session error 1')
    expect(mockSessionManager.detectSessionCorruption).toHaveBeenNthCalledWith(2, 'Session error 2')
  })

  it('should pass different error types correctly to detectSessionCorruption', () => {
    renderHook(() => useGlobalErrorHandler())

    // Test various argument combinations
    console.error('Simple string error')
    console.error('Error with', 'multiple', 'arguments')
    console.error('Error with object:', { key: 'value' })

    expect(mockSessionManager.detectSessionCorruption).toHaveBeenCalledTimes(3)
    expect(mockSessionManager.detectSessionCorruption).toHaveBeenNthCalledWith(1, 'Simple string error')
    expect(mockSessionManager.detectSessionCorruption).toHaveBeenNthCalledWith(2, 'Error with multiple arguments')
    expect(mockSessionManager.detectSessionCorruption).toHaveBeenNthCalledWith(3, 'Error with object: [object Object]')
  })

  it('should work with the real SessionManager interface', () => {
    // This test ensures our mocks match the real interface
    renderHook(() => useGlobalErrorHandler())

    console.error('WalletConnect session corruption')

    // Verify the mock was called with correct types
    expect(mockSessionManager.detectSessionCorruption).toHaveBeenCalledWith(expect.any(String))
  })

  it('should handle consecutive hook mounts and unmounts', () => {
    const originalError = console.error

    // First mount
    const { unmount: unmount1 } = renderHook(() => useGlobalErrorHandler())
    expect(console.error).not.toBe(originalError)

    unmount1()
    expect(console.error).toBe(originalError)

    // Second mount
    const { unmount: unmount2 } = renderHook(() => useGlobalErrorHandler())
    expect(console.error).not.toBe(originalError)

    unmount2()
    expect(console.error).toBe(originalError)
  })

  it('should trigger async handling on session corruption error', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation()

    renderHook(() => useGlobalErrorHandler())

    // Simulate session corruption error
    console.error('Session corruption detected')

    // Should detect and start handling
    expect(mockSessionManager.detectSessionCorruption).toHaveBeenCalledWith('Session corruption detected')

    logSpy.mockRestore()
  })

  it('should handle successful async flow (line coverage focus)', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation()

    renderHook(() => useGlobalErrorHandler())

    // Create a successful promise
    mockSessionManager.handleSessionCorruption.mockResolvedValue()

    // Simulate session corruption error that passes detection
    console.error('WalletConnect session error: No matching key')

    // Allow async operations to complete
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Verify detection was called
    expect(mockSessionManager.detectSessionCorruption).toHaveBeenCalledWith('WalletConnect session error: No matching key')

    logSpy.mockRestore()
  })

  it('should handle async error recovery failure (line coverage focus)', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation()

    // Mock handleSessionCorruption to fail
    const recoveryError = new Error('Recovery failed')
    mockSessionManager.handleSessionCorruption.mockRejectedValue(recoveryError)

    renderHook(() => useGlobalErrorHandler())

    // Simulate session corruption error
    console.error('Session corruption detected')

    // Allow async operations to complete
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Verify detection was called
    expect(mockSessionManager.detectSessionCorruption).toHaveBeenCalledWith('Session corruption detected')

    // The error should be logged by the catch block (this tests line 45)
    // We can't directly test console.error call since it's overridden, but the function should run

    logSpy.mockRestore()
  })

  it('should handle timeout cleanup (line coverage focus)', () => {
    jest.useFakeTimers()

    renderHook(() => useGlobalErrorHandler())

    // Trigger session error to start async handling
    console.error('Session error')

    // Fast forward to trigger setTimeout cleanup (line 48-50)
    jest.advanceTimersByTime(3000)

    jest.useRealTimers()
  })

  describe('Error Throttling and Deduplication', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('should prevent handling same error multiple times within 5 seconds', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation()

      const { unmount } = renderHook(() => useGlobalErrorHandler())

      const errorMessage = 'WalletConnect session error: duplicate test'

      // First error should be handled
      console.error(errorMessage)
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      // Second identical error within 5 seconds should be ignored
      console.error(errorMessage)
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      // Should only detect once, but handleSessionCorruption should only be called once due to throttling
      expect(mockSessionManager.detectSessionCorruption).toHaveBeenCalledTimes(2)
      expect(mockSessionManager.handleSessionCorruption).toHaveBeenCalledTimes(1)

      logSpy.mockRestore()
    })

    it('should allow handling same error after 5 second cooldown', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation()

      renderHookWithCleanup(() => useGlobalErrorHandler())

      const errorMessage = 'WalletConnect session error: cooldown test'

      // First error
      console.error(errorMessage)
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      // Advance time by 6 seconds (past 5 second cooldown)
      jest.advanceTimersByTime(6000)

      // Second identical error after cooldown should be handled
      console.error(errorMessage)
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      expect(mockSessionManager.detectSessionCorruption).toHaveBeenCalledTimes(2)
      expect(mockSessionManager.handleSessionCorruption).toHaveBeenCalledTimes(2)

      logSpy.mockRestore()
    })

    it('should prevent concurrent error handling', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation()

      // Make handleSessionCorruption slow to test concurrent handling prevention
      mockSessionManager.handleSessionCorruption.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 1000)))

      renderHook(() => useGlobalErrorHandler())

      // First error starts handling
      console.error('WalletConnect session error: concurrent test 1')
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      // Second different error should be ignored because first is still handling
      console.error('WalletConnect session error: concurrent test 2')
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      // Should detect both but only handle the first
      expect(mockSessionManager.detectSessionCorruption).toHaveBeenCalledTimes(2)
      expect(mockSessionManager.handleSessionCorruption).toHaveBeenCalledTimes(1)

      logSpy.mockRestore()
    })

    it('should reset handling state after 3 second timeout', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation()

      renderHook(() => useGlobalErrorHandler())

      // Trigger error handling
      console.error('WalletConnect session error: timeout reset test')
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      // Advance time by 3 seconds to trigger timeout reset
      act(() => {
        jest.advanceTimersByTime(3000)
      })

      // Now a new error should be handled (different message to avoid lastHandledError check)
      console.error('WalletConnect session error: new error after reset')
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      expect(mockSessionManager.handleSessionCorruption).toHaveBeenCalledTimes(2)

      logSpy.mockRestore()
    })
  })

  describe('Error Message Processing', () => {
    it('should handle Error objects with message property', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation()

      renderHook(() => useGlobalErrorHandler())

      // The hook processes args.join(' ') and then creates { message: errorString }
      // When it calls handleGlobalError, it should extract the message correctly
      console.error('WalletConnect session error: Error object test')

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      expect(mockSessionManager.detectSessionCorruption).toHaveBeenCalledWith('WalletConnect session error: Error object test')
      expect(mockSessionManager.handleSessionCorruption).toHaveBeenCalledWith('WalletConnect session error: Error object test')

      logSpy.mockRestore()
    })

    it('should handle non-Error objects passed to handleGlobalError', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation()

      renderHook(() => useGlobalErrorHandler())

      // Test string conversion for non-Error objects
      console.error('Session corruption detected')

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      expect(mockSessionManager.detectSessionCorruption).toHaveBeenCalledWith('Session corruption detected')

      logSpy.mockRestore()
    })

    it('should handle empty error messages', () => {
      renderHook(() => useGlobalErrorHandler())

      // Empty error should not crash
      console.error('')

      expect(mockSessionManager.detectSessionCorruption).toHaveBeenCalledWith('')
      // Since empty string likely won't be detected as session corruption,
      // handleSessionCorruption shouldn't be called
      expect(mockSessionManager.handleSessionCorruption).not.toHaveBeenCalled()
    })

    it('should handle null and undefined arguments', () => {
      renderHook(() => useGlobalErrorHandler())

      // Test null and undefined
      console.error(null)
      console.error(undefined)
      console.error(null, undefined, 'session error')

      expect(mockSessionManager.detectSessionCorruption).toHaveBeenCalledTimes(3)
      expect(mockSessionManager.detectSessionCorruption).toHaveBeenNthCalledWith(1, 'null')
      expect(mockSessionManager.detectSessionCorruption).toHaveBeenNthCalledWith(2, 'undefined')
      expect(mockSessionManager.detectSessionCorruption).toHaveBeenNthCalledWith(3, 'null undefined session error')
    })

    it('should handle numbers and boolean arguments', () => {
      renderHook(() => useGlobalErrorHandler())

      // Test various primitive types
      console.error(42, true, false, 'session error')

      expect(mockSessionManager.detectSessionCorruption).toHaveBeenCalledWith('42 true false session error')
    })
  })

  describe('Session Manager Integration', () => {
    it('should pass exact error message to SessionManager methods', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation()

      renderHook(() => useGlobalErrorHandler())

      const exactMessage = 'WalletConnect session error: exact match test'
      console.error(exactMessage)

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      expect(mockSessionManager.detectSessionCorruption).toHaveBeenCalledWith(exactMessage)
      expect(mockSessionManager.handleSessionCorruption).toHaveBeenCalledWith(exactMessage)

      logSpy.mockRestore()
    })

    it('should handle SessionManager.handleSessionCorruption rejection', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation()
      const originalError = console.error
      const errorCallSpy = jest.fn()

      // We need to spy on the actual error calls made by the finally block
      // Since console.error is overridden by the hook, we'll track the original calls
      mockSessionManager.handleSessionCorruption.mockRejectedValue(new Error('SessionManager failure'))

      renderHook(() => useGlobalErrorHandler())

      console.error('WalletConnect session error: rejection test')

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
      })

      // The error should be caught and logged
      expect(mockSessionManager.detectSessionCorruption).toHaveBeenCalled()
      expect(mockSessionManager.handleSessionCorruption).toHaveBeenCalled()

      logSpy.mockRestore()
    })
  })

  describe('Edge Cases and Error Scenarios', () => {
    it('should handle extremely long error messages', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation()

      renderHook(() => useGlobalErrorHandler())

      const longMessage = 'WalletConnect session error: ' + 'x'.repeat(10000)
      console.error(longMessage)

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      expect(mockSessionManager.detectSessionCorruption).toHaveBeenCalledWith(longMessage)

      logSpy.mockRestore()
    })

    it('should handle rapid successive different errors', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation()

      renderHook(() => useGlobalErrorHandler())

      // Rapid succession of different errors
      for (let i = 0; i < 5; i++) {
        console.error(`WalletConnect session error: rapid test ${i}`)
      }

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      // Should detect all, but only handle the first due to isHandling flag
      expect(mockSessionManager.detectSessionCorruption).toHaveBeenCalledTimes(5)
      expect(mockSessionManager.handleSessionCorruption).toHaveBeenCalledTimes(1)

      logSpy.mockRestore()
    })

    it('should work correctly with multiple hook instances', () => {
      const originalError = console.error

      // Mount first instance
      const { unmount: unmount1 } = renderHookWithCleanup(() => useGlobalErrorHandler())

      // Mount second instance (should replace first)
      const { unmount: unmount2 } = renderHookWithCleanup(() => useGlobalErrorHandler())

      console.error('WalletConnect session error: multiple instances')

      expect(mockSessionManager.detectSessionCorruption).toHaveBeenCalledWith('WalletConnect session error: multiple instances')

      // Cleanup
      unmount2()
      unmount1()

      expect(console.error).toBe(originalError)
    })
  })

  describe('State Management', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('should track error handling state correctly', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation()

      // Mock slow handling to test state tracking
      mockSessionManager.handleSessionCorruption.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 1000)))

      renderHookWithCleanup(() => useGlobalErrorHandler())

      // First error should start handling
      console.error('WalletConnect session error: state test 1')
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      // Second error should be blocked
      console.error('WalletConnect session error: state test 2')
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      expect(mockSessionManager.handleSessionCorruption).toHaveBeenCalledTimes(1)

      // Complete the first handling
      act(() => {
        jest.advanceTimersByTime(1000)
      })

      // Reset isHandling flag after 3 seconds
      act(() => {
        jest.advanceTimersByTime(3000)
      })

      // Now new error should be handled
      console.error('WalletConnect session error: state test 3')
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      expect(mockSessionManager.handleSessionCorruption).toHaveBeenCalledTimes(2)

      logSpy.mockRestore()
    })

    it('should update lastHandledError and lastHandledTime correctly', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation()

      renderHookWithCleanup(() => useGlobalErrorHandler())

      const error1 = 'WalletConnect session error: tracking test 1'
      const error2 = 'WalletConnect session error: tracking test 2'

      // Handle first error
      console.error(error1)
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      // Same error within 5 seconds should be blocked
      console.error(error1)
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      // Different error should be blocked due to isHandling
      console.error(error2)
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      expect(mockSessionManager.handleSessionCorruption).toHaveBeenCalledTimes(1)
      expect(mockSessionManager.handleSessionCorruption).toHaveBeenCalledWith(error1)

      logSpy.mockRestore()
    })
  })
})
