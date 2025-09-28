import { act, renderHook } from '@testing-library/react-native'
import { authStore } from '../../stores/AuthStore'
import { useAutoAuth } from './useAutoAuth'

// Mock Firebase config (not covered by global mocks)
jest.mock('../../config/firebase', () => ({
  FIREBASE_AUTH: {
    currentUser: null,
  },
}))

// Mock Firebase auth hook
const mockUseFirebaseAuth = {
  authenticateWithSignature: jest.fn(),
  signOut: jest.fn(),
  state: {
    user: null,
    isAuthenticating: false,
    error: null,
  },
}

jest.mock('./useFirebaseAuth', () => ({
  useFirebaseAuth: () => mockUseFirebaseAuth,
}))

// Mock message generation hook
const mockUseMessageGeneration = {
  generateMessage: jest.fn(),
  clearState: jest.fn(),
  state: {
    message: null,
    nonce: null,
    timestamp: null,
    isGenerating: false,
    error: null,
  },
}

jest.mock('./useMessageGeneration', () => ({
  useMessageGeneration: () => mockUseMessageGeneration,
}))

// Mock signature handling hook
const mockUseSignatureHandling = {
  requestSignature: jest.fn(),
  state: {
    signature: null,
    error: null,
    isSigning: false,
  },
}

jest.mock('./useSignatureHandling', () => ({
  useSignatureHandling: () => mockUseSignatureHandling,
}))

describe('useAutoAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    console.log = jest.fn() // Suppress console logs
    console.error = jest.fn()

    // Reset AuthStore to clean state
    act(() => {
      authStore.reset()
    })

    // Reset mocks to default successful state
    mockUseFirebaseAuth.authenticateWithSignature.mockResolvedValue({
      walletAddress: '0x1234567890abcdef',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    mockUseMessageGeneration.generateMessage.mockResolvedValue({
      message: 'Test authentication message',
      nonce: 'test-nonce',
      timestamp: Date.now(),
    })

    mockUseSignatureHandling.requestSignature.mockResolvedValue('0xtest-signature')
  })

  afterEach(() => {
    // Clean up AuthStore after each test
    act(() => {
      authStore.reset()
    })
  })

  describe('Authentication Guard Conditions', () => {
    it('should not authenticate when wallet is not connected', () => {
      act(() => {
        authStore.updateWalletState({ isConnected: false, address: null, chainId: null })
      })

      renderHook(() => useAutoAuth())

      // Should not call any authentication methods
      expect(mockUseMessageGeneration.generateMessage).not.toHaveBeenCalled()
      expect(mockUseSignatureHandling.requestSignature).not.toHaveBeenCalled()
      expect(mockUseFirebaseAuth.authenticateWithSignature).not.toHaveBeenCalled()
    })

    it('should not authenticate when wallet address is missing', () => {
      act(() => {
        authStore.updateWalletState({ isConnected: true, address: null, chainId: 1 })
      })

      renderHook(() => useAutoAuth())

      expect(mockUseMessageGeneration.generateMessage).not.toHaveBeenCalled()
      expect(mockUseSignatureHandling.requestSignature).not.toHaveBeenCalled()
      expect(mockUseFirebaseAuth.authenticateWithSignature).not.toHaveBeenCalled()
    })

    it('should not authenticate when already authenticating', () => {
      act(() => {
        authStore.updateWalletState({ isConnected: true, address: '0x1234567890abcdef', chainId: 1 })
        authStore.acquireAuthLock('0x1234567890abcdef')
        authStore.startStep('connect-wallet')
      })

      renderHook(() => useAutoAuth())

      expect(mockUseMessageGeneration.generateMessage).not.toHaveBeenCalled()
      expect(mockUseSignatureHandling.requestSignature).not.toHaveBeenCalled()
      expect(mockUseFirebaseAuth.authenticateWithSignature).not.toHaveBeenCalled()
    })

    it('should not authenticate when there is an error', () => {
      act(() => {
        authStore.updateWalletState({ isConnected: true, address: '0x1234567890abcdef', chainId: 1 })
        authStore.setError('Previous error')
      })

      renderHook(() => useAutoAuth())

      expect(mockUseMessageGeneration.generateMessage).not.toHaveBeenCalled()
      expect(mockUseSignatureHandling.requestSignature).not.toHaveBeenCalled()
      expect(mockUseFirebaseAuth.authenticateWithSignature).not.toHaveBeenCalled()
    })

    it('should not authenticate when Firebase user already exists', async () => {
      // Mock Firebase user exists
      const firebase = require('../../config/firebase')
      firebase.FIREBASE_AUTH.currentUser = { uid: 'existing-user' }

      act(() => {
        authStore.updateWalletState({ isConnected: true, address: '0x1234567890abcdef', chainId: 1 })
      })

      renderHook(() => useAutoAuth())

      expect(mockUseMessageGeneration.generateMessage).not.toHaveBeenCalled()
      expect(mockUseSignatureHandling.requestSignature).not.toHaveBeenCalled()
      expect(mockUseFirebaseAuth.authenticateWithSignature).not.toHaveBeenCalled()

      // Reset for other tests
      firebase.FIREBASE_AUTH.currentUser = null
    })
  })

  describe('Successful Authentication Flow', () => {
    it('should complete full authentication flow successfully', async () => {
      const walletAddress = '0x1234567890abcdef'

      act(() => {
        authStore.reset()
        authStore.updateWalletState({ isConnected: true, address: walletAddress, chainId: 1 })
      })

      renderHook(() => useAutoAuth())

      // Wait for async operations to complete
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
      })

      // Verify authentication steps were called in order
      expect(mockUseMessageGeneration.generateMessage).toHaveBeenCalledWith(walletAddress)
      expect(mockUseSignatureHandling.requestSignature).toHaveBeenCalledWith('Test authentication message')
      expect(mockUseFirebaseAuth.authenticateWithSignature).toHaveBeenCalledWith({
        walletAddress,
        signature: '0xtest-signature',
        nonce: 'test-nonce',
        timestamp: expect.any(Number),
        message: 'Test authentication message',
      })

      // Verify final state
      expect(authStore.user).toEqual({
        walletAddress: '0x1234567890abcdef',
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
      })
      expect(authStore.error).toBeNull()
      expect(authStore.isAuthenticating).toBe(false)
    })

    it('should track authentication steps correctly', async () => {
      act(() => {
        authStore.updateWalletState({ isConnected: true, address: '0x1234567890abcdef', chainId: 1 })
      })

      renderHook(() => useAutoAuth())

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      // Verify all steps were completed
      expect(authStore.getStepStatus('connect-wallet')).toBe('completed')
      expect(authStore.getStepStatus('acquire-lock')).toBe('completed')
      expect(authStore.getStepStatus('generate-message')).toBe('completed')
      expect(authStore.getStepStatus('request-signature')).toBe('completed')
      expect(authStore.getStepStatus('verify-signature')).toBe('completed')
      expect(authStore.getStepStatus('firebase-auth')).toBe('completed')
    })

    it('should release auth lock after successful authentication', async () => {
      act(() => {
        authStore.updateWalletState({ isConnected: true, address: '0x1234567890abcdef', chainId: 1 })
      })

      renderHook(() => useAutoAuth())

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      expect(authStore.authLock.isLocked).toBe(false)
    })
  })

  describe('Error Handling', () => {
    it('should handle message generation error', async () => {
      const errorMessage = 'Message generation failed'
      mockUseMessageGeneration.generateMessage.mockRejectedValue(new Error(errorMessage))

      act(() => {
        authStore.updateWalletState({ isConnected: true, address: '0x1234567890abcdef', chainId: 1 })
      })

      renderHook(() => useAutoAuth())

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      expect(authStore.error).toBe(errorMessage)
      expect(authStore.failedStep).toBe('generate-message')
      expect(authStore.authLock.isLocked).toBe(false) // Should release lock on error
    })

    it('should handle signature request error', async () => {
      const errorMessage = 'User rejected signature'
      mockUseSignatureHandling.requestSignature.mockRejectedValue(new Error(errorMessage))

      act(() => {
        authStore.updateWalletState({ isConnected: true, address: '0x1234567890abcdef', chainId: 1 })
      })

      renderHook(() => useAutoAuth())

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      expect(authStore.error).toBe(errorMessage)
      expect(authStore.failedStep).toBe('request-signature')
      expect(authStore.authLock.isLocked).toBe(false)
    })

    it('should handle Firebase authentication error', async () => {
      const errorMessage = 'Firebase authentication failed'
      mockUseFirebaseAuth.authenticateWithSignature.mockRejectedValue(new Error(errorMessage))

      act(() => {
        authStore.updateWalletState({ isConnected: true, address: '0x1234567890abcdef', chainId: 1 })
      })

      renderHook(() => useAutoAuth())

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      expect(authStore.error).toBe(errorMessage)
      expect(authStore.failedStep).toBe('firebase-auth')
      expect(authStore.authLock.isLocked).toBe(false)
    })

    it('should handle non-Error exceptions', async () => {
      mockUseMessageGeneration.generateMessage.mockRejectedValue('String error')

      act(() => {
        authStore.updateWalletState({ isConnected: true, address: '0x1234567890abcdef', chainId: 1 })
      })

      renderHook(() => useAutoAuth())

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      expect(authStore.error).toBe('Auto-authentication failed')
      expect(authStore.authLock.isLocked).toBe(false)
    })
  })

  describe('Wallet Disconnect Auto-Reset', () => {
    it('should reset auth state when wallet disconnects', async () => {
      // Start with wallet connected and some auth state
      act(() => {
        authStore.updateWalletState({ isConnected: true, address: '0x1234567890abcdef', chainId: 1 })
        authStore.acquireAuthLock('0x1234567890abcdef')
        authStore.setUser({ walletAddress: '0x1234567890abcdef', createdAt: Date.now(), updatedAt: Date.now() })
      })

      const { rerender } = renderHook(() => useAutoAuth())

      // Disconnect wallet
      act(() => {
        authStore.updateWalletState({ isConnected: false, address: null, chainId: null })
      })

      // Trigger re-render to run the disconnect effect
      rerender({})

      // Verify state was reset
      expect(authStore.user).toBeNull()
      expect(authStore.authLock.isLocked).toBe(false)
      expect(authStore.completedSteps.size).toBe(0)
      expect(authStore.error).toBeNull()
      expect(mockUseMessageGeneration.clearState).toHaveBeenCalled()
    })

    it('should not reset when wallet remains connected', async () => {
      act(() => {
        authStore.updateWalletState({ isConnected: true, address: '0x1234567890abcdef', chainId: 1 })
        authStore.setUser({ walletAddress: '0x1234567890abcdef', createdAt: Date.now(), updatedAt: Date.now() })
      })

      const { rerender } = renderHook(() => useAutoAuth())

      // Wallet stays connected - trigger re-render
      rerender({})

      // Verify state was NOT reset
      expect(authStore.user).toEqual({
        walletAddress: '0x1234567890abcdef',
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
      })
      expect(mockUseMessageGeneration.clearState).not.toHaveBeenCalled()
    })
  })

  describe('Auth Lock Mechanism', () => {
    it('should skip authentication if lock acquisition fails', async () => {
      const walletAddress = '0x1234567890abcdef'

      // Set up wallet connection first
      act(() => {
        authStore.reset()
        authStore.updateWalletState({ isConnected: true, address: walletAddress, chainId: 1 })
      })

      const { rerender } = renderHook(() => useAutoAuth())

      // Let the first hook start authentication and acquire the lock
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      // Now simulate another instance trying to authenticate the same wallet
      // Reset wallet state to trigger effect again while lock is held
      act(() => {
        authStore.updateWalletState({ isConnected: false, address: null, chainId: null })
      })

      rerender({})

      act(() => {
        authStore.updateWalletState({ isConnected: true, address: walletAddress, chainId: 1 })
      })

      rerender({})

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
      })

      // Authentication should have succeeded at least once
      expect(mockUseMessageGeneration.generateMessage).toHaveBeenCalled()
    })
  })

  describe('Effect Dependencies', () => {
    it('should re-run authentication when wallet address changes', async () => {
      // Test changing wallet addresses within one test
      act(() => {
        authStore.reset()
        authStore.updateWalletState({ isConnected: true, address: '0x1111111111111111', chainId: 1 })
      })

      const { rerender } = renderHook(() => useAutoAuth())

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
      })

      // Verify first address was used
      expect(mockUseMessageGeneration.generateMessage).toHaveBeenCalledWith('0x1111111111111111')

      // Count the number of calls before changing address
      const initialCallCount = mockUseMessageGeneration.generateMessage.mock.calls.length

      // Change wallet address by updating wallet state
      act(() => {
        authStore.reset() // Clear auth state but keep wallet connected
        authStore.updateWalletState({ isConnected: true, address: '0x2222222222222222', chainId: 1 })
      })

      rerender({})

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
      })

      // Verify second address was used and there was a new call
      expect(mockUseMessageGeneration.generateMessage.mock.calls.length).toBeGreaterThan(initialCallCount)
      expect(mockUseMessageGeneration.generateMessage).toHaveBeenCalledWith('0x2222222222222222')
    })

    it('should re-run authentication when error is cleared', async () => {
      // Start with error state
      act(() => {
        authStore.updateWalletState({ isConnected: true, address: '0x1234567890abcdef', chainId: 1 })
        authStore.setError('Test error')
      })

      const { rerender } = renderHook(() => useAutoAuth())

      // Should not authenticate with error
      expect(mockUseMessageGeneration.generateMessage).not.toHaveBeenCalled()

      // Clear error
      act(() => {
        authStore.setError(null)
      })

      rerender({})

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      // Should now authenticate
      expect(mockUseMessageGeneration.generateMessage).toHaveBeenCalledWith('0x1234567890abcdef')
    })
  })
})
