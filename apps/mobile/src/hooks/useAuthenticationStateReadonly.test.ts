import { renderHook } from '@testing-library/react-hooks'
import { AppError, createAppError, ErrorType } from '../utils/errorHandling'
import { AuthenticationLock } from '../services/authenticationOrchestrator'
import { useAuthenticationState } from './useAuthenticationState'
import { useAuthenticationStateReadonly } from './useAuthenticationStateReadonly'
import { useFirebaseAuth } from './useFirebaseAuth'

// TypeScript interfaces for better type safety
interface MockAuthenticationState {
  authError: AppError | null
  isAuthenticating: boolean
  authWalletAddress: string | null
  setAuthError: jest.MockedFunction<(error: AppError | null) => void>
  getAuthLock: jest.MockedFunction<() => { current: AuthenticationLock }>
  releaseAuthLock: jest.MockedFunction<() => void>
}

interface MockFirebaseAuthState {
  user: { uid: string } | null
  isLoading: boolean
  isAuthenticated: boolean
  walletAddress: string | null
}

// Mock the hooks that useAuthenticationStateReadonly depends on
jest.mock('./useAuthenticationState')
jest.mock('./useFirebaseAuth')

// Helper function to create mock authentication state
const createMockAuthState = (
  overrides: Partial<Pick<MockAuthenticationState, 'authError' | 'isAuthenticating' | 'authWalletAddress'>> = {}
): MockAuthenticationState => ({
  authError: null,
  isAuthenticating: false,
  authWalletAddress: null,
  setAuthError: jest.fn(),
  getAuthLock: jest.fn(),
  releaseAuthLock: jest.fn(),
  ...overrides,
})

// Helper function to create mock Firebase auth state
const createMockFirebaseState = (overrides: Partial<MockFirebaseAuthState> = {}): MockFirebaseAuthState => ({
  user: null,
  isLoading: false,
  isAuthenticated: false,
  walletAddress: null,
  ...overrides,
})

describe('useAuthenticationStateReadonly', () => {
  const mockUseAuthenticationState = useAuthenticationState as jest.MockedFunction<() => MockAuthenticationState>
  const mockUseFirebaseAuth = useFirebaseAuth as jest.MockedFunction<() => MockFirebaseAuthState>

  beforeEach(() => {
    jest.clearAllMocks()

    // Default mock implementations
    mockUseAuthenticationState.mockReturnValue(createMockAuthState())
    mockUseFirebaseAuth.mockReturnValue(createMockFirebaseState())
  })

  it('should initialize correctly and return readonly authentication state', () => {
    const { result } = renderHook(() => useAuthenticationStateReadonly())

    // Hook should complete without errors
    expect(result.error).toBeUndefined()

    // Should return expected shape
    expect(result.current).toHaveProperty('authError')
    expect(result.current).toHaveProperty('isAuthenticating')
    expect(result.current).toHaveProperty('authWalletAddress')
    expect(result.current).toHaveProperty('isFirebaseAuthenticated')
    expect(result.current).toHaveProperty('isFirebaseLoading')
  })

  it('should combine readonly authentication state correctly', () => {
    const mockAuthError = createAppError(ErrorType.WALLET_CONNECTION, 'Test error', new Error())

    mockUseAuthenticationState.mockReturnValue(
      createMockAuthState({
        authError: mockAuthError,
        isAuthenticating: false,
        authWalletAddress: '0x1234567890123456789012345678901234567890',
      })
    )

    mockUseFirebaseAuth.mockReturnValue(
      createMockFirebaseState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        walletAddress: null,
      })
    )

    const { result } = renderHook(() => useAuthenticationStateReadonly())

    expect(result.current).toEqual({
      authError: mockAuthError,
      isAuthenticating: false,
      authWalletAddress: '0x1234567890123456789012345678901234567890',
      isFirebaseAuthenticated: false,
      isFirebaseLoading: false,
    })
  })

  it('should prioritize Firebase wallet address over auth lock address', () => {
    mockUseAuthenticationState.mockReturnValue(
      createMockAuthState({
        authError: null,
        isAuthenticating: false,
        authWalletAddress: '0x1111111111111111111111111111111111111111',
      })
    )

    mockUseFirebaseAuth.mockReturnValue(
      createMockFirebaseState({
        user: { uid: '0x2222222222222222222222222222222222222222' },
        isLoading: false,
        isAuthenticated: true,
        walletAddress: '0x2222222222222222222222222222222222222222',
      })
    )

    const { result } = renderHook(() => useAuthenticationStateReadonly())

    expect(result.current.authWalletAddress).toBe('0x2222222222222222222222222222222222222222')
    expect(result.current.isFirebaseAuthenticated).toBe(true)
  })

  it('should fall back to auth lock address when Firebase wallet address is null', () => {
    mockUseAuthenticationState.mockReturnValue(
      createMockAuthState({
        authError: null,
        isAuthenticating: false,
        authWalletAddress: '0x1111111111111111111111111111111111111111',
      })
    )

    mockUseFirebaseAuth.mockReturnValue(
      createMockFirebaseState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        walletAddress: null,
      })
    )

    const { result } = renderHook(() => useAuthenticationStateReadonly())

    expect(result.current.authWalletAddress).toBe('0x1111111111111111111111111111111111111111')
  })

  it('should combine isAuthenticating from both auth state and Firebase loading', () => {
    // Test case 1: Auth state is authenticating
    mockUseAuthenticationState.mockReturnValue(
      createMockAuthState({
        isAuthenticating: true,
      })
    )
    mockUseFirebaseAuth.mockReturnValue(
      createMockFirebaseState({
        isLoading: false,
      })
    )

    const { result, rerender } = renderHook(() => useAuthenticationStateReadonly())
    expect(result.current.isAuthenticating).toBe(true)

    // Test case 2: Firebase is loading
    mockUseAuthenticationState.mockReturnValue(
      createMockAuthState({
        isAuthenticating: false,
      })
    )
    mockUseFirebaseAuth.mockReturnValue(
      createMockFirebaseState({
        isLoading: true,
      })
    )

    rerender()
    expect(result.current.isAuthenticating).toBe(true)

    // Test case 3: Both are loading
    mockUseAuthenticationState.mockReturnValue(
      createMockAuthState({
        isAuthenticating: true,
      })
    )
    mockUseFirebaseAuth.mockReturnValue(
      createMockFirebaseState({
        isLoading: true,
      })
    )

    rerender()
    expect(result.current.isAuthenticating).toBe(true)

    // Test case 4: Neither is loading
    mockUseAuthenticationState.mockReturnValue(
      createMockAuthState({
        isAuthenticating: false,
      })
    )
    mockUseFirebaseAuth.mockReturnValue(
      createMockFirebaseState({
        isLoading: false,
      })
    )

    rerender()
    expect(result.current.isAuthenticating).toBe(false)
  })

  it('should provide separate Firebase auth state flags for navigation logic', () => {
    mockUseAuthenticationState.mockReturnValue(
      createMockAuthState({
        authError: null,
        isAuthenticating: false,
        authWalletAddress: null,
      })
    )

    mockUseFirebaseAuth.mockReturnValue(
      createMockFirebaseState({
        user: { uid: '0x1234567890123456789012345678901234567890' },
        isLoading: false,
        isAuthenticated: true,
        walletAddress: '0x1234567890123456789012345678901234567890',
      })
    )

    const { result } = renderHook(() => useAuthenticationStateReadonly())

    expect(result.current.isFirebaseAuthenticated).toBe(true)
    expect(result.current.isFirebaseLoading).toBe(false)
    expect(result.current.authWalletAddress).toBe('0x1234567890123456789012345678901234567890')
  })

  it('should handle auth errors from authentication state', () => {
    const mockError = createAppError(ErrorType.SIGNATURE_REJECTED, 'User rejected signature', new Error())

    mockUseAuthenticationState.mockReturnValue(
      createMockAuthState({
        authError: mockError,
        isAuthenticating: false,
        authWalletAddress: null,
      })
    )

    mockUseFirebaseAuth.mockReturnValue(
      createMockFirebaseState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        walletAddress: null,
      })
    )

    const { result } = renderHook(() => useAuthenticationStateReadonly())

    expect(result.current.authError).toBe(mockError)
    expect(result.current.authError?.type).toBe(ErrorType.SIGNATURE_REJECTED)
    expect(result.current.authError?.userFriendlyMessage).toBe('Authentication was cancelled. You can try connecting again when ready.')
  })

  it('should validate readonly state purpose and usage', () => {
    mockUseAuthenticationState.mockReturnValue(
      createMockAuthState({
        authError: null,
        isAuthenticating: false,
        authWalletAddress: null,
      })
    )

    mockUseFirebaseAuth.mockReturnValue(
      createMockFirebaseState({
        user: { uid: '0x1234567890123456789012345678901234567890' },
        isLoading: false,
        isAuthenticated: true,
        walletAddress: '0x1234567890123456789012345678901234567890',
      })
    )

    const { result } = renderHook(() => useAuthenticationStateReadonly())

    // Should have enough info for navigation decisions
    expect(result.current).toHaveProperty('authError')
    expect(result.current).toHaveProperty('isAuthenticating')
    expect(result.current).toHaveProperty('authWalletAddress')
    expect(result.current).toHaveProperty('isFirebaseAuthenticated')
    expect(result.current).toHaveProperty('isFirebaseLoading')

    // Should indicate user is authenticated and ready
    expect(result.current.isFirebaseAuthenticated).toBe(true)
    expect(result.current.authWalletAddress).toBeTruthy()
    expect(result.current.authError).toBeNull()
  })

  it('should memoize results correctly', () => {
    // Set up initial state
    mockUseAuthenticationState.mockReturnValue(
      createMockAuthState({
        authError: null,
        isAuthenticating: false,
        authWalletAddress: '0x1234567890123456789012345678901234567890',
      })
    )

    mockUseFirebaseAuth.mockReturnValue(
      createMockFirebaseState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        walletAddress: null,
      })
    )

    const { result, rerender } = renderHook(() => useAuthenticationStateReadonly())
    const firstResult = result.current

    // Rerender with same inputs - should return same object reference due to memoization
    rerender()
    expect(result.current).toBe(firstResult)

    // Change one input - should return new object
    mockUseAuthenticationState.mockReturnValue(
      createMockAuthState({
        authError: null,
        isAuthenticating: true, // Changed
        authWalletAddress: '0x1234567890123456789012345678901234567890',
      })
    )

    rerender()
    expect(result.current).not.toBe(firstResult)
    expect(result.current.isAuthenticating).toBe(true)
  })

  it('should handle all error types correctly', () => {
    const errorTypes = [
      ErrorType.WALLET_CONNECTION,
      ErrorType.SIGNATURE_REJECTED,
      ErrorType.NETWORK_ERROR,
      ErrorType.BACKEND_ERROR,
      ErrorType.AUTHENTICATION_FAILED,
    ]

    errorTypes.forEach((errorType) => {
      const mockError = createAppError(errorType, `Test ${errorType} error`, new Error())

      mockUseAuthenticationState.mockReturnValue(
        createMockAuthState({
          authError: mockError,
          isAuthenticating: false,
          authWalletAddress: null,
        })
      )

      mockUseFirebaseAuth.mockReturnValue(createMockFirebaseState())

      const { result } = renderHook(() => useAuthenticationStateReadonly())

      expect(result.current.authError).toBe(mockError)
      expect(result.current.authError?.type).toBe(errorType)
    })
  })

  it('should handle complex authentication state combinations', () => {
    // Complex scenario: Auth is authenticating, Firebase has user but is loading, has wallet address
    mockUseAuthenticationState.mockReturnValue(
      createMockAuthState({
        authError: null,
        isAuthenticating: true,
        authWalletAddress: '0x1111111111111111111111111111111111111111',
      })
    )

    mockUseFirebaseAuth.mockReturnValue(
      createMockFirebaseState({
        user: { uid: '0x2222222222222222222222222222222222222222' },
        isLoading: true,
        isAuthenticated: true,
        walletAddress: '0x2222222222222222222222222222222222222222',
      })
    )

    const { result } = renderHook(() => useAuthenticationStateReadonly())

    expect(result.current).toEqual({
      authError: null,
      isAuthenticating: true, // Both auth and Firebase are active
      authWalletAddress: '0x2222222222222222222222222222222222222222', // Firebase takes priority
      isFirebaseAuthenticated: true,
      isFirebaseLoading: true,
    })
  })

  it('should work with dependency hooks being called correctly', () => {
    renderHook(() => useAuthenticationStateReadonly())

    // Verify that the dependency hooks are called
    expect(mockUseAuthenticationState).toHaveBeenCalledTimes(1)
    expect(mockUseFirebaseAuth).toHaveBeenCalledTimes(1)
  })

  it('should handle null and undefined values gracefully', () => {
    mockUseAuthenticationState.mockReturnValue(
      createMockAuthState({
        authError: null,
        isAuthenticating: false,
        authWalletAddress: null,
      })
    )

    mockUseFirebaseAuth.mockReturnValue(
      createMockFirebaseState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        walletAddress: null,
      })
    )

    const { result } = renderHook(() => useAuthenticationStateReadonly())

    expect(result.current).toEqual({
      authError: null,
      isAuthenticating: false,
      authWalletAddress: null, // Should fall back to null when both are null
      isFirebaseAuthenticated: false,
      isFirebaseLoading: false,
    })
  })
})
