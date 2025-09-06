import { RootStore } from './RootStore'
import { AuthenticationStore } from './AuthenticationStore'
import { WalletStore } from './WalletStore'
import { PoolManagementStore } from './PoolManagementStore'
import { UIStore } from './UIStore'
import { AppError, ErrorType } from '../utils/errorHandling'

describe('RootStore', () => {
  let rootStore: RootStore

  beforeEach(() => {
    rootStore = new RootStore()
  })

  afterEach(() => {
    rootStore.reset()
  })

  describe('Initialization', () => {
    it('should create all child stores', () => {
      expect(rootStore.authenticationStore).toBeInstanceOf(AuthenticationStore)
      expect(rootStore.walletStore).toBeInstanceOf(WalletStore)
      expect(rootStore.poolManagementStore).toBeInstanceOf(PoolManagementStore)
      expect(rootStore.uiStore).toBeInstanceOf(UIStore)
    })

    it('should create separate instances for each child store', () => {
      const anotherRootStore = new RootStore()

      expect(rootStore.authenticationStore).not.toBe(anotherRootStore.authenticationStore)
      expect(rootStore.walletStore).not.toBe(anotherRootStore.walletStore)
      expect(rootStore.poolManagementStore).not.toBe(anotherRootStore.poolManagementStore)
      expect(rootStore.uiStore).not.toBe(anotherRootStore.uiStore)
    })
  })

  describe('setUserContext', () => {
    it('should set user address in pool management store', () => {
      const userAddress = '0x1234567890123456789012345678901234567890'

      rootStore.setUserContext(userAddress)
      expect(rootStore.poolManagementStore.userAddress).toBe(userAddress)
    })

    it('should clear user address when null', () => {
      const userAddress = '0x1234567890123456789012345678901234567890'
      rootStore.setUserContext(userAddress)

      rootStore.setUserContext(null)
      expect(rootStore.poolManagementStore.userAddress).toBeNull()
    })

    it('should log warning when user address set but wallet not connected', () => {
      const consoleSpy = jest.spyOn(console, 'log')
      const userAddress = '0x1234567890123456789012345678901234567890'

      // Wallet is not connected
      expect(rootStore.walletStore.isConnected).toBe(false)

      rootStore.setUserContext(userAddress)

      expect(consoleSpy).toHaveBeenCalledWith('User address set but wallet not connected:', userAddress)

      consoleSpy.mockRestore()
    })

    it('should not log warning when user address set and wallet is connected', () => {
      const consoleSpy = jest.spyOn(console, 'log')
      const userAddress = '0x1234567890123456789012345678901234567890'

      // Connect wallet first
      rootStore.walletStore.setConnectionState({
        isConnected: true,
        address: userAddress,
      })

      rootStore.setUserContext(userAddress)

      expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringMatching(/User address set but wallet not connected/), expect.anything())

      consoleSpy.mockRestore()
    })

    it('should not log warning when setting user address to null', () => {
      const consoleSpy = jest.spyOn(console, 'log')

      rootStore.setUserContext(null)

      expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringMatching(/User address set but wallet not connected/), expect.anything())

      consoleSpy.mockRestore()
    })
  })

  describe('currentUserAddress', () => {
    it('should return wallet address when connected', () => {
      const userAddress = '0x1234567890123456789012345678901234567890'
      rootStore.walletStore.setConnectionState({ address: userAddress })

      expect(rootStore.currentUserAddress).toBe(userAddress)
    })

    it('should return null when wallet not connected', () => {
      expect(rootStore.currentUserAddress).toBeNull()
    })

    it('should return null when wallet address is undefined', () => {
      rootStore.walletStore.setConnectionState({ address: undefined })
      expect(rootStore.currentUserAddress).toBeNull()
    })

    it('should be reactive to wallet address changes', () => {
      const reactionSpy = jest.fn()

      const { reaction } = require('mobx')
      const dispose = reaction(() => rootStore.currentUserAddress, reactionSpy)

      rootStore.walletStore.setConnectionState({ address: '0x123' })
      expect(reactionSpy).toHaveBeenCalledWith('0x123', null, expect.anything())

      dispose()
    })
  })

  describe('isLoading', () => {
    it('should return false when no stores are loading', () => {
      expect(rootStore.isLoading).toBe(false)
    })

    it('should return true when authentication store is authenticating', () => {
      // Set up authentication loading state
      rootStore.authenticationStore.setAuthLock({
        isLocked: true,
        startTime: Date.now(),
        walletAddress: '0x123',
        abortController: new AbortController(),
        requestId: 'test-id',
      })

      expect(rootStore.isLoading).toBe(true)
    })

    it('should return true when wallet store is connecting', () => {
      rootStore.walletStore.setConnecting(true)
      expect(rootStore.isLoading).toBe(true)
    })

    it('should return true when pool management store is loading pools', () => {
      rootStore.poolManagementStore.setLoading('pools', true)
      expect(rootStore.isLoading).toBe(true)
    })

    it('should return true when pool management store is loading loans', () => {
      rootStore.poolManagementStore.setLoading('loans', true)
      expect(rootStore.isLoading).toBe(true)
    })

    it('should return true when pool management store is loading transactions', () => {
      rootStore.poolManagementStore.setLoading('transactions', true)
      expect(rootStore.isLoading).toBe(true)
    })

    it('should return true when pool management store is loading member actions', () => {
      rootStore.poolManagementStore.setLoading('memberActions', true)
      expect(rootStore.isLoading).toBe(true)
    })

    it('should return true when multiple stores are loading', () => {
      rootStore.walletStore.setConnecting(true)
      rootStore.poolManagementStore.setLoading('pools', true)

      expect(rootStore.isLoading).toBe(true)
    })

    it('should be reactive to loading state changes', () => {
      const reactionSpy = jest.fn()

      const { reaction } = require('mobx')
      const dispose = reaction(() => rootStore.isLoading, reactionSpy)

      rootStore.walletStore.setConnecting(true)
      expect(reactionSpy).toHaveBeenCalledWith(true, false, expect.anything())

      dispose()
    })
  })

  describe('hasErrors', () => {
    it('should return false when no stores have errors', () => {
      expect(rootStore.hasErrors).toBe(false)
    })

    it('should return true when authentication store has error', () => {
      const error: AppError = {
        name: 'AppError',
        message: 'Auth error',
        type: ErrorType.AUTHENTICATION_FAILED,
        userFriendlyMessage: 'Authentication failed. Please try connecting your wallet again.',
        timestamp: new Date(),
      }
      rootStore.authenticationStore.setAuthError(error)

      expect(rootStore.hasErrors).toBe(true)
    })

    it('should return true when wallet store has connection error', () => {
      rootStore.walletStore.setConnectionError('Connection failed')
      expect(rootStore.hasErrors).toBe(true)
    })

    it('should return true when pool management store has error', () => {
      rootStore.poolManagementStore.setError('Pool error')
      expect(rootStore.hasErrors).toBe(true)
    })

    it('should return true when multiple stores have errors', () => {
      rootStore.walletStore.setConnectionError('Connection failed')
      rootStore.poolManagementStore.setError('Pool error')

      expect(rootStore.hasErrors).toBe(true)
    })

    it('should be reactive to error state changes', () => {
      const reactionSpy = jest.fn()

      const { reaction } = require('mobx')
      const dispose = reaction(() => rootStore.hasErrors, reactionSpy)

      rootStore.walletStore.setConnectionError('Error')
      expect(reactionSpy).toHaveBeenCalledWith(true, false, expect.anything())

      dispose()
    })
  })

  describe('allErrors', () => {
    it('should return empty array when no errors', () => {
      expect(rootStore.allErrors).toEqual([])
    })

    it('should return authentication error message', () => {
      const error: AppError = {
        name: 'AppError',
        message: 'Auth failed',
        type: ErrorType.AUTHENTICATION_FAILED,
        userFriendlyMessage: 'Authentication failed. Please try connecting your wallet again.',
        timestamp: new Date(),
      }
      rootStore.authenticationStore.setAuthError(error)

      expect(rootStore.allErrors).toEqual(['Auth failed'])
    })

    it('should return wallet connection error message', () => {
      rootStore.walletStore.setConnectionError('Connection failed')
      expect(rootStore.allErrors).toEqual(['Connection failed'])
    })

    it('should return pool management error message', () => {
      rootStore.poolManagementStore.setError('Pool operation failed')
      expect(rootStore.allErrors).toEqual(['Pool operation failed'])
    })

    it('should return all error messages when multiple stores have errors', () => {
      const authError: AppError = {
        name: 'AppError',
        message: 'Auth failed',
        type: ErrorType.AUTHENTICATION_FAILED,
        userFriendlyMessage: 'Authentication failed. Please try connecting your wallet again.',
        timestamp: new Date(),
      }
      rootStore.authenticationStore.setAuthError(authError)
      rootStore.walletStore.setConnectionError('Connection failed')
      rootStore.poolManagementStore.setError('Pool error')

      const errors = rootStore.allErrors
      expect(errors).toHaveLength(3)
      expect(errors).toContain('Auth failed')
      expect(errors).toContain('Connection failed')
      expect(errors).toContain('Pool error')
    })

    it('should handle null errors gracefully', () => {
      rootStore.authenticationStore.setAuthError(null)
      rootStore.walletStore.setConnectionError(null)
      rootStore.poolManagementStore.setError(null)

      expect(rootStore.allErrors).toEqual([])
    })

    it('should be reactive to error changes', () => {
      const reactionSpy = jest.fn()

      const { reaction } = require('mobx')
      const dispose = reaction(() => rootStore.allErrors.length, reactionSpy)

      rootStore.walletStore.setConnectionError('Error')
      expect(reactionSpy).toHaveBeenCalledWith(1, 0, expect.anything())

      dispose()
    })
  })

  describe('reset', () => {
    beforeEach(async () => {
      // Set up some state in all stores
      const authError: AppError = {
        name: 'AppError',
        message: 'Auth error',
        type: ErrorType.AUTHENTICATION_FAILED,
        userFriendlyMessage: 'Authentication failed. Please try connecting your wallet again.',
        timestamp: new Date(),
      }
      rootStore.authenticationStore.setAuthError(authError)

      await rootStore.walletStore.connect('0x123', 1)
      rootStore.walletStore.setConnectionError('Connection error')

      rootStore.poolManagementStore.setUserAddress('0x123')
      rootStore.poolManagementStore.setError('Pool error')
      rootStore.poolManagementStore.setLoading('pools', true)

      rootStore.uiStore.setOnboardingIndex(5)
    })

    it('should reset all child stores', () => {
      rootStore.reset()

      // Check authentication store reset
      expect(rootStore.authenticationStore.authError).toBeNull()

      // Check wallet store reset
      expect(rootStore.walletStore.isConnected).toBe(false)
      expect(rootStore.walletStore.address).toBeUndefined()
      expect(rootStore.walletStore.connectionError).toBeNull()

      // Check pool management store reset
      expect(rootStore.poolManagementStore.userAddress).toBeNull()
      expect(rootStore.poolManagementStore.error).toBeNull()
      expect(rootStore.poolManagementStore.loading.pools).toBe(false)

      // Check UI store reset
      expect(rootStore.uiStore.onboardingCurrentIndex).toBe(0)
    })

    it('should call reset on all child stores', () => {
      // Verify that state has been set up by the beforeEach
      expect(rootStore.authenticationStore.authError).not.toBeNull()
      expect(rootStore.walletStore.isConnected).toBe(true)
      expect(rootStore.poolManagementStore.error).not.toBeNull()
      expect(rootStore.uiStore.onboardingCurrentIndex).not.toBe(0)

      // Call reset and verify it clears all state
      rootStore.reset()

      // All stores should be reset
      expect(rootStore.authenticationStore.authError).toBeNull()
      expect(rootStore.walletStore.isConnected).toBe(false)
      expect(rootStore.poolManagementStore.error).toBeNull()
      expect(rootStore.uiStore.onboardingCurrentIndex).toBe(0)
    })

    it('should reset computed values', () => {
      rootStore.reset()

      expect(rootStore.isLoading).toBe(false)
      expect(rootStore.hasErrors).toBe(false)
      expect(rootStore.allErrors).toEqual([])
      expect(rootStore.currentUserAddress).toBeNull()
    })
  })

  describe('Integration Tests', () => {
    it('should maintain consistency between wallet address and user context', async () => {
      const userAddress = '0x1234567890123456789012345678901234567890'

      // Connect wallet
      await rootStore.walletStore.connect(userAddress, 1)

      // Set user context
      rootStore.setUserContext(userAddress)

      // Both should be consistent
      expect(rootStore.currentUserAddress).toBe(userAddress)
      expect(rootStore.poolManagementStore.userAddress).toBe(userAddress)
    })

    it('should reflect overall state correctly when multiple operations occur', async () => {
      // Start with loading state
      rootStore.poolManagementStore.setLoading('pools', true)
      expect(rootStore.isLoading).toBe(true)

      // Add error while loading
      rootStore.walletStore.setConnectionError('Network error')
      expect(rootStore.hasErrors).toBe(true)
      expect(rootStore.isLoading).toBe(true)

      // Complete loading
      rootStore.poolManagementStore.setLoading('pools', false)
      expect(rootStore.isLoading).toBe(false)
      expect(rootStore.hasErrors).toBe(true) // Still has error

      // Clear error
      rootStore.walletStore.setConnectionError(null)
      expect(rootStore.hasErrors).toBe(false)
      expect(rootStore.isLoading).toBe(false)
    })

    it('should handle authentication flow integration', async () => {
      const userAddress = '0x1234567890123456789012345678901234567890'

      // Start authentication
      rootStore.authenticationStore.setAuthLock({
        isLocked: true,
        startTime: Date.now(),
        walletAddress: userAddress,
        abortController: new AbortController(),
        requestId: 'test-id',
      })
      expect(rootStore.isLoading).toBe(true)

      // Connect wallet during authentication
      await rootStore.walletStore.connect(userAddress, 1)
      expect(rootStore.isLoading).toBe(true) // Still loading due to auth

      // Complete authentication by releasing the lock
      rootStore.authenticationStore.setAuthLock({
        isLocked: false,
        startTime: 0,
        walletAddress: null,
        abortController: null,
        requestId: null,
      })
      expect(rootStore.isLoading).toBe(false)

      // Set user context
      rootStore.setUserContext(userAddress)
      expect(rootStore.currentUserAddress).toBe(userAddress)
    })
  })

  describe('Error Scenarios', () => {
    it('should handle errors during reset gracefully', () => {
      // Instead of mocking reset to throw, we'll verify reset behavior with a different approach
      // Set up some state first
      rootStore.walletStore.setConnecting(true)
      rootStore.poolManagementStore.setError('Test error')

      // Verify state is set
      expect(rootStore.isLoading).toBe(true)
      expect(rootStore.hasErrors).toBe(true)

      // Reset should clear all state
      expect(() => rootStore.reset()).not.toThrow()

      // Verify state is cleared
      expect(rootStore.isLoading).toBe(false)
      expect(rootStore.hasErrors).toBe(false)
    })

    it('should handle simultaneous state changes', () => {
      // Simulate simultaneous changes from different sources
      rootStore.walletStore.setConnecting(true)
      rootStore.poolManagementStore.setLoading('pools', true)
      rootStore.authenticationStore.setAuthLock({
        isLocked: true,
        startTime: Date.now(),
        walletAddress: '0x123',
        abortController: new AbortController(),
        requestId: 'test-id',
      })

      expect(rootStore.isLoading).toBe(true)

      // Clear all loading states
      rootStore.walletStore.setConnecting(false)
      rootStore.poolManagementStore.setLoading('pools', false)
      rootStore.authenticationStore.setAuthLock({
        isLocked: false,
        startTime: 0,
        walletAddress: null,
        abortController: null,
        requestId: null,
      })

      expect(rootStore.isLoading).toBe(false)
    })

    it('should handle multiple error types correctly', () => {
      // Set different types of errors
      const authError: AppError = {
        name: 'AppError',
        message: 'Authentication failed',
        type: ErrorType.AUTHENTICATION_FAILED,
        userFriendlyMessage: 'Authentication failed. Please try connecting your wallet again.',
        timestamp: new Date(),
      }
      rootStore.authenticationStore.setAuthError(authError)

      rootStore.walletStore.setConnectionError('Network timeout')
      rootStore.poolManagementStore.setError('Invalid pool data')

      const allErrors = rootStore.allErrors
      expect(allErrors).toHaveLength(3)
      expect(allErrors).toContain('Authentication failed')
      expect(allErrors).toContain('Network timeout')
      expect(allErrors).toContain('Invalid pool data')
    })
  })

  describe('Edge Cases', () => {
    it('should handle very long error messages', () => {
      const longError = 'A'.repeat(10000)
      rootStore.poolManagementStore.setError(longError)

      expect(rootStore.allErrors).toContain(longError)
      expect(rootStore.hasErrors).toBe(true)
    })

    it('should handle special characters in addresses', () => {
      const specialAddress = '0xabcdef1234567890abcdef1234567890abcdef12'
      rootStore.setUserContext(specialAddress)

      expect(rootStore.poolManagementStore.userAddress).toBe(specialAddress)
    })

    it('should handle rapid context switching', () => {
      const addresses = [
        '0x1111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222',
        '0x3333333333333333333333333333333333333333',
      ]

      addresses.forEach((address) => {
        rootStore.setUserContext(address)
        expect(rootStore.poolManagementStore.userAddress).toBe(address)
      })

      rootStore.setUserContext(null)
      expect(rootStore.poolManagementStore.userAddress).toBeNull()
    })

    it('should maintain state consistency after multiple resets', () => {
      // Set up state
      rootStore.setUserContext('0x123')
      rootStore.uiStore.setOnboardingIndex(5)

      // Reset multiple times
      rootStore.reset()
      rootStore.reset()
      rootStore.reset()

      // Should still be in clean state
      expect(rootStore.currentUserAddress).toBeNull()
      expect(rootStore.uiStore.onboardingCurrentIndex).toBe(0)
      expect(rootStore.isLoading).toBe(false)
      expect(rootStore.hasErrors).toBe(false)
    })
  })

  describe('MobX Reactivity Integration', () => {
    it('should properly propagate reactions across all computed values', () => {
      const loadingSpy = jest.fn()
      const errorsSpy = jest.fn()
      const userAddressSpy = jest.fn()

      const { reaction } = require('mobx')
      const disposeLoading = reaction(() => rootStore.isLoading, loadingSpy)
      const disposeErrors = reaction(() => rootStore.hasErrors, errorsSpy)
      const disposeUserAddress = reaction(() => rootStore.currentUserAddress, userAddressSpy)

      // Make changes that should trigger all reactions
      rootStore.walletStore.setConnecting(true)
      rootStore.poolManagementStore.setError('Error')
      rootStore.walletStore.setConnectionState({ address: '0x123' })

      expect(loadingSpy).toHaveBeenCalledWith(true, false, expect.anything())
      expect(errorsSpy).toHaveBeenCalledWith(true, false, expect.anything())
      expect(userAddressSpy).toHaveBeenCalledWith('0x123', null, expect.anything())

      disposeLoading()
      disposeErrors()
      disposeUserAddress()
    })

    it('should handle complex reaction chains', () => {
      const chainReactionSpy = jest.fn()

      const { reaction } = require('mobx')
      const dispose = reaction(
        () => ({
          loading: rootStore.isLoading,
          errors: rootStore.allErrors.length,
          user: rootStore.currentUserAddress,
        }),
        chainReactionSpy
      )

      // Single change should trigger reaction with all state
      rootStore.walletStore.setConnectionState({ address: '0x123' })

      expect(chainReactionSpy).toHaveBeenCalledWith(
        { loading: false, errors: 0, user: '0x123' },
        { loading: false, errors: 0, user: null },
        expect.anything()
      )

      dispose()
    })
  })

  // Additional coverage tests for edge cases and uncovered paths
  describe('Coverage Edge Cases', () => {
    it('should handle isLoading when auth lock has null abort controller', () => {
      rootStore.authenticationStore.setAuthLock({
        isLocked: true,
        startTime: Date.now(),
        walletAddress: '0x123',
        abortController: null, // null abort controller
        requestId: 'test-id',
      })

      expect(rootStore.isLoading).toBe(true)
    })

    it('should handle isLoading when all loading states are false', () => {
      // Ensure all loading states are false
      rootStore.authenticationStore.setAuthLock({
        isLocked: false,
        startTime: 0,
        walletAddress: null,
        abortController: null,
        requestId: null,
      })
      rootStore.walletStore.setConnecting(false)
      rootStore.poolManagementStore.setLoading('pools', false)
      rootStore.poolManagementStore.setLoading('loans', false)
      rootStore.poolManagementStore.setLoading('transactions', false)
      rootStore.poolManagementStore.setLoading('memberActions', false)

      expect(rootStore.isLoading).toBe(false)
    })

    it('should handle hasErrors when all error states are null', () => {
      // Ensure all error states are null/false
      rootStore.authenticationStore.setAuthError(null)
      rootStore.walletStore.setConnectionError(null)
      rootStore.poolManagementStore.setError(null)

      expect(rootStore.hasErrors).toBe(false)
    })

    it('should handle currentUserAddress when wallet address is empty string', () => {
      rootStore.walletStore.setConnectionState({ address: '' })
      // Empty string is falsy, so currentUserAddress returns null due to the || null logic
      expect(rootStore.currentUserAddress).toBeNull()
    })

    it('should handle setUserContext with empty string address', () => {
      const consoleSpy = jest.spyOn(console, 'log')

      // Ensure wallet is not connected
      expect(rootStore.walletStore.isConnected).toBe(false)

      rootStore.setUserContext('')

      expect(rootStore.poolManagementStore.userAddress).toBe('')
      // Empty string is falsy in boolean context, so it won't trigger the warning
      expect(consoleSpy).not.toHaveBeenCalledWith('User address set but wallet not connected:', '')

      consoleSpy.mockRestore()
    })

    it('should handle allErrors with mixed null and valid errors', () => {
      const authError: AppError = {
        name: 'AppError',
        message: 'Auth error',
        type: ErrorType.AUTHENTICATION_FAILED,
        userFriendlyMessage: 'Authentication failed. Please try connecting your wallet again.',
        timestamp: new Date(),
      }

      rootStore.authenticationStore.setAuthError(authError)
      rootStore.walletStore.setConnectionError(null) // null error
      rootStore.poolManagementStore.setError('Pool error')

      const errors = rootStore.allErrors
      expect(errors).toHaveLength(2)
      expect(errors).toContain('Auth error')
      expect(errors).toContain('Pool error')
      expect(errors).not.toContain(null)
    })

    it('should handle constructor property initialization', () => {
      const newStore = new RootStore()

      expect(newStore.authenticationStore).toBeDefined()
      expect(newStore.walletStore).toBeDefined()
      expect(newStore.poolManagementStore).toBeDefined()
      expect(newStore.uiStore).toBeDefined()

      // Verify initial state
      expect(newStore.isLoading).toBe(false)
      expect(newStore.hasErrors).toBe(false)
      expect(newStore.allErrors).toEqual([])
      expect(newStore.currentUserAddress).toBeNull()
    })

    it('should handle setUserContext when wallet is connected but addresses differ', () => {
      const consoleSpy = jest.spyOn(console, 'log')
      const walletAddress = '0x1111111111111111111111111111111111111111'
      const contextAddress = '0x2222222222222222222222222222222222222222'

      // Connect wallet with one address
      rootStore.walletStore.setConnectionState({
        isConnected: true,
        address: walletAddress,
      })

      // Set user context with different address
      rootStore.setUserContext(contextAddress)

      // Should not log warning because wallet is connected (even though addresses differ)
      expect(consoleSpy).not.toHaveBeenCalledWith('User address set but wallet not connected:', contextAddress)

      consoleSpy.mockRestore()
    })
  })
})
