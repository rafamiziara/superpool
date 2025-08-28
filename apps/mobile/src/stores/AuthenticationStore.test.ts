import { AuthenticationStore } from './AuthenticationStore'
import { AppError, ErrorType } from '../utils/errorHandling'
import { waitForMobX } from '../test-utils'

describe('AuthenticationStore', () => {
  let store: AuthenticationStore

  beforeEach(() => {
    store = new AuthenticationStore()
  })

  afterEach(() => {
    store.reset()
  })

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      expect(store.authError).toBeNull()
      expect(store.isAuthenticating).toBe(false)
      expect(store.authWalletAddress).toBeNull()
      expect(store.currentStep).toBeNull()
      expect(store.completedSteps.size).toBe(0)
      expect(store.failedStep).toBeNull()
      expect(store.isProgressComplete).toBe(false)
      expect(store.progressError).toBeNull()
      expect(store.retryCount).toBe(0)
      expect(store.isRetryDelayActive).toBe(false)
      expect(store.isAppRefreshGracePeriod).toBe(true)
      expect(store.isLoggingOut).toBe(false)
    })
  })

  describe('Auth Lock Management', () => {
    const testAddress = '0x1234567890123456789012345678901234567890'

    it('should acquire auth lock successfully', () => {
      const result = store.acquireAuthLock(testAddress)

      expect(result).toBe(true)
      expect(store.isAuthenticating).toBe(true)
      expect(store.authWalletAddress).toBe(testAddress)
      expect(store.authLock.isLocked).toBe(true)
      expect(store.authLock.startTime).toBeGreaterThan(0)
      expect(store.authLock.abortController).toBeInstanceOf(AbortController)
    })

    it('should not acquire lock when already locked', () => {
      store.acquireAuthLock(testAddress)
      const result = store.acquireAuthLock('0x9876543210987654321098765432109876543210')

      expect(result).toBe(false)
      expect(store.authWalletAddress).toBe(testAddress) // Still the original address
    })

    it('should release auth lock', () => {
      store.acquireAuthLock(testAddress)
      store.releaseAuthLock()

      expect(store.isAuthenticating).toBe(false)
      expect(store.authWalletAddress).toBeNull()
      expect(store.authLock.isLocked).toBe(false)
      expect(store.authLock.startTime).toBe(0)
      expect(store.authLock.abortController).toBeNull()
    })

    it('should check if authenticating for specific wallet', () => {
      store.acquireAuthLock(testAddress)

      expect(store.isAuthenticatingForWallet(testAddress)).toBe(true)
      expect(store.isAuthenticatingForWallet(testAddress.toUpperCase())).toBe(true) // Case insensitive
      expect(store.isAuthenticatingForWallet('0x9876543210987654321098765432109876543210')).toBe(false)
    })
  })

  describe('Error Management', () => {
    it('should set and clear auth errors', () => {
      const error: AppError = {
        name: 'AppError',
        message: 'Authentication failed',
        type: ErrorType.AUTHENTICATION_FAILED,
        userFriendlyMessage: 'Authentication failed',
      }

      store.setAuthError(error)
      expect(store.authError).toBe(error)

      store.setAuthError(null)
      expect(store.authError).toBeNull()
    })
  })

  describe('Auth Progress Management', () => {
    it('should start a step correctly', async () => {
      store.startStep('generate-message')

      await waitForMobX()

      expect(store.currentStep).toBe('generate-message')
      expect(store.failedStep).toBeNull()
      expect(store.progressError).toBeNull()
    })

    it('should complete a step correctly', async () => {
      store.completeStep('generate-message')

      await waitForMobX()

      expect(store.completedSteps.has('generate-message')).toBe(true)
      expect(store.failedStep).toBeNull()
      expect(store.progressError).toBeNull()
    })

    it('should complete final step and mark progress complete', async () => {
      store.completeStep('firebase-auth')

      await waitForMobX()

      expect(store.completedSteps.has('firebase-auth')).toBe(true)
      expect(store.currentStep).toBeNull()
      expect(store.isProgressComplete).toBe(true)
    })

    it('should fail a step correctly', async () => {
      const errorMessage = 'Step failed'
      store.failStep('verify-signature', errorMessage)

      await waitForMobX()

      expect(store.currentStep).toBeNull()
      expect(store.failedStep).toBe('verify-signature')
      expect(store.progressError).toBe(errorMessage)
      expect(store.isProgressComplete).toBe(false)
    })

    it('should reset progress correctly', async () => {
      store.startStep('generate-message')
      store.completeStep('generate-message')
      store.failStep('verify-signature', 'Error')

      store.resetProgress()
      await waitForMobX()

      expect(store.currentStep).toBeNull()
      expect(store.completedSteps.size).toBe(1) // Only 'connect-wallet' should remain
      expect(store.completedSteps.has('connect-wallet')).toBe(true)
      expect(store.failedStep).toBeNull()
      expect(store.isProgressComplete).toBe(false)
      expect(store.progressError).toBeNull()
    })

    it('should get step status correctly', () => {
      store.completeStep('generate-message')
      store.startStep('request-signature')
      store.failStep('verify-signature', 'Error')

      expect(store.getStepStatus('generate-message')).toBe('completed')
      expect(store.getStepStatus('request-signature')).toBe('current')
      expect(store.getStepStatus('verify-signature')).toBe('failed')
      expect(store.getStepStatus('firebase-auth')).toBe('pending')
    })

    it('should get step info correctly', () => {
      const stepInfo = store.getStepInfo('generate-message')

      expect(stepInfo).toEqual({
        step: 'generate-message',
        title: 'Generate Auth Message',
        description: 'Creating authentication challenge',
      })
    })

    it('should get all steps', () => {
      const allSteps = store.getAllSteps()

      expect(allSteps).toHaveLength(6)
      expect(allSteps[0].step).toBe('connect-wallet')
      expect(allSteps[5].step).toBe('firebase-auth')
    })
  })

  describe('Retry Logic Management', () => {
    it('should set retry count within bounds', () => {
      store.setRetryCount(2)
      expect(store.retryCount).toBe(2)

      store.setRetryCount(-1)
      expect(store.retryCount).toBe(0) // Should clamp to 0

      store.setRetryCount(10)
      expect(store.retryCount).toBe(3) // Should clamp to maxRetries
    })

    it('should manage retry delay state', () => {
      store.setRetryDelayActive(true)
      expect(store.isRetryDelayActive).toBe(true)

      store.setRetryDelayActive(false)
      expect(store.isRetryDelayActive).toBe(false)
    })

    it('should end grace period', () => {
      expect(store.isAppRefreshGracePeriod).toBe(true)

      store.endGracePeriod()
      expect(store.isAppRefreshGracePeriod).toBe(false)
    })

    it('should reset retry state', () => {
      store.setRetryCount(2)
      store.setRetryDelayActive(true)
      store.endGracePeriod()

      store.resetRetryState()

      expect(store.retryCount).toBe(0)
      expect(store.isRetryDelayActive).toBe(false)
      expect(store.isAppRefreshGracePeriod).toBe(true)
    })

    it('should calculate canRetry correctly', () => {
      expect(store.canRetry).toBe(true)

      store.setRetryCount(3)
      expect(store.canRetry).toBe(false)

      store.setRetryCount(2)
      expect(store.canRetry).toBe(true)
    })

    it('should calculate next retry delay correctly', () => {
      store.setRetryCount(1)
      expect(store.nextRetryDelay).toBe(2000) // Base delay for first retry

      store.setRetryCount(2)
      expect(store.nextRetryDelay).toBe(4000) // 2 * 2^1

      store.setRetryCount(3)
      expect(store.nextRetryDelay).toBe(8000) // 2 * 2^2
    })
  })

  describe('Logout Management', () => {
    it('should manage logout state', () => {
      store.startLogout()
      expect(store.isLoggingOut).toBe(true)

      store.finishLogout()
      expect(store.isLoggingOut).toBe(false)
    })
  })

  describe('Store Reset', () => {
    it('should reset all state', async () => {
      const testAddress = '0x1234567890123456789012345678901234567890'
      const error: AppError = {
        name: 'AppError',
        message: 'Test error',
        type: ErrorType.AUTHENTICATION_FAILED,
        userFriendlyMessage: 'Test error',
      }

      // Set up various state
      store.acquireAuthLock(testAddress)
      store.setAuthError(error)
      store.startStep('generate-message')
      store.completeStep('generate-message')
      store.setRetryCount(2)
      store.startLogout()

      store.reset()
      await waitForMobX()

      // Verify everything is reset
      expect(store.authError).toBeNull()
      expect(store.isAuthenticating).toBe(false)
      expect(store.authWalletAddress).toBeNull()
      expect(store.currentStep).toBeNull()
      expect(store.completedSteps.size).toBe(1) // Only 'connect-wallet'
      expect(store.completedSteps.has('connect-wallet')).toBe(true)
      expect(store.failedStep).toBeNull()
      expect(store.isProgressComplete).toBe(false)
      expect(store.progressError).toBeNull()
      expect(store.retryCount).toBe(0)
      expect(store.isRetryDelayActive).toBe(false)
      expect(store.isAppRefreshGracePeriod).toBe(true)
      expect(store.isLoggingOut).toBe(false)
    })

    it('should prevent infinite reset loops', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      // Create a scenario where reset could potentially be called recursively
      store.reset()
      store.reset() // This should be ignored

      expect(consoleSpy).toHaveBeenCalledWith('🔄 Reset already in progress, skipping to prevent infinite loop')

      consoleSpy.mockRestore()
    })
  })

  describe('Computed Values Reactivity', () => {
    it('should reactively update isAuthenticating when lock state changes', async () => {
      expect(store.isAuthenticating).toBe(false)

      store.acquireAuthLock('0x1234567890123456789012345678901234567890')
      await waitForMobX()

      expect(store.isAuthenticating).toBe(true)

      store.releaseAuthLock()
      await waitForMobX()

      expect(store.isAuthenticating).toBe(false)
    })

    it('should reactively update authWalletAddress when lock state changes', async () => {
      const testAddress = '0x1234567890123456789012345678901234567890'

      expect(store.authWalletAddress).toBeNull()

      store.acquireAuthLock(testAddress)
      await waitForMobX()

      expect(store.authWalletAddress).toBe(testAddress)

      store.releaseAuthLock()
      await waitForMobX()

      expect(store.authWalletAddress).toBeNull()
    })
  })
})
