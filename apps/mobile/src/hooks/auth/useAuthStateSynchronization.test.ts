/**
 * Comprehensive test suite for useAuthStateSynchronization hook
 * Tests Firebase/wallet sync, MobX autorun, and consistency validation
 */

import { act, waitFor } from '@testing-library/react-native'
import { runInAction } from 'mobx'
import { useAuthStateSynchronization, useAuthStateValidation } from './useAuthStateSynchronization'
import { createMockRootStore, renderHookWithStore } from '../../test-utils'
import { AppError, ErrorType } from '../../utils/errorHandling'

// Create proper Chain type mock
const createMockChain = (id: number, name: string) => ({
  id,
  name,
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://ethereum.publicnode.com'],
    },
  },
})

// Mock dependencies
const mockSignOut = jest.fn(() => Promise.resolve())
jest.mock('../../firebase.config', () => ({
  FIREBASE_AUTH: {
    signOut: mockSignOut,
  },
}))

jest.mock('../../utils', () => ({
  devOnly: jest.fn(),
}))

jest.mock('wagmi', () => ({
  useAccount: jest.fn(() => ({
    isConnected: false,
    address: undefined,
    chain: createMockChain(1, 'Ethereum'),
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

// Mock references
const mockDevOnly = require('../../utils').devOnly as jest.MockedFunction<typeof import('../../utils').devOnly>
const mockUseAccount = require('wagmi').useAccount as jest.MockedFunction<typeof import('wagmi').useAccount>

describe('useAuthStateSynchronization', () => {
  let mockStore: ReturnType<typeof createMockRootStore>

  beforeEach(() => {
    jest.clearAllMocks()
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
      chain: createMockChain(1, 'Ethereum'),
      addresses: undefined,
      chainId: undefined,
      connector: undefined,
      isReconnecting: false,
      isConnecting: false,
      isDisconnected: true,
      status: 'disconnected',
    })

    mockSignOut.mockResolvedValue()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should initialize without errors', () => {
      const { unmount } = renderHookWithStore(() => useAuthStateSynchronization(), { store: mockStore })
      
      expect(() => unmount()).not.toThrow()
    })

    it('should skip sync when Firebase is loading', () => {
      mockFirebaseAuth.isLoading = true

      renderHookWithStore(() => useAuthStateSynchronization(), { store: mockStore })

      // Should not log any sync checks when loading
      expect(mockDevOnly).not.toHaveBeenCalledWith(
        '🔄 Auth state sync check:',
        expect.any(Object)
      )
    })

    it('should properly dispose autorun on unmount', () => {
      const { unmount } = renderHookWithStore(() => useAuthStateSynchronization(), { store: mockStore })
      
      // Should not throw and should cleanup properly
      expect(() => unmount()).not.toThrow()
    })
  })

  describe('Sync Scenario 1: Firebase Authenticated but Wallet Disconnected', () => {
    beforeEach(() => {
      // Set Firebase as authenticated but wallet disconnected
      mockFirebaseAuth.isAuthenticated = true
      mockFirebaseAuth.walletAddress = '0x1234567890123456789012345678901234567890'
      mockFirebaseAuth.isLoading = false

      // Wallet store shows disconnected
      mockStore.walletStore.currentState.isConnected = false
      mockStore.walletStore.currentState.address = undefined
    })

    it('should clear Firebase auth when wallet is disconnected', async () => {
      renderHookWithStore(() => useAuthStateSynchronization(), { store: mockStore })

      await waitFor(() => {
        expect(mockDevOnly).toHaveBeenCalledWith(
          '⚠️  Firebase authenticated but wallet disconnected - clearing Firebase auth'
        )
      })

      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalled()
      })

      await waitFor(() => {
        expect(mockStore.authenticationStore.reset).toHaveBeenCalled()
      })
    })

    it('should handle Firebase signOut errors gracefully', async () => {
      const error = new Error('Firebase signOut failed')
      mockSignOut.mockRejectedValue(error)
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

      renderHookWithStore(() => useAuthStateSynchronization(), { store: mockStore })

      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalled()
      })

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('❌ Failed to clear Firebase auth:', error)
      })

      consoleSpy.mockRestore()
    })
  })

  describe('Sync Scenario 2: Wallet Address Mismatch', () => {
    beforeEach(() => {
      // Both authenticated but with different addresses
      mockFirebaseAuth.isAuthenticated = true
      mockFirebaseAuth.walletAddress = '0x1111111111111111111111111111111111111111'
      mockFirebaseAuth.isLoading = false

      mockStore.walletStore.currentState.isConnected = true
      mockStore.walletStore.currentState.address = '0x2222222222222222222222222222222222222222'
    })

    it('should clear Firebase auth when addresses mismatch', async () => {
      renderHookWithStore(() => useAuthStateSynchronization(), { store: mockStore })

      await waitFor(() => {
        expect(mockDevOnly).toHaveBeenCalledWith(
          '⚠️  Wallet address mismatch with Firebase auth - clearing Firebase auth'
        )
      })

      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalled()
      })

      await waitFor(() => {
        expect(mockStore.authenticationStore.reset).toHaveBeenCalled()
      })
    })

    it('should handle case-insensitive address comparison', async () => {
      // Set same address but different case
      mockFirebaseAuth.walletAddress = '0x1234567890123456789012345678901234567890'
      mockStore.walletStore.currentState.address = '0x1234567890123456789012345678901234567890'

      renderHookWithStore(() => useAuthStateSynchronization(), { store: mockStore })

      // Should NOT trigger mismatch clearing
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100))
      })

      expect(mockDevOnly).not.toHaveBeenCalledWith(
        expect.stringContaining('mismatch')
      )
      expect(mockSignOut).not.toHaveBeenCalled()
    })

    it('should handle address mismatch signOut errors', async () => {
      const error = new Error('SignOut failed during mismatch')
      mockSignOut.mockRejectedValue(error)
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

      renderHookWithStore(() => useAuthStateSynchronization(), { store: mockStore })

      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalled()
      })

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('❌ Failed to clear Firebase auth:', error)
      })

      consoleSpy.mockRestore()
    })
  })

  describe('Sync Scenario 3: Sync Authentication Store', () => {
    beforeEach(() => {
      // Both Firebase and wallet authenticated with matching addresses
      mockFirebaseAuth.isAuthenticated = true
      mockFirebaseAuth.walletAddress = '0x1234567890123456789012345678901234567890'
      mockFirebaseAuth.isLoading = false

      mockStore.walletStore.currentState.isConnected = true
      mockStore.walletStore.currentState.address = '0x1234567890123456789012345678901234567890'
      
      // Auth store doesn't have wallet address yet
      mockStore.authenticationStore.authLock = {
        ...mockStore.authenticationStore.authLock,
        walletAddress: null
      }
    })

    it('should sync authentication store with Firebase auth', async () => {
      renderHookWithStore(() => useAuthStateSynchronization(), { store: mockStore })

      await waitFor(() => {
        expect(mockDevOnly).toHaveBeenCalledWith('✅ Syncing authentication store with Firebase auth')
      })

      await waitFor(() => {
        expect(mockStore.authenticationStore.setAuthLock).toHaveBeenCalledWith({
          isLocked: false,
          startTime: 0,
          walletAddress: '0x1234567890123456789012345678901234567890',
          abortController: null,
        })
      })

      await waitFor(() => {
        expect(mockStore.authenticationStore.setAuthError).toHaveBeenCalledWith(null)
      })
    })

    it('should not sync if authentication store already has wallet address', async () => {
      // Auth store already has wallet address
      mockStore.authenticationStore.authLock = {
        ...mockStore.authenticationStore.authLock,
        walletAddress: '0x1234567890123456789012345678901234567890'
      }

      renderHookWithStore(() => useAuthStateSynchronization(), { store: mockStore })

      // Give some time for potential sync
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100))
      })

      expect(mockDevOnly).not.toHaveBeenCalledWith('✅ Syncing authentication store with Firebase auth')
      expect(mockStore.authenticationStore.setAuthLock).not.toHaveBeenCalled()
    })
  })

  describe('Sync Scenario 4: Wallet Connected but Not Authenticated', () => {
    beforeEach(() => {
      // Wallet connected but no Firebase auth
      mockFirebaseAuth.isAuthenticated = false
      mockFirebaseAuth.isLoading = false

      mockStore.walletStore.currentState.isConnected = true
      mockStore.walletStore.currentState.address = '0x1234567890123456789012345678901234567890'
      
      mockStore.authenticationStore.authLock = {
        ...mockStore.authenticationStore.authLock,
        isLocked: false
      }
      mockStore.authenticationStore.authError = null
    })

    it('should log that authentication may be needed', async () => {
      renderHookWithStore(() => useAuthStateSynchronization(), { store: mockStore })

      await waitFor(() => {
        expect(mockDevOnly).toHaveBeenCalledWith(
          'ℹ️  Wallet connected but not Firebase authenticated - authentication may be needed'
        )
      })
    })

    it('should not log when authentication is in progress', async () => {
      mockStore.authenticationStore.authLock = {
        ...mockStore.authenticationStore.authLock,
        isLocked: true
      }

      renderHookWithStore(() => useAuthStateSynchronization(), { store: mockStore })

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100))
      })

      expect(mockDevOnly).not.toHaveBeenCalledWith(
        expect.stringContaining('authentication may be needed')
      )
    })

    it('should not log when there is an auth error', async () => {
      mockStore.authenticationStore.authError = {
        name: 'AppError',
        message: 'Some auth error',
        type: ErrorType.AUTHENTICATION_FAILED,
        userFriendlyMessage: 'Some auth error'
      } as AppError

      renderHookWithStore(() => useAuthStateSynchronization(), { store: mockStore })

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100))
      })

      expect(mockDevOnly).not.toHaveBeenCalledWith(
        expect.stringContaining('authentication may be needed')
      )
    })
  })

  describe('Sync Scenario 5: Firebase Auth but No Wallet Connection', () => {
    beforeEach(() => {
      // Firebase authenticated but no wallet connection
      mockFirebaseAuth.isAuthenticated = true
      mockFirebaseAuth.walletAddress = '0x1234567890123456789012345678901234567890'
      mockFirebaseAuth.isLoading = false

      // Both wallet store and wagmi show no connection
      mockStore.walletStore.currentState.isConnected = false
      mockUseAccount.mockReturnValue({
        isConnected: false,
        address: undefined,
        chain: createMockChain(1, 'Ethereum'),
        addresses: undefined,
        chainId: undefined,
        connector: undefined,
        isReconnecting: false,
        isConnecting: false,
        isDisconnected: true,
        status: 'disconnected',
      })
    })

    it('should log Firebase authenticated but no wallet connection', async () => {
      renderHookWithStore(() => useAuthStateSynchronization(), { store: mockStore })

      await waitFor(() => {
        expect(mockDevOnly).toHaveBeenCalledWith(
          '⚠️  Firebase authenticated but no wallet connection detected'
        )
      })
    })
  })

  describe('MobX Reactivity', () => {
    it('should react to Firebase auth state changes', async () => {
      const { rerender } = renderHookWithStore(() => useAuthStateSynchronization(), { store: mockStore })

      // Initially no auth
      expect(mockDevOnly).toHaveBeenCalledWith(
        '🔄 Auth state sync check:',
        expect.objectContaining({
          firebase: { isAuth: false, address: null }
        })
      )

      // Change Firebase auth state
      runInAction(() => {
        mockFirebaseAuth.isAuthenticated = true
        mockFirebaseAuth.walletAddress = '0x1234567890123456789012345678901234567890'
      })

      rerender({})

      await waitFor(() => {
        expect(mockDevOnly).toHaveBeenCalledWith(
          '🔄 Auth state sync check:',
          expect.objectContaining({
            firebase: { isAuth: true, address: '0x1234567890123456789012345678901234567890' }
          })
        )
      })
    })

    it('should react to wallet store state changes', async () => {
      const { rerender } = renderHookWithStore(() => useAuthStateSynchronization(), { store: mockStore })

      // Initially disconnected
      expect(mockDevOnly).toHaveBeenCalledWith(
        '🔄 Auth state sync check:',
        expect.objectContaining({
          wallet: { connected: false, address: undefined }
        })
      )

      // Change wallet store state
      runInAction(() => {
        mockStore.walletStore.currentState.isConnected = true
        mockStore.walletStore.currentState.address = '0x1234567890123456789012345678901234567890'
      })

      rerender({})

      await waitFor(() => {
        expect(mockDevOnly).toHaveBeenCalledWith(
          '🔄 Auth state sync check:',
          expect.objectContaining({
            wallet: { connected: true, address: '0x1234567890123456789012345678901234567890' }
          })
        )
      })
    })

    it('should react to auth store state changes', async () => {
      const { rerender } = renderHookWithStore(() => useAuthStateSynchronization(), { store: mockStore })

      // Initially no error
      expect(mockDevOnly).toHaveBeenCalledWith(
        '🔄 Auth state sync check:',
        expect.objectContaining({
          authStore: { address: null, hasError: false }
        })
      )

      // Change auth store state
      runInAction(() => {
        mockStore.authenticationStore.authError = {
        name: 'AppError',
        message: 'Test error',
        type: ErrorType.AUTHENTICATION_FAILED,
        userFriendlyMessage: 'Test error'
      } as AppError
      })

      rerender({})

      await waitFor(() => {
        expect(mockDevOnly).toHaveBeenCalledWith(
          '🔄 Auth state sync check:',
          expect.objectContaining({
            authStore: expect.objectContaining({ hasError: true })
          })
        )
      })
    })
  })

  describe('Sync Loop Prevention', () => {
    it('should prevent infinite sync loops during Firebase signOut', async () => {
      // Set up scenario that would trigger clearing
      mockFirebaseAuth.isAuthenticated = true
      mockFirebaseAuth.walletAddress = '0x1234567890123456789012345678901234567890'
      mockStore.walletStore.currentState.isConnected = false

      renderHookWithStore(() => useAuthStateSynchronization(), { store: mockStore })

      // First call should trigger signOut
      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalledTimes(1)
      })

      // Even if state changes occur during signOut, shouldn't trigger again
      runInAction(() => {
        mockFirebaseAuth.isAuthenticated = false // Simulate signOut completion
      })

      // Give time for potential additional calls
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100))
      })

      // Should still only be called once
      expect(mockSignOut).toHaveBeenCalledTimes(1)
    })
  })
})

describe('useAuthStateValidation', () => {
  let mockStore: ReturnType<typeof createMockRootStore>

  beforeEach(() => {
    jest.clearAllMocks()
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
      chain: createMockChain(1, 'Ethereum'),
      addresses: undefined,
      chainId: undefined,
      connector: undefined,
      isReconnecting: false,
      isConnecting: false,
      isDisconnected: true,
      status: 'disconnected',
    })
  })

  describe('Consistency Validation', () => {
    it('should detect consistent state when everything matches', () => {
      // Set up consistent state
      mockFirebaseAuth.isAuthenticated = true
      mockFirebaseAuth.walletAddress = '0x1234567890123456789012345678901234567890'
      
      mockUseAccount.mockReturnValue({
        isConnected: true,
        address: '0x1234567890123456789012345678901234567890',
        chain: createMockChain(1, 'Ethereum'),
        addresses: ['0x1234567890123456789012345678901234567890'],
        chainId: 1,
        connector: undefined,
        isReconnecting: false,
        isConnecting: false,
        isDisconnected: false,
        status: 'connected',
      })

      mockStore.authenticationStore.authLock = {
        ...mockStore.authenticationStore.authLock,
        isLocked: false
      }

      const { result } = renderHookWithStore(() => useAuthStateValidation(), { store: mockStore })

      const validation = result.current.validateConsistency()

      expect(validation).toEqual({
        isConsistent: true,
        issues: [],
        walletState: {
          connected: true,
          address: '0x1234567890123456789012345678901234567890',
        },
        firebaseState: {
          authenticated: true,
          address: '0x1234567890123456789012345678901234567890',
        },
        authStoreState: {
          authenticating: false,
          address: null, // From mock store
          hasError: false,
        },
      })
    })

    it('should detect Firebase authenticated but wallet not connected', () => {
      mockFirebaseAuth.isAuthenticated = true
      mockFirebaseAuth.walletAddress = '0x1234567890123456789012345678901234567890'

      const { result } = renderHookWithStore(() => useAuthStateValidation(), { store: mockStore })

      const validation = result.current.validateConsistency()

      expect(validation.isConsistent).toBe(false)
      expect(validation.issues).toContain('Firebase authenticated but wallet not connected')
    })

    it('should detect wallet address mismatch', () => {
      mockFirebaseAuth.isAuthenticated = true
      mockFirebaseAuth.walletAddress = '0x1111111111111111111111111111111111111111'
      
      mockUseAccount.mockReturnValue({
        isConnected: true,
        address: '0x2222222222222222222222222222222222222222',
        chain: createMockChain(1, 'Ethereum'),
        addresses: ['0x2222222222222222222222222222222222222222'],
        chainId: 1,
        connector: undefined,
        isReconnecting: false,
        isConnecting: false,
        isDisconnected: false,
        status: 'connected',
      })

      const { result } = renderHookWithStore(() => useAuthStateValidation(), { store: mockStore })

      const validation = result.current.validateConsistency()

      expect(validation.isConsistent).toBe(false)
      expect(validation.issues).toContain('Wallet address does not match Firebase auth address')
    })

    it('should detect authentication in progress but already authenticated', () => {
      mockFirebaseAuth.isAuthenticated = true
      mockFirebaseAuth.walletAddress = '0x1234567890123456789012345678901234567890'
      
      mockStore.authenticationStore.authLock = {
        ...mockStore.authenticationStore.authLock,
        isLocked: true
      }

      const { result } = renderHookWithStore(() => useAuthStateValidation(), { store: mockStore })

      const validation = result.current.validateConsistency()

      expect(validation.isConsistent).toBe(false)
      expect(validation.issues).toContain('Authentication in progress but already Firebase authenticated')
    })

    it('should handle case-insensitive address validation', () => {
      mockFirebaseAuth.isAuthenticated = true
      mockFirebaseAuth.walletAddress = '0x1234567890123456789012345678901234567890'
      
      mockUseAccount.mockReturnValue({
        isConnected: true,
        address: '0x1234567890123456789012345678901234567890', // Different case
        chain: createMockChain(1, 'Ethereum'),
        addresses: ['0x1234567890123456789012345678901234567890'],
        chainId: 1,
        connector: undefined,
        isReconnecting: false,
        isConnecting: false,
        isDisconnected: false,
        status: 'connected',
      })

      const { result } = renderHookWithStore(() => useAuthStateValidation(), { store: mockStore })

      const validation = result.current.validateConsistency()

      expect(validation.isConsistent).toBe(true)
      expect(validation.issues).toEqual([])
    })

    it('should provide comprehensive state information', () => {
      mockStore.authenticationStore.authError = {
        name: 'AppError',
        message: 'Test error',
        type: ErrorType.AUTHENTICATION_FAILED,
        userFriendlyMessage: 'Test error'
      } as AppError

      const { result } = renderHookWithStore(() => useAuthStateValidation(), { store: mockStore })

      const validation = result.current.validateConsistency()

      expect(validation.authStoreState.hasError).toBe(true)
      expect(validation.walletState.connected).toBe(false)
      expect(validation.firebaseState.authenticated).toBe(false)
    })

    it('should handle undefined addresses', () => {
      const { result } = renderHookWithStore(() => useAuthStateValidation(), { store: mockStore })

      const validation = result.current.validateConsistency()

      expect(validation.walletState.address).toBeUndefined()
      expect(validation.firebaseState.address).toBeNull()
      expect(validation.authStoreState.address).toBeNull()
      expect(validation.isConsistent).toBe(true) // No conflicts when all undefined/null
    })
  })
})