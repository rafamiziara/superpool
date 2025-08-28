/**
 * Comprehensive test suite for useAuthSessionRecovery hook
 * Tests session validation, automatic recovery, and state synchronization
 */

import { act, waitFor } from '@testing-library/react-native'
import { useAuthSessionRecovery } from './useAuthSessionRecovery'
import { createMockRootStore, renderHookWithStore } from '../../test-utils'

// Mock dependencies
jest.mock('../../firebase.config', () => ({
  FIREBASE_AUTH: {
    currentUser: null,
    signOut: jest.fn(() => Promise.resolve()),
  },
}))

jest.mock('../../utils', () => ({
  devOnly: jest.fn(),
  ValidationUtils: {
    isValidWalletAddress: jest.fn((address: string) => /^0x[a-fA-F0-9]{40}$/.test(address)),
  },
}))

jest.mock('wagmi', () => ({
  useAccount: jest.fn(() => ({
    isConnected: false,
    address: undefined,
    chain: { id: 1, name: 'Ethereum' },
    addresses: undefined,
    chainId: undefined,
    connector: undefined,
    isReconnecting: false,
    isConnecting: false,
    isDisconnected: true,
    status: 'disconnected',
  })),
}))

// Mock Firebase auth hook
const mockFirebaseAuth = {
  isAuthenticated: false,
  isLoading: false,
  walletAddress: null as string | null,
  user: null,
}

jest.mock('./useFirebaseAuth', () => ({
  useFirebaseAuth: () => mockFirebaseAuth,
}))

// Mock devOnly to track calls
const mockDevOnly = require('../../utils').devOnly as jest.MockedFunction<typeof import('../../utils').devOnly>
const mockSignOut = require('../../firebase.config').FIREBASE_AUTH.signOut as jest.MockedFunction<() => Promise<void>>
const mockIsValidWalletAddress = require('../../utils').ValidationUtils.isValidWalletAddress as jest.MockedFunction<(address: string) => boolean>
const mockUseAccount = require('wagmi').useAccount as jest.MockedFunction<typeof import('wagmi').useAccount>

describe('useAuthSessionRecovery', () => {
  let mockStore: ReturnType<typeof createMockRootStore>

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    mockStore = createMockRootStore()

    // Reset mock states
    Object.assign(mockFirebaseAuth, {
      isAuthenticated: false,
      isLoading: false,
      walletAddress: null,
      user: null,
    })

    mockUseAccount.mockReturnValue({
      isConnected: false,
      address: undefined,
      chain: { id: 1, name: 'Ethereum' },
      addresses: undefined,
      chainId: undefined,
      connector: undefined,
      isReconnecting: false,
      isConnecting: false,
      isDisconnected: true,
      status: 'disconnected',
    })

    mockIsValidWalletAddress.mockReturnValue(true)
    mockSignOut.mockResolvedValue()
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
    jest.clearAllMocks()
  })

  describe('Initial State', () => {
    it('should return initial recovery state', () => {
      const { result } = renderHookWithStore(() => useAuthSessionRecovery(), { store: mockStore })

      expect(result.current).toEqual(
        expect.objectContaining({
          isRecovering: false,
          recoveryAttempted: false,
          recoverySuccess: null,
          recoveryError: null,
          triggerRecovery: expect.any(Function),
          validateSession: expect.any(Function),
          isSessionValid: expect.any(Function),
          hasValidSession: false,
        })
      )
    })

    it('should not trigger automatic recovery when Firebase is loading', () => {
      mockFirebaseAuth.isLoading = true

      const { result } = renderHookWithStore(() => useAuthSessionRecovery(), { store: mockStore })

      // Fast-forward time past the recovery timeout
      act(() => {
        jest.advanceTimersByTime(1500)
      })

      expect(result.current.recoveryAttempted).toBe(false)
      expect(mockDevOnly).not.toHaveBeenCalledWith(expect.stringContaining('Attempting session recovery'))
    })
  })

  describe('Session Validation', () => {
    it('should validate a valid session correctly', () => {
      // Set up valid session
      mockFirebaseAuth.isAuthenticated = true
      mockFirebaseAuth.walletAddress = '0x1234567890123456789012345678901234567890'
      mockUseAccount.mockReturnValue({
        isConnected: true,
        address: '0x1234567890123456789012345678901234567890',
        chain: { id: 1, name: 'Ethereum' },
        addresses: ['0x1234567890123456789012345678901234567890'],
        chainId: 1,
        connector: undefined,
        isReconnecting: false,
        isConnecting: false,
        isDisconnected: false,
        status: 'connected',
      })

      const { result } = renderHookWithStore(() => useAuthSessionRecovery(), { store: mockStore })

      const validation = result.current.validateSession()

      expect(validation).toEqual({
        isValid: true,
        issues: [],
        walletAddress: '0x1234567890123456789012345678901234567890',
        firebaseAddress: '0x1234567890123456789012345678901234567890',
      })

      expect(result.current.isSessionValid()).toBe(true)
      expect(result.current.hasValidSession).toBe(true)
    })

    it('should detect missing Firebase authentication', () => {
      mockUseAccount.mockReturnValue({
        isConnected: true,
        address: '0x1234567890123456789012345678901234567890',
        chain: { id: 1, name: 'Ethereum' },
        addresses: ['0x1234567890123456789012345678901234567890'],
        chainId: 1,
        connector: undefined,
        isReconnecting: false,
        isConnecting: false,
        isDisconnected: false,
        status: 'connected',
      })

      const { result } = renderHookWithStore(() => useAuthSessionRecovery(), { store: mockStore })

      const validation = result.current.validateSession()

      expect(validation.isValid).toBe(false)
      expect(validation.issues).toContain('No Firebase authentication')
      expect(result.current.hasValidSession).toBe(false)
    })

    it('should detect missing wallet connection', () => {
      mockFirebaseAuth.isAuthenticated = true
      mockFirebaseAuth.walletAddress = '0x1234567890123456789012345678901234567890'

      const { result } = renderHookWithStore(() => useAuthSessionRecovery(), { store: mockStore })

      const validation = result.current.validateSession()

      expect(validation.isValid).toBe(false)
      expect(validation.issues).toContain('No wallet connection')
      expect(result.current.hasValidSession).toBe(false)
    })

    it('should detect wallet address mismatch', () => {
      mockFirebaseAuth.isAuthenticated = true
      mockFirebaseAuth.walletAddress = '0x1234567890123456789012345678901234567890'
      mockUseAccount.mockReturnValue({
        isConnected: true,
        address: '0xabcdef1234567890123456789012345678901234', // Different address
        chain: { id: 1, name: 'Ethereum' },
        addresses: ['0xabcdef1234567890123456789012345678901234'],
        chainId: 1,
        connector: undefined,
        isReconnecting: false,
        isConnecting: false,
        isDisconnected: false,
        status: 'connected',
      })

      const { result } = renderHookWithStore(() => useAuthSessionRecovery(), { store: mockStore })

      const validation = result.current.validateSession()

      expect(validation.isValid).toBe(false)
      expect(validation.issues).toContain('Wallet address mismatch with Firebase auth')
      expect(result.current.hasValidSession).toBe(false)
    })

    it('should detect invalid wallet address format', () => {
      mockIsValidWalletAddress.mockReturnValue(false)
      mockFirebaseAuth.isAuthenticated = true
      mockFirebaseAuth.walletAddress = '0xinvalidaddress0123456789012345678901234567' as `0x${string}`
      mockUseAccount.mockReturnValue({
        isConnected: true,
        address: '0xinvalidaddress0123456789012345678901234567' as `0x${string}`,
        chain: { id: 1, name: 'Ethereum' },
        addresses: ['0xinvalidaddress0123456789012345678901234567' as `0x${string}`],
        chainId: 1,
        connector: undefined,
        isReconnecting: false,
        isConnecting: false,
        isDisconnected: false,
        status: 'connected',
      })

      const { result } = renderHookWithStore(() => useAuthSessionRecovery(), { store: mockStore })

      const validation = result.current.validateSession()

      expect(validation.isValid).toBe(false)
      expect(validation.issues).toContain('Invalid Firebase wallet address format')
      expect(validation.issues).toContain('Invalid wallet address format')
    })

    it('should handle case-insensitive address matching', () => {
      mockFirebaseAuth.isAuthenticated = true
      mockFirebaseAuth.walletAddress = '0x1234567890123456789012345678901234567890'
      mockUseAccount.mockReturnValue({
        isConnected: true,
        address: '0X1234567890123456789012345678901234567890', // Different case
        chain: { id: 1, name: 'Ethereum' },
        addresses: ['0X1234567890123456789012345678901234567890'],
        chainId: 1,
        connector: undefined,
        isReconnecting: false,
        isConnecting: false,
        isDisconnected: false,
        status: 'connected',
      })

      const { result } = renderHookWithStore(() => useAuthSessionRecovery(), { store: mockStore })

      const validation = result.current.validateSession()

      expect(validation.isValid).toBe(true)
      expect(validation.issues).toEqual([])
    })
  })

  describe('Session Recovery Scenarios', () => {
    it('should handle valid session scenario', async () => {
      // Set up valid session
      mockFirebaseAuth.isAuthenticated = true
      mockFirebaseAuth.walletAddress = '0x1234567890123456789012345678901234567890'
      mockUseAccount.mockReturnValue({
        isConnected: true,
        address: '0x1234567890123456789012345678901234567890',
        chain: { id: 1, name: 'Ethereum' },
        addresses: ['0x1234567890123456789012345678901234567890'],
        chainId: 1,
        connector: undefined,
        isReconnecting: false,
        isConnecting: false,
        isDisconnected: false,
        status: 'connected',
      })

      const { result } = renderHookWithStore(() => useAuthSessionRecovery(), { store: mockStore })

      const recoveryResult = await act(async () => {
        return await result.current.triggerRecovery()
      })

      expect(recoveryResult).toEqual({
        success: true,
        action: 'validated_existing_session',
      })

      // Verify stores are synchronized
      expect(mockStore.walletStore.updateConnectionState).toHaveBeenCalledWith(
        true,
        '0x1234567890123456789012345678901234567890',
        1
      )
      expect(mockStore.authenticationStore.setAuthLock).toHaveBeenCalledWith({
        isLocked: false,
        startTime: 0,
        walletAddress: '0x1234567890123456789012345678901234567890',
        abortController: null,
      })
      expect(mockStore.authenticationStore.setAuthError).toHaveBeenCalledWith(null)
    })

    it('should handle Firebase auth exists but wallet not connected', async () => {
      mockFirebaseAuth.isAuthenticated = true
      mockFirebaseAuth.walletAddress = '0x1234567890123456789012345678901234567890'
      // Wallet is not connected

      const { result } = renderHookWithStore(() => useAuthSessionRecovery(), { store: mockStore })

      const recoveryResult = await act(async () => {
        return await result.current.triggerRecovery()
      })

      expect(recoveryResult).toEqual({
        success: false,
        error: 'Wallet connection required',
        action: 'await_wallet_connection',
      })
    })

    it('should handle wallet connected but no Firebase auth', async () => {
      mockUseAccount.mockReturnValue({
        isConnected: true,
        address: '0x1234567890123456789012345678901234567890',
        chain: { id: 1, name: 'Ethereum' },
        addresses: ['0x1234567890123456789012345678901234567890'],
        chainId: 1,
        connector: undefined,
        isReconnecting: false,
        isConnecting: false,
        isDisconnected: false,
        status: 'connected',
      })

      const { result } = renderHookWithStore(() => useAuthSessionRecovery(), { store: mockStore })

      const recoveryResult = await act(async () => {
        return await result.current.triggerRecovery()
      })

      expect(recoveryResult).toEqual({
        success: false,
        error: 'Authentication required',
        action: 'authentication_required',
      })
    })

    it('should handle address mismatch by clearing Firebase auth', async () => {
      mockFirebaseAuth.isAuthenticated = true
      mockFirebaseAuth.walletAddress = '0x1111111111111111111111111111111111111111'
      mockUseAccount.mockReturnValue({
        isConnected: true,
        address: '0x2222222222222222222222222222222222222222',
        chain: { id: 1, name: 'Ethereum' },
        addresses: ['0x2222222222222222222222222222222222222222'],
        chainId: 1,
        connector: undefined,
        isReconnecting: false,
        isConnecting: false,
        isDisconnected: false,
        status: 'connected',
      })

      const { result } = renderHookWithStore(() => useAuthSessionRecovery(), { store: mockStore })

      const recoveryResult = await act(async () => {
        return await result.current.triggerRecovery()
      })

      expect(mockSignOut).toHaveBeenCalled()
      expect(mockStore.authenticationStore.reset).toHaveBeenCalled()
      expect(recoveryResult).toEqual({
        success: false,
        error: 'Address mismatch resolved - authentication required',
        action: 'cleared_mismatched_auth',
      })
    })

    it('should handle invalid address formats by clearing everything', async () => {
      mockIsValidWalletAddress.mockReturnValue(false)
      mockFirebaseAuth.isAuthenticated = true
      mockFirebaseAuth.walletAddress = '0xinvalidaddress0123456789012345678901234567' as `0x${string}`
      mockUseAccount.mockReturnValue({
        isConnected: true,
        address: '0xinvalidaddress0123456789012345678901234567' as `0x${string}`,
        chain: { id: 1, name: 'Ethereum' },
        addresses: ['0xinvalidaddress0123456789012345678901234567' as `0x${string}`],
        chainId: 1,
        connector: undefined,
        isReconnecting: false,
        isConnecting: false,
        isDisconnected: false,
        status: 'connected',
      })

      const { result } = renderHookWithStore(() => useAuthSessionRecovery(), { store: mockStore })

      const recoveryResult = await act(async () => {
        return await result.current.triggerRecovery()
      })

      expect(mockSignOut).toHaveBeenCalled()
      expect(mockStore.authenticationStore.reset).toHaveBeenCalled()
      expect(mockStore.walletStore.disconnect).toHaveBeenCalled()
      expect(recoveryResult).toEqual({
        success: false,
        error: 'Invalid authentication data cleared',
        action: 'cleared_invalid_data',
      })
    })

    it('should handle no authentication available', async () => {
      const { result } = renderHookWithStore(() => useAuthSessionRecovery(), { store: mockStore })

      const recoveryResult = await act(async () => {
        return await result.current.triggerRecovery()
      })

      expect(recoveryResult).toEqual({
        success: false,
        error: 'No valid authentication session found',
        action: 'no_session',
      })
    })

    it('should handle recovery errors', async () => {
      const errorMessage = 'Test recovery error'
      mockSignOut.mockRejectedValue(new Error(errorMessage))

      mockFirebaseAuth.isAuthenticated = true
      mockFirebaseAuth.walletAddress = '0x1111111111111111111111111111111111111111'
      mockUseAccount.mockReturnValue({
        isConnected: true,
        address: '0x2222222222222222222222222222222222222222',
        chain: { id: 1, name: 'Ethereum' },
        addresses: ['0x2222222222222222222222222222222222222222'],
        chainId: 1,
        connector: undefined,
        isReconnecting: false,
        isConnecting: false,
        isDisconnected: false,
        status: 'connected',
      })

      const { result } = renderHookWithStore(() => useAuthSessionRecovery(), { store: mockStore })

      const recoveryResult = await act(async () => {
        return await result.current.triggerRecovery()
      })

      expect(recoveryResult).toEqual({
        success: false,
        error: errorMessage,
        action: 'recovery_failed',
      })
    })
  })

  describe('Manual Recovery', () => {
    it('should handle manual recovery trigger', async () => {
      mockFirebaseAuth.isAuthenticated = true
      mockFirebaseAuth.walletAddress = '0x1234567890123456789012345678901234567890'
      mockUseAccount.mockReturnValue({
        isConnected: true,
        address: '0x1234567890123456789012345678901234567890',
        chain: { id: 1, name: 'Ethereum' },
        addresses: ['0x1234567890123456789012345678901234567890'],
        chainId: 1,
        connector: undefined,
        isReconnecting: false,
        isConnecting: false,
        isDisconnected: false,
        status: 'connected',
      })

      const { result } = renderHookWithStore(() => useAuthSessionRecovery(), { store: mockStore })

      expect(result.current.isRecovering).toBe(false)

      await act(async () => {
        await result.current.triggerRecovery()
      })

      expect(result.current.recoveryAttempted).toBe(true)
      expect(result.current.recoverySuccess).toBe(true)
      expect(result.current.recoveryError).toBeNull()
    })

    it('should prevent multiple concurrent recoveries', async () => {
      const { result } = renderHookWithStore(() => useAuthSessionRecovery(), { store: mockStore })

      // Start first recovery
      const firstRecovery = act(async () => {
        return result.current.triggerRecovery()
      })

      // Try to start second recovery immediately
      const secondRecovery = act(async () => {
        return result.current.triggerRecovery()
      })

      const [firstResult, secondResult] = await Promise.all([firstRecovery, secondRecovery])

      // First recovery should complete
      expect(firstResult).toBeDefined()

      // Second recovery should return early (no result)
      expect(secondResult).toBeUndefined()
    })

    it('should update recovery state during manual recovery', async () => {
      const { result } = renderHookWithStore(() => useAuthSessionRecovery(), { store: mockStore })

      let recoveryPromise: Promise<any>

      await act(async () => {
        recoveryPromise = result.current.triggerRecovery()
        // Recovery should be in progress
        expect(result.current.isRecovering).toBe(true)
        expect(result.current.recoveryError).toBeNull()
        
        await recoveryPromise
      })

      // Recovery should be complete
      expect(result.current.isRecovering).toBe(false)
      expect(result.current.recoveryAttempted).toBe(true)
    })

    it('should handle manual recovery errors', async () => {
      const errorMessage = 'Manual recovery error'
      
      // Mock an error during recovery
      mockUseAccount.mockImplementation(() => {
        throw new Error(errorMessage)
      })

      const { result } = renderHookWithStore(() => useAuthSessionRecovery(), { store: mockStore })

      await expect(act(async () => {
        await result.current.triggerRecovery()
      })).rejects.toThrow(errorMessage)

      expect(result.current.isRecovering).toBe(false)
      expect(result.current.recoveryAttempted).toBe(true)
      expect(result.current.recoverySuccess).toBe(false)
      expect(result.current.recoveryError).toBe(errorMessage)
    })
  })

  describe('Automatic Recovery', () => {
    it('should trigger automatic recovery after delay', async () => {
      mockFirebaseAuth.isLoading = false
      const { result } = renderHookWithStore(() => useAuthSessionRecovery(), { store: mockStore })

      expect(result.current.recoveryAttempted).toBe(false)

      // Fast-forward time past the recovery timeout
      await act(async () => {
        jest.advanceTimersByTime(1500)
        await waitFor(() => expect(result.current.recoveryAttempted).toBe(true), { timeout: 100 })
      })

      expect(result.current.recoveryAttempted).toBe(true)
      expect(mockDevOnly).toHaveBeenCalledWith('🔄 Attempting session recovery...')
    })

    it('should not trigger automatic recovery if already attempted', async () => {
      mockFirebaseAuth.isLoading = false
      const { result, rerender } = renderHookWithStore(() => useAuthSessionRecovery(), { store: mockStore })

      // First trigger
      await act(async () => {
        jest.advanceTimersByTime(1500)
        await waitFor(() => expect(result.current.recoveryAttempted).toBe(true), { timeout: 100 })
      })

      const devOnlyCalls = (mockDevOnly as jest.MockedFunction<any>).mock.calls.length

      // Rerender to simulate component update
      rerender({})

      // Advance time again
      act(() => {
        jest.advanceTimersByTime(1500)
      })

      // Should not trigger again
      expect((mockDevOnly as jest.MockedFunction<any>).mock.calls.length).toBe(devOnlyCalls)
    })

    it('should cleanup timeout on unmount', () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout')
      
      const { unmount } = renderHookWithStore(() => useAuthSessionRecovery(), { store: mockStore })

      unmount()

      expect(clearTimeoutSpy).toHaveBeenCalled()
      clearTimeoutSpy.mockRestore()
    })
  })

  describe('Edge Cases', () => {
    it('should handle undefined chain ID gracefully', async () => {
      mockFirebaseAuth.isAuthenticated = true
      mockFirebaseAuth.walletAddress = '0x1234567890123456789012345678901234567890'
      mockUseAccount.mockReturnValue({
        isConnected: true,
        address: '0x1234567890123456789012345678901234567890',
        chain: undefined, // No chain info
        addresses: ['0x1234567890123456789012345678901234567890'],
        chainId: undefined,
        connector: undefined,
        isReconnecting: false,
        isConnecting: false,
        isDisconnected: false,
        status: 'connected',
      })

      const { result } = renderHookWithStore(() => useAuthSessionRecovery(), { store: mockStore })

      const recoveryResult = await act(async () => {
        return await result.current.triggerRecovery()
      })

      expect(recoveryResult?.success).toBe(true)
      expect(mockStore.walletStore.updateConnectionState).toHaveBeenCalledWith(
        true,
        '0x1234567890123456789012345678901234567890',
        undefined
      )
    })

    it('should handle null addresses gracefully', () => {
      const { result } = renderHookWithStore(() => useAuthSessionRecovery(), { store: mockStore })

      const validation = result.current.validateSession()

      expect(validation.walletAddress).toBeNull()
      expect(validation.firebaseAddress).toBeNull()
      expect(validation.isValid).toBe(false)
    })

    it('should handle validation with partial states', () => {
      // Only Firebase auth, no wallet
      mockFirebaseAuth.isAuthenticated = true
      mockFirebaseAuth.walletAddress = '0x1234567890123456789012345678901234567890'

      const { result } = renderHookWithStore(() => useAuthSessionRecovery(), { store: mockStore })

      const validation = result.current.validateSession()

      expect(validation.firebaseAddress).toBe('0x1234567890123456789012345678901234567890')
      expect(validation.walletAddress).toBeNull()
      expect(validation.isValid).toBe(false)
      expect(validation.issues).toContain('No wallet connection')
    })
  })
})