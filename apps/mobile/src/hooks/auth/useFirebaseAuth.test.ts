import { FirebaseAuthState } from '@superpool/types'
import { renderHook } from '@testing-library/react-native'
import { User } from 'firebase/auth'
import { createMockFirebaseAuthManager } from '@mocks/factories/serviceFactory'
import { useFirebaseAuth } from './useFirebaseAuth'

// Create centralized mock
const mockManager = createMockFirebaseAuthManager()

// Mock the firebaseAuthManager module
jest.doMock('../../utils/firebaseAuthManager', () => ({
  firebaseAuthManager: mockManager,
}))

describe('useFirebaseAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return initial state from firebase auth manager', () => {
    const { result } = renderHook(() => useFirebaseAuth())

    expect(mockManager.getCurrentState).toHaveBeenCalled()
    expect(mockManager.addListener).toHaveBeenCalled()
    expect(result.current).toEqual({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      walletAddress: null,
    })
  })

  it('should subscribe to auth state changes and update state', () => {
    const mockUser: Partial<User> = {
      uid: '0x1234567890123456789012345678901234567890',
    }

    const authenticatedState: FirebaseAuthState = {
      user: mockUser as User,
      isLoading: false,
      isAuthenticated: true,
      walletAddress: '0x1234567890123456789012345678901234567890',
    }

    mockManager.addListener.mockImplementation((callback) => {
      // Initial call with authenticated state
      callback(authenticatedState)
      return jest.fn()
    })

    const { result } = renderHook(() => useFirebaseAuth())

    expect(result.current).toEqual(authenticatedState)
  })

  it('should cleanup subscription on unmount', () => {
    const mockCleanup = jest.fn()
    mockManager.addListener.mockReturnValue(mockCleanup)

    const { unmount } = renderHook(() => useFirebaseAuth())

    expect(mockManager.addListener).toHaveBeenCalled()

    unmount()

    expect(mockCleanup).toHaveBeenCalled()
  })

  it('should handle loading state transitions', () => {
    const loadingState: FirebaseAuthState = {
      user: null,
      isLoading: true,
      isAuthenticated: false,
      walletAddress: null,
    }

    mockManager.getCurrentState.mockReturnValue(loadingState)

    const { result } = renderHook(() => useFirebaseAuth())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.isAuthenticated).toBe(false)
  })

  it('should handle authentication state changes with wallet validation', () => {
    const mockUser: Partial<User> = {
      uid: '0x1234567890123456789012345678901234567890',
    }

    const authState: FirebaseAuthState = {
      user: mockUser as User,
      isLoading: false,
      isAuthenticated: true,
      walletAddress: '0x1234567890123456789012345678901234567890',
    }

    mockManager.getCurrentState.mockReturnValue(authState)

    const { result } = renderHook(() => useFirebaseAuth())

    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.walletAddress).toBe('0x1234567890123456789012345678901234567890')
    expect(result.current.user?.uid).toBe('0x1234567890123456789012345678901234567890')
  })

  it('should handle invalid wallet address in Firebase UID', () => {
    const mockUser: Partial<User> = {
      uid: 'invalid-wallet-address',
    }

    const invalidState: FirebaseAuthState = {
      user: mockUser as User,
      isLoading: false,
      isAuthenticated: true,
      walletAddress: null, // Should be null due to invalid format
    }

    mockManager.getCurrentState.mockReturnValue(invalidState)

    const { result } = renderHook(() => useFirebaseAuth())

    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.walletAddress).toBeNull()
    expect(result.current.user?.uid).toBe('invalid-wallet-address')
  })
})
