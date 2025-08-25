import { act, renderHook } from '@testing-library/react-hooks'
import { createAppError, ErrorType } from '../utils/errorHandling'
import { useAuthenticationState } from './useAuthenticationState'

describe('useAuthenticationState', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should initialize with default authentication state', () => {
    const { result } = renderHook(() => useAuthenticationState())

    // Hook should complete without errors
    expect(result.error).toBeUndefined()

    // Should return expected shape with proper initial values
    expect(result.current).toHaveProperty('authError', null)
    expect(result.current).toHaveProperty('isAuthenticating', false)
    expect(result.current).toHaveProperty('authWalletAddress', null)
    expect(result.current).toHaveProperty('setAuthError')
    expect(result.current).toHaveProperty('getAuthLock')
    expect(result.current).toHaveProperty('releaseAuthLock')
  })

  it('should manage authentication error state properly', () => {
    const { result } = renderHook(() => useAuthenticationState())
    const testError = createAppError(ErrorType.WALLET_CONNECTION, 'Test error', new Error('Test'))

    // Initially no error
    expect(result.current.authError).toBeNull()

    // Set error
    act(() => {
      result.current.setAuthError(testError)
    })

    expect(result.current.authError).toBe(testError)
    expect(result.current.authError?.type).toBe(ErrorType.WALLET_CONNECTION)
    expect(result.current.authError?.userFriendlyMessage).toBe('Failed to connect to wallet. Please try again.')

    // Clear error
    act(() => {
      result.current.setAuthError(null)
    })

    expect(result.current.authError).toBeNull()
  })

  it('should provide authentication lock reference and access to lock state', () => {
    const { result } = renderHook(() => useAuthenticationState())

    // Get auth lock reference
    const authLock = result.current.getAuthLock()
    expect(authLock).toBeDefined()
    expect(authLock.current).toBeDefined()

    // Initially not locked
    expect(result.current.isAuthenticating).toBe(false)
    expect(result.current.authWalletAddress).toBeNull()
    expect(authLock.current.isLocked).toBe(false)
    expect(authLock.current.walletAddress).toBeNull()

    // Create a mock AbortController with only the methods we need
    const mockAbortController: Partial<AbortController> = {
      abort: jest.fn(),
    }

    // Simulate acquiring lock directly on the ref
    act(() => {
      authLock.current = {
        isLocked: true,
        startTime: Date.now(),
        walletAddress: '0x1234567890123456789012345678901234567890',
        abortController: mockAbortController as AbortController,
      }
    })

    // The ref should be updated immediately
    expect(authLock.current.isLocked).toBe(true)
    expect(authLock.current.walletAddress).toBe('0x1234567890123456789012345678901234567890')

    // Note: isAuthenticating and authWalletAddress are derived from the ref
    // and only update when the component re-renders (on state change)
  })

  it('should handle authentication lock release and cleanup', () => {
    const { result } = renderHook(() => useAuthenticationState())
    const mockAbortController: Partial<AbortController> = {
      abort: jest.fn(),
    }

    // Set up locked state with abort controller
    act(() => {
      const authLock = result.current.getAuthLock()
      authLock.current = {
        isLocked: true,
        startTime: Date.now(),
        walletAddress: '0x1234567890123456789012345678901234567890',
        abortController: mockAbortController as AbortController,
      }
    })

    // Verify the ref is set up correctly
    const authLock = result.current.getAuthLock()
    expect(authLock.current.isLocked).toBe(true)
    expect(authLock.current.walletAddress).toBe('0x1234567890123456789012345678901234567890')

    // Release lock
    act(() => {
      result.current.releaseAuthLock()
    })

    // Should call abort on the controller
    expect(mockAbortController.abort).toHaveBeenCalledWith('Authentication completed')

    // Lock should be reset
    expect(authLock.current.isLocked).toBe(false)
    expect(authLock.current.startTime).toBe(0)
    expect(authLock.current.walletAddress).toBeNull()
    expect(authLock.current.abortController).toBeNull()
  })

  it('should handle abort controller cleanup when no controller exists', () => {
    const { result } = renderHook(() => useAuthenticationState())

    // Set up locked state without abort controller
    act(() => {
      const authLock = result.current.getAuthLock()
      authLock.current = {
        isLocked: true,
        startTime: Date.now(),
        walletAddress: '0x1234567890123456789012345678901234567890',
        abortController: null,
      }
    })

    // Release lock should not crash when no abort controller
    act(() => {
      result.current.releaseAuthLock()
    })

    // State should still be reset
    expect(result.current.isAuthenticating).toBe(false)
    expect(result.current.authWalletAddress).toBeNull()
  })

  it('should maintain consistent auth lock reference across renders', () => {
    const { result, rerender } = renderHook(() => useAuthenticationState())

    const firstLockRef = result.current.getAuthLock()

    // Rerender the hook
    rerender()

    const secondLockRef = result.current.getAuthLock()

    // Should be the same reference (useRef behavior)
    expect(firstLockRef).toBe(secondLockRef)
  })

  it('should handle multiple error types correctly', () => {
    const { result } = renderHook(() => useAuthenticationState())

    const errorTypes = [ErrorType.WALLET_CONNECTION, ErrorType.SIGNATURE_REJECTED, ErrorType.NETWORK_ERROR, ErrorType.AUTHENTICATION_FAILED]

    errorTypes.forEach((errorType, index) => {
      const testError = createAppError(errorType, `Test error ${index}`, new Error(`Test ${index}`))

      act(() => {
        result.current.setAuthError(testError)
      })

      expect(result.current.authError).toBe(testError)
      expect(result.current.authError?.type).toBe(errorType)
    })
  })

  it('should provide all required authentication state properties', () => {
    const { result } = renderHook(() => useAuthenticationState())

    // Verify state properties
    expect(result.current).toHaveProperty('authError')
    expect(result.current).toHaveProperty('isAuthenticating')
    expect(result.current).toHaveProperty('authWalletAddress')

    // Verify action properties
    expect(result.current).toHaveProperty('setAuthError')
    expect(result.current).toHaveProperty('getAuthLock')
    expect(result.current).toHaveProperty('releaseAuthLock')

    // Verify function types
    expect(typeof result.current.setAuthError).toBe('function')
    expect(typeof result.current.getAuthLock).toBe('function')
    expect(typeof result.current.releaseAuthLock).toBe('function')
  })

  it('should derive authentication state from lock reference', () => {
    const { result, rerender } = renderHook(() => useAuthenticationState())

    // Initially not locked
    expect(result.current.isAuthenticating).toBe(false)
    expect(result.current.authWalletAddress).toBeNull()

    // Set lock state directly (this would happen in real usage)
    act(() => {
      const authLock = result.current.getAuthLock()
      authLock.current.isLocked = true
      authLock.current.walletAddress = '0x1234567890123456789012345678901234567890'
    })

    // Force a re-render to see the derived state (simulates component re-render)
    rerender()

    // Derived state should reflect the lock changes
    expect(result.current.isAuthenticating).toBe(true)
    expect(result.current.authWalletAddress).toBe('0x1234567890123456789012345678901234567890')

    // Release lock using the provided method
    act(() => {
      result.current.releaseAuthLock()
    })

    // Force re-render again
    rerender()

    // State should reflect the released lock
    expect(result.current.isAuthenticating).toBe(false)
    expect(result.current.authWalletAddress).toBeNull()
  })

  it('should handle complex authentication scenarios', () => {
    const { result } = renderHook(() => useAuthenticationState())
    const testError = createAppError(ErrorType.SIGNATURE_REJECTED, 'User rejected signature', new Error())
    const mockAbortController: Partial<AbortController> = {
      abort: jest.fn(),
    }

    // Set error and lock simultaneously
    act(() => {
      result.current.setAuthError(testError)
      const authLock = result.current.getAuthLock()
      authLock.current = {
        isLocked: true,
        startTime: Date.now(),
        walletAddress: '0x1234567890123456789012345678901234567890',
        abortController: mockAbortController as AbortController,
      }
    })

    // Should handle both error and lock state
    expect(result.current.authError).toBe(testError)
    expect(result.current.isAuthenticating).toBe(true)
    expect(result.current.authWalletAddress).toBe('0x1234567890123456789012345678901234567890')

    // Release lock but keep error - need to trigger re-render to see state change
    act(() => {
      result.current.releaseAuthLock()
      // Trigger re-render by setting the same error again
      result.current.setAuthError(testError)
    })

    expect(result.current.authError).toBe(testError) // Error should remain
    expect(result.current.isAuthenticating).toBe(false) // Lock should be released
    expect(result.current.authWalletAddress).toBeNull()

    // Clear error
    act(() => {
      result.current.setAuthError(null)
    })

    expect(result.current.authError).toBeNull()
  })
})
