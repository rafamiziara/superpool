import type { VerifySignatureAndLoginResponse } from '@superpool/types'
import { AuthenticationData, User } from '@superpool/types'
import { act, renderHook } from '@testing-library/react-native'
import { mockFirebaseAuth, mockFirebaseCallable } from '../../__tests__/mocks'
import { useFirebaseAuth } from './useFirebaseAuth'

// Access mocks from global mocks
const mockOnAuthStateChanged = mockFirebaseAuth.onAuthStateChanged
const mockSignOut = mockFirebaseAuth.signOut

const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {})
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

describe('useFirebaseAuth', () => {
  const mockAuthData: AuthenticationData = {
    walletAddress: '0x123456789',
    signature: '0xabcdef',
    nonce: 'test-nonce',
    message: 'message',
    timestamp: Date.now(),
    deviceId: 'test-device-id',
    platform: 'ios' as const,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockConsoleLog.mockClear()
    mockConsoleError.mockClear()

    // Mock auth state listener to call immediately with null (not authenticated)
    mockOnAuthStateChanged.mockImplementation((_, callback) => {
      callback(null)
      return jest.fn() // Return unsubscribe function
    })

    mockSignOut.mockResolvedValue(undefined)
  })

  afterAll(() => {
    mockConsoleLog.mockRestore()
    mockConsoleError.mockRestore()
  })

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useFirebaseAuth())

    expect(result.current.user).toBe(null)
    expect(result.current.isAuthenticating).toBe(false)
    expect(result.current.error).toBe(null)
    expect(typeof result.current.authenticateWithSignature).toBe('function')
    expect(typeof result.current.logout).toBe('function')
    expect(typeof result.current.clearError).toBe('function')
  })

  it('should authenticate successfully', async () => {
    const mockFirebaseToken = 'firebase-custom-token-123'
    const mockUser: User = {
      walletAddress: mockAuthData.walletAddress,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deviceId: 'test-device-id',
    }
    const mockResponse: VerifySignatureAndLoginResponse = {
      firebaseToken: mockFirebaseToken,
      user: mockUser,
    }
    const mockCallable = jest.fn().mockResolvedValue({
      data: mockResponse,
    })

    mockFirebaseCallable.mockReturnValue(mockCallable)
    mockFirebaseAuth.signInWithCustomToken.mockResolvedValue({ user: mockUser })

    const { result } = renderHook(() => useFirebaseAuth())

    let authenticatedUser: User
    await act(async () => {
      authenticatedUser = await result.current.authenticateWithSignature(mockAuthData)
    })

    expect(result.current.isAuthenticating).toBe(false)
    expect(result.current.error).toBe(null)
    expect(authenticatedUser!).toEqual({
      walletAddress: mockAuthData.walletAddress,
      createdAt: mockUser.createdAt,
      updatedAt: mockUser.updatedAt,
      deviceId: 'test-device-id',
    })

    expect(mockCallable).toHaveBeenCalledWith({
      walletAddress: mockAuthData.walletAddress,
      signature: mockAuthData.signature,
      deviceId: mockAuthData.deviceId,
      platform: mockAuthData.platform,
      chainId: mockAuthData.chainId,
      signatureType: mockAuthData.signatureType,
    })

    expect(mockFirebaseAuth.signInWithCustomToken).toHaveBeenCalledWith(
      expect.any(Object), // FIREBASE_AUTH
      mockFirebaseToken
    )

    expect(mockConsoleLog).toHaveBeenCalledWith('🔥 Authenticating with Firebase...', { walletAddress: mockAuthData.walletAddress })
    expect(mockConsoleLog).toHaveBeenCalledWith('✅ Firebase authentication successful!', mockAuthData.walletAddress)
  })

  it('should handle Firebase function errors', async () => {
    const mockError = new Error('Signature verification failed')
    const mockCallable = jest.fn().mockRejectedValue(mockError)
    mockFirebaseCallable.mockReturnValue(mockCallable)

    const { result } = renderHook(() => useFirebaseAuth())

    await act(async () => {
      try {
        await result.current.authenticateWithSignature(mockAuthData)
      } catch (error) {
        expect((error as Error).message).toBe('Signature verification failed')
      }
    })

    expect(result.current.isAuthenticating).toBe(false)
    expect(result.current.error).toBe('Signature verification failed')
    expect(result.current.user).toBe(null)

    expect(mockConsoleError).toHaveBeenCalledWith('❌ Firebase authentication failed:', 'Signature verification failed')
  })

  it('should validate required auth data', async () => {
    const { result } = renderHook(() => useFirebaseAuth())

    // Test missing walletAddress
    await act(async () => {
      try {
        await result.current.authenticateWithSignature({
          ...mockAuthData,
          walletAddress: '',
        })
      } catch (error) {
        expect((error as Error).message).toBe('Missing required authentication data')
      }
    })

    expect(result.current.error).toBe('Missing required authentication data')
  })

  it('should handle invalid Firebase response', async () => {
    const mockCallable = jest.fn().mockResolvedValue({ data: { firebaseToken: 'token' } as VerifySignatureAndLoginResponse }) // Missing user data
    mockFirebaseCallable.mockReturnValue(mockCallable)

    const { result } = renderHook(() => useFirebaseAuth())

    await act(async () => {
      try {
        await result.current.authenticateWithSignature(mockAuthData)
      } catch (error) {
        expect((error as Error).message).toBe('Invalid response from Firebase function - missing token or user data')
      }
    })

    expect(result.current.error).toBe('Invalid response from Firebase function - missing token or user data')
  })

  it('should handle Firebase signInWithCustomToken failure', async () => {
    const mockUser: User = {
      walletAddress: '0x123456789',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    const mockResponse: VerifySignatureAndLoginResponse = {
      firebaseToken: 'valid-token',
      user: mockUser,
    }
    const mockCallable = jest.fn().mockResolvedValue({
      data: mockResponse,
    })
    mockFirebaseCallable.mockReturnValue(mockCallable)

    mockFirebaseAuth.signInWithCustomToken.mockResolvedValue({ user: null }) // No user returned

    const { result } = renderHook(() => useFirebaseAuth())

    await act(async () => {
      try {
        await result.current.authenticateWithSignature(mockAuthData)
      } catch (error) {
        expect((error as Error).message).toBe('Firebase authentication failed - no user returned')
      }
    })

    expect(result.current.error).toBe('Firebase authentication failed - no user returned')
  })

  it('should handle logout successfully', async () => {
    const { result } = renderHook(() => useFirebaseAuth())

    await act(async () => {
      await result.current.logout()
    })

    expect(mockSignOut).toHaveBeenCalledWith(expect.any(Object)) // FIREBASE_AUTH
    expect(result.current.user).toBe(null)
    expect(result.current.isAuthenticating).toBe(false)
    expect(result.current.error).toBe(null)

    expect(mockConsoleLog).toHaveBeenCalledWith('🚪 Logging out from Firebase...')
    expect(mockConsoleLog).toHaveBeenCalledWith('✅ Successfully logged out from Firebase')
  })

  it('should handle logout errors', async () => {
    const logoutError = new Error('Logout failed')
    mockSignOut.mockRejectedValue(logoutError)

    const { result } = renderHook(() => useFirebaseAuth())

    await act(async () => {
      try {
        await result.current.logout()
      } catch (error) {
        expect((error as Error).message).toBe('Logout failed')
      }
    })

    expect(result.current.error).toBe('Logout failed')
    expect(mockConsoleError).toHaveBeenCalledWith('❌ Firebase logout failed:', 'Logout failed')
  })

  it('should clear error state', () => {
    const { result } = renderHook(() => useFirebaseAuth())

    // Set an error first
    act(() => {
      result.current.clearError()
    })

    expect(result.current.error).toBe(null)
  })
})
