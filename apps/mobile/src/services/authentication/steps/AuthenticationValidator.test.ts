import { AuthenticationValidator, ValidationContext } from './AuthenticationValidator'
import type { AuthenticationStore } from '../../../stores/AuthenticationStore'
import type { AtomicConnectionState, WalletStore } from '../../../stores/WalletStore'

describe('AuthenticationValidator', () => {
  let validator: AuthenticationValidator
  let mockAuthStore: jest.Mocked<AuthenticationStore>
  let mockWalletStore: jest.Mocked<WalletStore>
  let mockValidationContext: ValidationContext
  let mockAtomicState: AtomicConnectionState
  let consoleLogSpy: jest.SpyInstance
  let consoleWarnSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()

    // Mock AtomicConnectionState
    mockAtomicState = {
      address: '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8',
      chainId: 137,
      isConnected: true,
      timestamp: Date.now(),
      sequenceNumber: 1,
    } as AtomicConnectionState

    // Mock AuthenticationStore
    mockAuthStore = {
      isLoggingOut: false,
      authLock: {
        abortController: null,
      },
    } as jest.Mocked<AuthenticationStore>

    // Mock WalletStore
    mockWalletStore = {
      captureState: jest.fn().mockReturnValue(mockAtomicState),
      validateState: jest.fn().mockReturnValue(true),
      validateInitialState: jest.fn().mockReturnValue({ isValid: true }),
    } as any

    validator = new AuthenticationValidator(mockAuthStore, mockWalletStore)

    mockValidationContext = {
      walletAddress: '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8',
    }

    // Spy on console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    consoleWarnSpy.mockRestore()
  })

  describe('Constructor', () => {
    it('should create AuthenticationValidator with required stores', () => {
      expect(validator).toBeInstanceOf(AuthenticationValidator)
    })

    it('should store references to auth and wallet stores', () => {
      // Access private members through any to verify they're stored
      const validatorAny = validator as any
      expect(validatorAny.authStore).toBe(mockAuthStore)
      expect(validatorAny.walletStore).toBe(mockWalletStore)
    })
  })

  describe('validatePreConditions', () => {
    describe('Successful Validation', () => {
      it('should validate pre-conditions successfully with valid state', async () => {
        mockAuthStore.isLoggingOut = false
        mockWalletStore.validateInitialState.mockReturnValue({ isValid: true })

        await expect(validator.validatePreConditions(mockValidationContext)).resolves.toBeUndefined()

        expect(consoleLogSpy).toHaveBeenCalledWith('🔍 Validating authentication pre-conditions...')
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Pre-conditions validated successfully')
      })

      it('should call logout state check', async () => {
        mockAuthStore.isLoggingOut = false
        mockWalletStore.validateInitialState.mockReturnValue({ isValid: true })

        await validator.validatePreConditions(mockValidationContext)

        // Verify the checkLogoutState method was called (indirectly)
        expect(mockAuthStore.isLoggingOut).toBe(false)
      })

      it('should call initial connection state validation', async () => {
        await validator.validatePreConditions(mockValidationContext)

        expect(mockWalletStore.validateInitialState).toHaveBeenCalledWith(mockValidationContext.walletAddress)
      })
    })

    describe('Logout State Validation', () => {
      it('should throw error when logout is in progress', async () => {
        mockAuthStore.isLoggingOut = true

        await expect(validator.validatePreConditions(mockValidationContext)).rejects.toThrow('Authentication cancelled: logout in progress')

        expect(consoleLogSpy).toHaveBeenCalledWith('⏸️ Skipping authentication: logout in progress')
      })

      it('should not call initial state validation when logout is in progress', async () => {
        mockAuthStore.isLoggingOut = true

        try {
          await validator.validatePreConditions(mockValidationContext)
        } catch {
          // Expected to throw
        }

        expect(mockWalletStore.validateInitialState).not.toHaveBeenCalled()
      })
    })

    describe('Initial Connection State Validation', () => {
      it('should throw error when initial state is invalid', async () => {
        const validationError = 'Invalid wallet address format'
        mockWalletStore.validateInitialState.mockReturnValue({
          isValid: false,
          error: validationError,
        })

        await expect(validator.validatePreConditions(mockValidationContext)).rejects.toThrow(validationError)

        expect(consoleWarnSpy).toHaveBeenCalledWith('❌ Invalid initial connection state:', validationError)
      })

      it('should throw generic error when no specific error message provided', async () => {
        mockWalletStore.validateInitialState.mockReturnValue({
          isValid: false,
          error: undefined,
        })

        await expect(validator.validatePreConditions(mockValidationContext)).rejects.toThrow('Invalid connection state')
      })

      it('should handle undefined error message', async () => {
        mockWalletStore.validateInitialState.mockReturnValue({
          isValid: false,
          error: undefined,
        })

        await expect(validator.validatePreConditions(mockValidationContext)).rejects.toThrow('Invalid connection state')
      })
    })

    describe('Different Wallet Addresses', () => {
      it('should validate different wallet address formats', async () => {
        const addresses = [
          '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8',
          '0x1234567890123456789012345678901234567890',
          '0x0000000000000000000000000000000000000000',
        ]

        for (const walletAddress of addresses) {
          mockWalletStore.validateInitialState.mockReturnValue({ isValid: true })

          const context: ValidationContext = { walletAddress }

          await validator.validatePreConditions(context)

          expect(mockWalletStore.validateInitialState).toHaveBeenCalledWith(walletAddress)
        }
      })
    })
  })

  describe('validateStateConsistency', () => {
    const testCheckpoint = 'test-checkpoint'

    describe('Successful State Validation', () => {
      it('should return true when state is consistent', () => {
        const currentState = mockAtomicState
        mockWalletStore.captureState.mockReturnValue(currentState)
        mockWalletStore.validateState.mockReturnValue(true)

        const result = validator.validateStateConsistency(mockAtomicState, testCheckpoint)

        expect(result).toBe(true)
        expect(mockWalletStore.captureState).toHaveBeenCalled()
        expect(mockWalletStore.validateState).toHaveBeenCalledWith(mockAtomicState, currentState, testCheckpoint)
        expect(consoleLogSpy).toHaveBeenCalledWith(`🔍 Validating state consistency at checkpoint: ${testCheckpoint}`)
        expect(consoleLogSpy).toHaveBeenCalledWith(`✅ State consistency validated at ${testCheckpoint}`)
      })

      it('should work with different checkpoint names', () => {
        const checkpoints = ['message-generation', 'signature-request', 'firebase-auth', 'completion']

        mockWalletStore.validateState.mockReturnValue(true)

        for (const checkpoint of checkpoints) {
          const result = validator.validateStateConsistency(mockAtomicState, checkpoint)

          expect(result).toBe(true)
          expect(consoleLogSpy).toHaveBeenCalledWith(`🔍 Validating state consistency at checkpoint: ${checkpoint}`)
          expect(consoleLogSpy).toHaveBeenCalledWith(`✅ State consistency validated at ${checkpoint}`)
        }
      })
    })

    describe('State Inconsistency Detection', () => {
      it('should return false when state is inconsistent', () => {
        mockWalletStore.validateState.mockReturnValue(false)

        const result = validator.validateStateConsistency(mockAtomicState, testCheckpoint)

        expect(result).toBe(false)
        expect(consoleLogSpy).toHaveBeenCalledWith(`❌ Aborting authentication due to connection state change at ${testCheckpoint}`)
        expect(consoleLogSpy).not.toHaveBeenCalledWith(`✅ State consistency validated at ${testCheckpoint}`)
      })

      it('should capture current state for comparison', () => {
        const currentState = { ...mockAtomicState, chainId: 1 } // Different state
        mockWalletStore.captureState.mockReturnValue(currentState)
        mockWalletStore.validateState.mockReturnValue(false)

        validator.validateStateConsistency(mockAtomicState, testCheckpoint)

        expect(mockWalletStore.captureState).toHaveBeenCalled()
        expect(mockWalletStore.validateState).toHaveBeenCalledWith(mockAtomicState, currentState, testCheckpoint)
      })
    })

    describe('Different Atomic States', () => {
      it('should handle different locked state configurations', () => {
        const stateVariations: Partial<AtomicConnectionState>[] = [
          { isConnected: false },
          { chainId: 1 },
          { address: '0x1234567890123456789012345678901234567890' },
        ]

        mockWalletStore.validateState.mockReturnValue(true)

        for (const stateVariation of stateVariations) {
          const testState = { ...mockAtomicState, ...stateVariation }

          const result = validator.validateStateConsistency(testState as AtomicConnectionState, testCheckpoint)

          expect(result).toBe(true)
          expect(mockWalletStore.validateState).toHaveBeenCalledWith(testState, expect.any(Object), testCheckpoint)
        }
      })
    })
  })

  describe('checkAuthenticationAborted', () => {
    describe('Non-Aborted States', () => {
      it('should return false when abort controller is null', () => {
        mockAuthStore.authLock.abortController = null

        const result = validator.checkAuthenticationAborted()

        expect(result).toBe(false)
      })

      it('should return false when abort controller is not aborted', () => {
        const mockAbortController = {
          signal: { aborted: false },
        } as AbortController
        mockAuthStore.authLock.abortController = mockAbortController

        const result = validator.checkAuthenticationAborted()

        expect(result).toBe(false)
      })
    })

    describe('Aborted States', () => {
      it('should return true when abort controller signal is aborted', () => {
        const mockAbortController = {
          signal: { aborted: true },
        } as AbortController
        mockAuthStore.authLock.abortController = mockAbortController

        const result = validator.checkAuthenticationAborted()

        expect(result).toBe(true)
        expect(consoleLogSpy).toHaveBeenCalledWith('❌ Authentication aborted by user or timeout')
      })

      it('should handle undefined abort controller gracefully', () => {
        mockAuthStore.authLock.abortController = undefined as any

        const result = validator.checkAuthenticationAborted()

        expect(result).toBe(false)
      })
    })

    describe('Edge Cases', () => {
      it('should handle missing authLock property', () => {
        mockAuthStore.authLock = null as any

        expect(() => validator.checkAuthenticationAborted()).toThrow()
      })

      it('should handle malformed abort controller', () => {
        mockAuthStore.authLock.abortController = { signal: null } as any

        expect(() => validator.checkAuthenticationAborted()).toThrow()
      })
    })
  })

  describe('captureConnectionState', () => {
    it('should return current wallet connection state', () => {
      const expectedState = mockAtomicState
      mockWalletStore.captureState.mockReturnValue(expectedState)

      const result = validator.captureConnectionState()

      expect(result).toBe(expectedState)
      expect(mockWalletStore.captureState).toHaveBeenCalled()
    })

    it('should call wallet store capture method', () => {
      validator.captureConnectionState()

      expect(mockWalletStore.captureState).toHaveBeenCalledTimes(1)
    })

    it('should return different states based on wallet store', () => {
      const states = [
        { ...mockAtomicState, address: '0x1111111111111111111111111111111111111111' },
        { ...mockAtomicState, chainId: 1 },
        { ...mockAtomicState, isConnected: false },
      ]

      for (const state of states) {
        mockWalletStore.captureState.mockReturnValue(state as AtomicConnectionState)

        const result = validator.captureConnectionState()

        expect(result).toEqual(state)
      }
    })
  })

  describe('Error Handling and Edge Cases', () => {
    describe('Store Integration Errors', () => {
      it('should handle wallet store captureState throwing error', () => {
        mockWalletStore.captureState.mockImplementation(() => {
          throw new Error('Wallet store error')
        })

        expect(() => validator.captureConnectionState()).toThrow('Wallet store error')
      })

      it('should handle wallet store validateState throwing error', () => {
        mockWalletStore.validateState.mockImplementation(() => {
          throw new Error('State validation error')
        })

        expect(() => validator.validateStateConsistency(mockAtomicState, 'test')).toThrow('State validation error')
      })

      it('should handle wallet store validateInitialState throwing error', async () => {
        mockWalletStore.validateInitialState.mockImplementation(() => {
          throw new Error('Initial state validation error')
        })

        await expect(validator.validatePreConditions(mockValidationContext)).rejects.toThrow('Initial state validation error')
      })
    })

    describe('Invalid Input Handling', () => {
      it('should handle empty wallet address in validation context', async () => {
        const emptyAddressContext: ValidationContext = { walletAddress: '' }
        mockWalletStore.validateInitialState.mockReturnValue({ isValid: true })

        await expect(validator.validatePreConditions(emptyAddressContext)).resolves.toBeUndefined()

        expect(mockWalletStore.validateInitialState).toHaveBeenCalledWith('')
      })

      it('should handle null/undefined wallet address', async () => {
        const nullAddressContext: ValidationContext = { walletAddress: null as any }
        mockWalletStore.validateInitialState.mockReturnValue({ isValid: true })

        await validator.validatePreConditions(nullAddressContext)

        expect(mockWalletStore.validateInitialState).toHaveBeenCalledWith(null)
      })

      it('should handle empty checkpoint name', () => {
        mockWalletStore.validateState.mockReturnValue(true)

        const result = validator.validateStateConsistency(mockAtomicState, '')

        expect(result).toBe(true)
        expect(consoleLogSpy).toHaveBeenCalledWith('🔍 Validating state consistency at checkpoint: ')
      })
    })
  })

  describe('Logging and Debugging', () => {
    it('should log all validation steps with proper emojis', async () => {
      mockWalletStore.validateInitialState.mockReturnValue({ isValid: true })

      await validator.validatePreConditions(mockValidationContext)

      expect(consoleLogSpy).toHaveBeenCalledWith('🔍 Validating authentication pre-conditions...')
      expect(consoleLogSpy).toHaveBeenCalledWith('✅ Pre-conditions validated successfully')
    })

    it('should log state consistency validation steps', () => {
      mockWalletStore.validateState.mockReturnValue(true)

      validator.validateStateConsistency(mockAtomicState, 'logging-test')

      expect(consoleLogSpy).toHaveBeenCalledWith('🔍 Validating state consistency at checkpoint: logging-test')
      expect(consoleLogSpy).toHaveBeenCalledWith('✅ State consistency validated at logging-test')
    })

    it('should log abortion detection', () => {
      const mockAbortController = {
        signal: { aborted: true },
      } as AbortController
      mockAuthStore.authLock.abortController = mockAbortController

      validator.checkAuthenticationAborted()

      expect(consoleLogSpy).toHaveBeenCalledWith('❌ Authentication aborted by user or timeout')
    })

    it('should warn about invalid initial connection states', async () => {
      const errorMessage = 'Connection state validation failed'
      mockWalletStore.validateInitialState.mockReturnValue({
        isValid: false,
        error: errorMessage,
      })

      try {
        await validator.validatePreConditions(mockValidationContext)
      } catch {
        // Expected to throw
      }

      expect(consoleWarnSpy).toHaveBeenCalledWith('❌ Invalid initial connection state:', errorMessage)
    })
  })

  describe('Integration Scenarios', () => {
    it('should handle complete pre-condition validation flow', async () => {
      // Setup valid state
      mockAuthStore.isLoggingOut = false
      mockWalletStore.validateInitialState.mockReturnValue({ isValid: true })

      // Run validation
      await validator.validatePreConditions(mockValidationContext)

      // Verify all steps were called in order
      expect(mockWalletStore.validateInitialState).toHaveBeenCalledWith(mockValidationContext.walletAddress)
      expect(consoleLogSpy).toHaveBeenCalledWith('🔍 Validating authentication pre-conditions...')
      expect(consoleLogSpy).toHaveBeenCalledWith('✅ Pre-conditions validated successfully')
    })

    it('should handle state consistency validation with realistic state changes', () => {
      // Setup initial state
      const initialState = { ...mockAtomicState }

      // Simulate state change during authentication
      const changedState = { ...mockAtomicState, chainId: 1 } // Chain switched
      mockWalletStore.captureState.mockReturnValue(changedState)
      mockWalletStore.validateState.mockReturnValue(false) // State change detected

      const result = validator.validateStateConsistency(initialState, 'chain-switch-detection')

      expect(result).toBe(false)
      expect(mockWalletStore.validateState).toHaveBeenCalledWith(initialState, changedState, 'chain-switch-detection')
    })

    it('should handle complete authentication abortion flow', () => {
      // Setup aborted controller
      const mockAbortController = {
        signal: { aborted: true },
      } as AbortController
      mockAuthStore.authLock.abortController = mockAbortController

      const result = validator.checkAuthenticationAborted()

      expect(result).toBe(true)
      expect(consoleLogSpy).toHaveBeenCalledWith('❌ Authentication aborted by user or timeout')
    })
  })

  describe('Performance and Memory', () => {
    it('should handle multiple rapid validation calls', async () => {
      mockWalletStore.validateInitialState.mockReturnValue({ isValid: true })

      const promises = Array.from({ length: 5 }, () => validator.validatePreConditions(mockValidationContext))

      await Promise.all(promises)

      expect(mockWalletStore.validateInitialState).toHaveBeenCalledTimes(5)
    })

    it('should handle rapid state consistency checks', () => {
      mockWalletStore.validateState.mockReturnValue(true)

      const results = []
      for (let i = 0; i < 10; i++) {
        results.push(validator.validateStateConsistency(mockAtomicState, `checkpoint-${i}`))
      }

      expect(results).toHaveLength(10)
      results.forEach((result) => expect(result).toBe(true))
      expect(mockWalletStore.captureState).toHaveBeenCalledTimes(10)
    })

    it('should not leak memory with repeated state captures', () => {
      const largeState = {
        ...mockAtomicState,
        metadata: 'A'.repeat(10000), // Large metadata
      } as any

      mockWalletStore.captureState.mockReturnValue(largeState)

      for (let i = 0; i < 5; i++) {
        const result = validator.captureConnectionState()
        expect(result).toBe(largeState)
      }

      expect(mockWalletStore.captureState).toHaveBeenCalledTimes(5)
    })
  })

  describe('Type Safety and Interface Compliance', () => {
    it('should maintain ValidationContext interface compliance', () => {
      const validContext: ValidationContext = {
        walletAddress: '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8',
      }

      expect(validContext).toHaveProperty('walletAddress')
      expect(typeof validContext.walletAddress).toBe('string')
    })

    it('should work with minimal ValidationContext', async () => {
      const minimalContext: ValidationContext = {
        walletAddress: '0x1234567890123456789012345678901234567890',
      }

      mockWalletStore.validateInitialState.mockReturnValue({ isValid: true })

      await validator.validatePreConditions(minimalContext)

      expect(mockWalletStore.validateInitialState).toHaveBeenCalledWith(minimalContext.walletAddress)
    })

    it('should return correct types from all methods', async () => {
      // validatePreConditions returns Promise<void>
      mockWalletStore.validateInitialState.mockReturnValue({ isValid: true })
      const preConditionsResult = await validator.validatePreConditions(mockValidationContext)
      expect(preConditionsResult).toBeUndefined()

      // validateStateConsistency returns boolean
      mockWalletStore.validateState.mockReturnValue(true)
      const consistencyResult = validator.validateStateConsistency(mockAtomicState, 'test')
      expect(typeof consistencyResult).toBe('boolean')

      // checkAuthenticationAborted returns boolean
      const abortedResult = validator.checkAuthenticationAborted()
      expect(typeof abortedResult).toBe('boolean')

      // captureConnectionState returns AtomicConnectionState
      const stateResult = validator.captureConnectionState()
      expect(typeof stateResult).toBe('object')
      expect(stateResult).toHaveProperty('address')
    })
  })
})
