/**
 * Comprehensive test suite for useAuthentication hook
 * Tests reactive state management, progress tracking, and store integration
 */

import { act } from '@testing-library/react-native'
import { runInAction } from 'mobx'
import { useAuthentication } from './useAuthentication'
import { createMockRootStore, renderHookWithStore } from '../../test-utils'
import { AuthStep } from '@superpool/types'
import { AppError, ErrorType } from '../../utils/errorHandling'

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

describe('useAuthentication', () => {
  let mockStore: ReturnType<typeof createMockRootStore>

  beforeEach(() => {
    mockStore = createMockRootStore()

    // Reset Firebase auth mock state
    Object.assign(mockFirebaseAuth, {
      isAuthenticated: false,
      isLoading: false,
      walletAddress: null,
      user: null,
    })

    // Reset auth store to initial state  
    runInAction(() => {
      mockStore.authenticationStore.authError = null
      mockStore.authenticationStore.authLock = {
        isLocked: false,
        startTime: 0,
        walletAddress: null,
        abortController: null,
        requestId: null,
      }
      mockStore.authenticationStore.currentStep = null
      mockStore.authenticationStore.completedSteps.clear()
      mockStore.authenticationStore.completedSteps.add('connect-wallet') // resetProgress adds this
      mockStore.authenticationStore.failedStep = null
      mockStore.authenticationStore.progressError = null
      mockStore.authenticationStore.isProgressComplete = false
    })
    
    // Clear mocks after store setup to preserve the jest mock functions
    jest.clearAllMocks()
  })

  describe('Initial State', () => {
    it('should return initial authentication state', () => {
      const { result } = renderHookWithStore(() => useAuthentication(), { store: mockStore })

      expect(result.current.authError).toBeNull()
      expect(result.current.isAuthenticating).toBe(false)
      expect(result.current.authWalletAddress).toBeNull()
      expect(result.current.isFirebaseAuthenticated).toBe(false)
      expect(result.current.isFirebaseLoading).toBe(false)
      expect(result.current.currentStep).toBeNull()
      expect(result.current.completedSteps).toEqual(expect.any(Object)) // MobX observable set
      expect(result.current.failedStep).toBeNull()
      expect(result.current.isComplete).toBe(false)
      expect(result.current.error).toBeNull()
      expect(typeof result.current.startStep).toBe('function')
      expect(typeof result.current.completeStep).toBe('function')
      expect(typeof result.current.failStep).toBe('function')
      expect(typeof result.current.resetProgress).toBe('function')
      expect(typeof result.current.getStepStatus).toBe('function')
      expect(typeof result.current.getStepInfo).toBe('function')
      expect(typeof result.current.getAllSteps).toBe('function')
      expect(result.current._debug.authStore.authError).toBeNull()
      expect(result.current._debug.authStore.isAuthenticating).toBe(false)
      expect(result.current._debug.authStore.authWalletAddress).toBeNull()
      expect(result.current._debug.authStore.currentStep).toBeNull()
      expect(Array.isArray(result.current._debug.authStore.completedSteps)).toBe(true)
      expect(result.current._debug.authStore.failedStep).toBeNull()
    })

    it('should return completed steps with connect-wallet initially', () => {
      const { result } = renderHookWithStore(() => useAuthentication(), { store: mockStore })

      // After resetProgress is called in beforeEach, connect-wallet should be present
      expect(result.current.completedSteps.size).toBe(1)
      expect(result.current.completedSteps.has('connect-wallet')).toBe(true)
      expect(result.current._debug.authStore.completedSteps).toEqual(['connect-wallet'])
    })
  })

  describe('Authentication State Management', () => {
    it('should reactively update when auth store changes', () => {
      const { result, rerender } = renderHookWithStore(() => useAuthentication(), { store: mockStore })

      expect(result.current.isAuthenticating).toBe(false)
      expect(result.current.authError).toBeNull()

      // Update auth store
      runInAction(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          isLocked: true,
          walletAddress: '0x1234567890123456789012345678901234567890',
        }
        mockStore.authenticationStore.authError = {
          name: 'AppError',
          message: 'Test auth error',
          type: ErrorType.AUTHENTICATION_FAILED,
          userFriendlyMessage: 'Test auth error',
        } as AppError
      })

      rerender({})

      expect(result.current.isAuthenticating).toBe(true)
      expect(result.current.authError).toBe('Test auth error')
      expect(result.current.authWalletAddress).toBe('0x1234567890123456789012345678901234567890')
    })

    it('should combine auth store and Firebase loading states', () => {
      const { result, rerender } = renderHookWithStore(() => useAuthentication(), { store: mockStore })

      // Initially not authenticating
      expect(result.current.isAuthenticating).toBe(false)

      // Auth store authenticating
      runInAction(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          isLocked: true,
        }
      })
      rerender({})

      expect(result.current.isAuthenticating).toBe(true)

      // Firebase loading
      runInAction(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          isLocked: false,
        }
      })
      mockFirebaseAuth.isLoading = true
      rerender({})

      expect(result.current.isAuthenticating).toBe(true)

      // Both false
      mockFirebaseAuth.isLoading = false
      rerender({})

      expect(result.current.isAuthenticating).toBe(false)
    })

    it('should prioritize Firebase wallet address over auth store', () => {
      const { result, rerender } = renderHookWithStore(() => useAuthentication(), { store: mockStore })

      // Set both addresses
      runInAction(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          walletAddress: '0x1111111111111111111111111111111111111111',
        }
      })
      mockFirebaseAuth.walletAddress = '0x2222222222222222222222222222222222222222'
      rerender({})

      // Should return Firebase address
      expect(result.current.authWalletAddress).toBe('0x2222222222222222222222222222222222222222')
    })

    it('should fallback to auth store wallet address when Firebase has none', () => {
      const { result, rerender } = renderHookWithStore(() => useAuthentication(), { store: mockStore })

      runInAction(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          walletAddress: '0x1111111111111111111111111111111111111111',
        }
      })
      rerender({})

      expect(result.current.authWalletAddress).toBe('0x1111111111111111111111111111111111111111')
    })
  })

  describe('Firebase Auth State', () => {
    it('should reflect Firebase authentication state', () => {
      const { result, rerender } = renderHookWithStore(() => useAuthentication(), { store: mockStore })

      expect(result.current.isFirebaseAuthenticated).toBe(false)
      expect(result.current.isFirebaseLoading).toBe(false)

      mockFirebaseAuth.isAuthenticated = true
      mockFirebaseAuth.isLoading = true
      rerender({})

      expect(result.current.isFirebaseAuthenticated).toBe(true)
      expect(result.current.isFirebaseLoading).toBe(true)
    })
  })

  describe('Progress State Management', () => {
    it('should reactively update progress state', () => {
      const { result, rerender } = renderHookWithStore(() => useAuthentication(), { store: mockStore })

      expect(result.current.currentStep).toBeNull()
      expect(result.current.isComplete).toBe(false)
      expect(result.current.error).toBeNull()

      runInAction(() => {
        mockStore.authenticationStore.currentStep = 'generate-message'
        mockStore.authenticationStore.progressError = 'Progress error'
        mockStore.authenticationStore.completedSteps.add('request-signature')
      })
      rerender({})

      expect(result.current.currentStep).toBe('generate-message')
      expect(result.current.error).toBe('Progress error')
      expect(result.current.completedSteps.has('request-signature')).toBe(true)
    })

    it('should update failed step state', () => {
      const { result, rerender } = renderHookWithStore(() => useAuthentication(), { store: mockStore })

      expect(result.current.failedStep).toBeNull()

      runInAction(() => {
        mockStore.authenticationStore.failedStep = 'verify-signature'
      })
      rerender({})

      expect(result.current.failedStep).toBe('verify-signature')
    })

    it('should reflect completion state', () => {
      const { result, rerender } = renderHookWithStore(() => useAuthentication(), { store: mockStore })

      expect(result.current.isComplete).toBe(false)

      // Set the completion state via the store property
      runInAction(() => {
        mockStore.authenticationStore.isProgressComplete = true
      })
      rerender({})

      expect(result.current.isComplete).toBe(true)
    })
  })

  describe('Progress Management Functions', () => {
    it('should expose startStep function', () => {
      const { result, rerender } = renderHookWithStore(() => useAuthentication(), { store: mockStore })

      const step: AuthStep = 'generate-message'
      act(() => {
        result.current.startStep(step)
      })
      rerender({})

      // Verify function call worked by checking state change
      expect(result.current.currentStep).toBe(step)
    })

    it('should expose completeStep function', () => {
      const { result } = renderHookWithStore(() => useAuthentication(), { store: mockStore })

      const step: AuthStep = 'generate-message'
      act(() => {
        result.current.completeStep(step)
      })

      // Verify function call worked by checking state change
      expect(result.current.completedSteps.has(step)).toBe(true)
    })

    it('should expose failStep function', () => {
      const { result, rerender } = renderHookWithStore(() => useAuthentication(), { store: mockStore })

      const step: AuthStep = 'verify-signature'
      const error = 'Verification failed'
      act(() => {
        result.current.failStep(step, error)
      })
      rerender({})

      // Verify function call worked by checking state change
      expect(result.current.failedStep).toBe(step)
      expect(result.current.error).toBe(error)
    })

    it('should expose resetProgress function', () => {
      const { result, rerender } = renderHookWithStore(() => useAuthentication(), { store: mockStore })

      // First add some state to reset
      act(() => {
        result.current.startStep('generate-message')
      })
      rerender({})
      expect(result.current.currentStep).toBe('generate-message')
      
      // Then reset
      act(() => {
        result.current.resetProgress()
      })
      rerender({})

      // Verify reset worked
      expect(result.current.currentStep).toBeNull()
      expect(result.current.completedSteps.has('connect-wallet')).toBe(true) // Should still have connect-wallet
    })

    it('should expose getStepStatus function', () => {
      const { result } = renderHookWithStore(() => useAuthentication(), { store: mockStore })

      const step: AuthStep = 'generate-message'
      const status = result.current.getStepStatus(step)

      // Verify function returns a valid status
      expect(['pending', 'current', 'completed', 'failed']).toContain(status)
    })

    it('should expose getStepInfo function', () => {
      const { result } = renderHookWithStore(() => useAuthentication(), { store: mockStore })

      const step: AuthStep = 'request-signature'
      const stepInfo = result.current.getStepInfo(step)

      // Verify function returns valid step info
      expect(stepInfo).toEqual({
        step: 'request-signature',
        title: 'Request Signature',
        description: 'Sign message in your wallet app',
      })
    })

    it('should expose getAllSteps function', () => {
      const { result } = renderHookWithStore(() => useAuthentication(), { store: mockStore })

      const allSteps = result.current.getAllSteps()

      // Verify function returns all steps
      expect(Array.isArray(allSteps)).toBe(true)
      expect(allSteps.length).toBeGreaterThan(0)
      expect(allSteps.every(step => step.step && step.title && step.description)).toBe(true)
    })
  })

  describe('Debug Information', () => {
    it('should provide comprehensive debug information', () => {
      const { result, rerender } = renderHookWithStore(() => useAuthentication(), { store: mockStore })

      runInAction(() => {
        mockStore.authenticationStore.authError = {
          name: 'AppError',
          message: 'Debug error',
          type: ErrorType.AUTHENTICATION_FAILED,
          userFriendlyMessage: 'Debug error',
        } as AppError
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          isLocked: true,
        }
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          walletAddress: '0x1234567890123456789012345678901234567890',
        }
        mockStore.authenticationStore.currentStep = 'verify-signature'
        mockStore.authenticationStore.completedSteps.add('generate-message')
        mockStore.authenticationStore.completedSteps.add('request-signature')
        mockStore.authenticationStore.failedStep = 'verify-signature'
      })
      rerender({})

      expect(result.current._debug.authStore).toEqual({
        authError: {
          name: 'AppError',
          message: 'Debug error',
          type: ErrorType.AUTHENTICATION_FAILED,
          userFriendlyMessage: 'Debug error',
        },
        isAuthenticating: true,
        authWalletAddress: '0x1234567890123456789012345678901234567890',
        currentStep: 'verify-signature',
        completedSteps: ['connect-wallet', 'generate-message', 'request-signature'],
        failedStep: 'verify-signature',
      })
    })

    it('should convert Set to Array in debug info', () => {
      const { result, rerender } = renderHookWithStore(() => useAuthentication(), { store: mockStore })

      runInAction(() => {
        mockStore.authenticationStore.completedSteps.add('generate-message')
        mockStore.authenticationStore.completedSteps.add('request-signature')
        mockStore.authenticationStore.completedSteps.add('verify-signature')
      })
      rerender({})

      expect(Array.isArray(result.current._debug.authStore.completedSteps)).toBe(true)
      expect(result.current._debug.authStore.completedSteps).toEqual(['connect-wallet', 'generate-message', 'request-signature', 'verify-signature'])
    })

    it('should handle empty completed steps in debug info', () => {
      const { result } = renderHookWithStore(() => useAuthentication(), { store: mockStore })

      expect(result.current._debug.authStore.completedSteps).toEqual(['connect-wallet'])
    })
  })

  describe('MobX Reactivity', () => {
    it('should maintain reactivity across multiple state changes', () => {
      const { result, rerender } = renderHookWithStore(() => useAuthentication(), { store: mockStore })

      // Initial state
      expect(result.current.isAuthenticating).toBe(false)
      expect(result.current.currentStep).toBeNull()

      // First change
      runInAction(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          isLocked: true,
        }
        mockStore.authenticationStore.currentStep = 'generate-message'
      })
      rerender({})

      expect(result.current.isAuthenticating).toBe(true)
      expect(result.current.currentStep).toBe('generate-message')

      // Second change
      runInAction(() => {
        mockStore.authenticationStore.currentStep = 'request-signature'
        mockStore.authenticationStore.completedSteps.add('generate-message')
      })
      rerender({})

      expect(result.current.currentStep).toBe('request-signature')
      expect(result.current.completedSteps.has('generate-message')).toBe(true)

      // Third change
      runInAction(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          isLocked: false,
        }
        mockStore.authenticationStore.currentStep = null
        mockStore.authenticationStore.completedSteps.add('request-signature')
      })
      rerender({})

      expect(result.current.isAuthenticating).toBe(false)
      expect(result.current.currentStep).toBeNull()
      expect(result.current.completedSteps.has('request-signature')).toBe(true)
    })

    it('should handle complex state interactions', () => {
      const { result, rerender } = renderHookWithStore(() => useAuthentication(), { store: mockStore })

      // Simulate a complete authentication flow
      const steps: AuthStep[] = ['generate-message', 'request-signature', 'verify-signature', 'firebase-auth']

      steps.forEach((step, index) => {
        runInAction(() => {
          mockStore.authenticationStore.currentStep = step
          if (index > 0) {
            mockStore.authenticationStore.completedSteps.add(steps[index - 1])
          }
        })
        rerender({})

        expect(result.current.currentStep).toBe(step)
        expect(result.current.completedSteps.size).toBe(index + 1) // +1 for initial connect-wallet
      })

      // Complete final step
      runInAction(() => {
        mockStore.authenticationStore.completedSteps.add('firebase-auth')
        mockStore.authenticationStore.currentStep = null
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          isLocked: false,
        }
      })
      mockFirebaseAuth.isAuthenticated = true
      mockFirebaseAuth.walletAddress = '0x1234567890123456789012345678901234567890'
      rerender({})

      expect(result.current.completedSteps.size).toBe(5) // +1 for initial connect-wallet
      expect(result.current.currentStep).toBeNull()
      expect(result.current.isAuthenticating).toBe(false)
      expect(result.current.isFirebaseAuthenticated).toBe(true)
      expect(result.current.authWalletAddress).toBe('0x1234567890123456789012345678901234567890')
    })
  })

  describe('Type Safety', () => {
    it('should maintain proper TypeScript types', () => {
      const { result } = renderHookWithStore(() => useAuthentication(), { store: mockStore })

      // Verify function signatures
      expect(typeof result.current.startStep).toBe('function')
      expect(typeof result.current.completeStep).toBe('function')
      expect(typeof result.current.failStep).toBe('function')
      expect(typeof result.current.resetProgress).toBe('function')
      expect(typeof result.current.getStepStatus).toBe('function')
      expect(typeof result.current.getStepInfo).toBe('function')
      expect(typeof result.current.getAllSteps).toBe('function')

      // Verify Set type for completedSteps - MobX observable set
      expect(result.current.completedSteps.has).toBeDefined()
      expect(result.current.completedSteps.add).toBeDefined()
      expect(result.current.completedSteps.size).toBeDefined()

      // Verify debug object structure
      expect(typeof result.current._debug).toBe('object')
      expect(typeof result.current._debug.authStore).toBe('object')
    })
  })
})
