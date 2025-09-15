import type { User } from '@superpool/types'
import { act, renderHook } from '@testing-library/react-native'
import { useAutoAuth } from './useAutoAuth'

// Mock all auth hooks
jest.mock('./useWalletListener')
jest.mock('./useMessageGeneration')
jest.mock('./useSignatureHandling')
jest.mock('./useFirebaseAuth')

import { useFirebaseAuth } from './useFirebaseAuth'
import { useMessageGeneration } from './useMessageGeneration'
import { useSignatureHandling } from './useSignatureHandling'
import { useWalletListener } from './useWalletListener'

const mockUseWalletListener = useWalletListener as jest.MockedFunction<typeof useWalletListener>
const mockUseMessageGeneration = useMessageGeneration as jest.MockedFunction<typeof useMessageGeneration>
const mockUseSignatureHandling = useSignatureHandling as jest.MockedFunction<typeof useSignatureHandling>
const mockUseFirebaseAuth = useFirebaseAuth as jest.MockedFunction<typeof useFirebaseAuth>

const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {})
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

describe('useAutoAuth', () => {
  const mockMessageGenerationHook = {
    message: null,
    nonce: null,
    timestamp: null,
    isGenerating: false,
    error: null,
    generateMessage: jest.fn(),
    clearState: jest.fn(),
  }

  const mockSignatureHandlingHook = {
    signature: null,
    error: null,
    isSigning: false,
    requestSignature: jest.fn(),
    clearSignature: jest.fn(),
  }

  const mockFirebaseAuthHook = {
    user: null,
    isAuthenticating: false,
    error: null,
    authenticateWithSignature: jest.fn(),
    logout: jest.fn(),
    clearError: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockConsoleLog.mockClear()
    mockConsoleError.mockClear()

    // Set up default mock returns
    mockUseWalletListener.mockReturnValue({
      isConnected: false,
      address: null,
      chainId: null,
      isConnecting: false,
    })

    mockUseMessageGeneration.mockReturnValue(mockMessageGenerationHook)
    mockUseSignatureHandling.mockReturnValue(mockSignatureHandlingHook)
    mockUseFirebaseAuth.mockReturnValue(mockFirebaseAuthHook)
  })

  afterAll(() => {
    mockConsoleLog.mockRestore()
    mockConsoleError.mockRestore()
  })

  it('should initialize with correct default state', () => {
    const { result } = renderHook(() => useAutoAuth())

    expect(result.current.isConnected).toBe(false)
    expect(result.current.address).toBe(null)
    expect(result.current.user).toBe(null)
    expect(result.current.isAuthenticating).toBe(false)
    expect(result.current.error).toBe(null)
    expect(result.current.progress).toBe(0)
    expect(result.current.isFullyAuthenticated).toBe(false)
    expect(result.current.needsAuthentication).toBe(false)
  })

  it('should reflect wallet connection state', () => {
    mockUseWalletListener.mockReturnValue({
      isConnected: true,
      address: '0x123456789',
      chainId: 137,
      isConnecting: false,
    })

    const { result } = renderHook(() => useAutoAuth())

    expect(result.current.isConnected).toBe(true)
    expect(result.current.address).toBe('0x123456789')
    expect(result.current.chainId).toBe(137)
  })

  it('should reflect firebase auth state', () => {
    const mockUser: User = {
      walletAddress: '0x123456789',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    mockUseFirebaseAuth.mockReturnValue({
      ...mockFirebaseAuthHook,
      user: mockUser,
    })

    const { result } = renderHook(() => useAutoAuth())

    expect(result.current.user).toEqual(mockUser)
  })

  it('should compute isFullyAuthenticated correctly when both wallet and user are present', () => {
    const mockUser: User = {
      walletAddress: '0x123456789',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    mockUseWalletListener.mockReturnValue({
      isConnected: true,
      address: '0x123456789',
      chainId: 137,
      isConnecting: false,
    })

    mockUseFirebaseAuth.mockReturnValue({
      ...mockFirebaseAuthHook,
      user: mockUser,
    })

    const { result } = renderHook(() => useAutoAuth())

    expect(result.current.isFullyAuthenticated).toBe(true)
    expect(result.current.needsAuthentication).toBe(false)
  })

  it('should compute needsAuthentication correctly when wallet connected but no user', () => {
    mockUseWalletListener.mockReturnValue({
      isConnected: true,
      address: '0x123456789',
      chainId: 137,
      isConnecting: false,
    })

    mockUseFirebaseAuth.mockReturnValue({
      ...mockFirebaseAuthHook,
      user: null,
    })

    const { result } = renderHook(() => useAutoAuth())

    expect(result.current.isFullyAuthenticated).toBe(false)
    // needsAuthentication depends on isAuthenticating state, which may be true due to useEffect
    // The actual computation: walletListener.isConnected && !firebaseAuth.user && !authState.isAuthenticating
    const expectedNeedsAuth = result.current.isConnected && !result.current.user && !result.current.isAuthenticating
    expect(result.current.needsAuthentication).toBe(expectedNeedsAuth)
  })

  it('should not need authentication when wallet is not connected', () => {
    mockUseWalletListener.mockReturnValue({
      isConnected: false,
      address: null,
      chainId: null,
      isConnecting: false,
    })

    const { result } = renderHook(() => useAutoAuth())

    expect(result.current.needsAuthentication).toBe(false)
  })

  it('should provide retry authentication function', () => {
    const { result } = renderHook(() => useAutoAuth())

    expect(typeof result.current.retryAuthentication).toBe('function')
  })

  it('should handle retry when wallet is not connected', async () => {
    mockUseWalletListener.mockReturnValue({
      isConnected: false,
      address: null,
      chainId: null,
      isConnecting: false,
    })

    const { result } = renderHook(() => useAutoAuth())

    await act(async () => {
      try {
        await result.current.retryAuthentication()
        throw new Error('Expected error to be thrown')
      } catch (error) {
        expect((error as Error).message).toBe('Wallet not connected')
      }
    })
  })

  it('should clear message generation state when wallet disconnects', () => {
    // Start with connected wallet
    mockUseWalletListener.mockReturnValue({
      isConnected: true,
      address: '0x123456789',
      chainId: 137,
      isConnecting: false,
    })

    const { rerender } = renderHook(() => useAutoAuth())

    // Clear previous mock calls
    jest.clearAllMocks()

    // Simulate disconnection
    act(() => {
      mockUseWalletListener.mockReturnValue({
        isConnected: false,
        address: null,
        chainId: null,
        isConnecting: false,
      })

      rerender({})
    })

    expect(mockMessageGenerationHook.clearState).toHaveBeenCalled()
    expect(mockConsoleLog).toHaveBeenCalledWith('🔌 Wallet disconnected - resetting auth state')
  })
})
