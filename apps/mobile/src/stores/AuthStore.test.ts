import type { StoreApi } from 'zustand/vanilla'
import { type AuthStoreState, createAuthStore, selectIsAuthenticating, selectIsFullyInitialized } from './AuthStore'

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {})

// Mock setTimeout to make tests synchronous
jest.useFakeTimers()

describe('AuthStore', () => {
  let authStore: StoreApi<AuthStoreState>

  beforeEach(() => {
    jest.clearAllMocks()
    mockConsoleLog.mockClear()
    authStore = createAuthStore()
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.useFakeTimers()
  })

  afterAll(() => {
    mockConsoleLog.mockRestore()
    jest.useRealTimers()
  })

  describe('Auth Lock Management', () => {
    it('should skip acquiring lock when already locked (lines 58-59)', () => {
      // First acquire lock
      const result1 = authStore.getState().acquireAuthLock('0x123')
      expect(result1).toBe(true)

      // Try to acquire lock again - should fail
      const result2 = authStore.getState().acquireAuthLock('0x456')
      expect(result2).toBe(false)
      expect(mockConsoleLog).toHaveBeenCalledWith('🔒 Auth lock already held, skipping authentication')
    })
  })

  describe('Initialization State Management', () => {
    it('should initialize Firebase state only once (lines 145-147)', () => {
      expect(authStore.getState().hasInitializedFirebase).toBe(false)

      // First initialization
      authStore.getState().initializeFirebaseState()
      expect(authStore.getState().hasInitializedFirebase).toBe(true)
      expect(mockConsoleLog).toHaveBeenCalledWith('🔥 Firebase state initialized')

      // Second initialization should not log again (already initialized)
      mockConsoleLog.mockClear()
      authStore.getState().initializeFirebaseState()
      expect(mockConsoleLog).not.toHaveBeenCalledWith('🔥 Firebase state initialized')
    })
  })

  describe('Reset Methods', () => {
    it('should reset progress state (lines 163-166)', () => {
      // Set up some state
      authStore.setState({
        currentStep: 'generate-message',
        completedSteps: new Set(['connect-wallet']),
        failedStep: 'request-signature',
        error: 'Test error',
      })

      // Reset progress
      authStore.getState().resetProgress()

      expect(authStore.getState().currentStep).toBe(null)
      expect(authStore.getState().completedSteps.size).toBe(0)
      expect(authStore.getState().failedStep).toBe(null)
      expect(authStore.getState().error).toBe(null)
    })

    it('should reset wallet state (lines 170-174)', () => {
      // Set up wallet state
      authStore.setState({
        isWalletConnected: true,
        walletAddress: '0x123',
        chainId: 1,
        isWalletConnecting: true,
        hasInitializedWallet: true,
      })

      // Reset wallet state
      authStore.getState().resetWalletState()

      expect(authStore.getState().isWalletConnected).toBe(false)
      expect(authStore.getState().walletAddress).toBe(null)
      expect(authStore.getState().chainId).toBe(null)
      expect(authStore.getState().isWalletConnecting).toBe(false)
      expect(authStore.getState().hasInitializedWallet).toBe(false)
    })

    it('should reset initialization state (lines 178-180)', () => {
      // Set up initialization state
      authStore.setState({ hasInitializedWallet: true, hasInitializedFirebase: true })

      // Reset initialization
      authStore.getState().resetInitialization()

      expect(authStore.getState().hasInitializedWallet).toBe(false)
      expect(authStore.getState().hasInitializedFirebase).toBe(false)
      expect(mockConsoleLog).toHaveBeenCalledWith('🔄 Initialization state reset')
    })
  })

  describe('Helper Methods', () => {
    it('should check if authenticating for specific wallet (line 185)', () => {
      // Test when not authenticating (no lock acquired)
      expect(authStore.getState().isAuthenticatingForWallet('0x123456789abcdef')).toBe(false)

      // Set up authentication state by acquiring lock
      authStore.getState().acquireAuthLock('0x123456789ABCDEF')

      // Test case-insensitive matching when authenticating
      expect(selectIsAuthenticating(authStore.getState())).toBe(true) // Derived from authLock.isLocked
      expect(authStore.getState().isAuthenticatingForWallet('0x123456789abcdef')).toBe(true)
      expect(authStore.getState().isAuthenticatingForWallet('0x123456789ABCDEF')).toBe(true)
      expect(authStore.getState().isAuthenticatingForWallet('0xdifferentaddress')).toBe(false)

      // Test when lock is released
      authStore.getState().releaseAuthLock()
      expect(selectIsAuthenticating(authStore.getState())).toBe(false)
      expect(authStore.getState().isAuthenticatingForWallet('0x123456789abcdef')).toBe(false)
    })
  })

  describe('Derived Values', () => {
    it('should compute isFullyInitialized correctly', () => {
      // Initially both false
      expect(selectIsFullyInitialized(authStore.getState())).toBe(false)

      // Only wallet initialized
      authStore.setState({ hasInitializedWallet: true })
      expect(selectIsFullyInitialized(authStore.getState())).toBe(false)

      // Only Firebase initialized
      authStore.setState({ hasInitializedWallet: false, hasInitializedFirebase: true })
      expect(selectIsFullyInitialized(authStore.getState())).toBe(false)

      // Both initialized
      authStore.setState({ hasInitializedWallet: true, hasInitializedFirebase: true })
      expect(selectIsFullyInitialized(authStore.getState())).toBe(true)
    })

    /*
      Under MobX every one of these was a getter, and reading one inside an
      `observer` subscribed the component to whatever the getter touched.
      Zustand subscribes to what a selector returns, so a component that reads
      a derived value without one is not subscribed at all — this checks the
      selectors are pure functions of state, which is what makes that work.
    */
    it('should derive from a state snapshot rather than from the store', () => {
      authStore.setState({ completedSteps: new Set(['connect-wallet']), hasInitializedWallet: true, hasInitializedFirebase: true })
      const snapshot = authStore.getState()

      authStore.getState().resetProgress()
      authStore.getState().resetInitialization()

      // The snapshot still answers for the state it was taken from.
      expect(selectIsFullyInitialized(snapshot)).toBe(true)
      expect(selectIsFullyInitialized(authStore.getState())).toBe(false)
    })
  })

  describe('Step Progress', () => {
    it('should replace the completed-steps set rather than mutate it', () => {
      const before = authStore.getState().completedSteps

      authStore.getState().completeStep('connect-wallet')

      const after = authStore.getState().completedSteps
      expect(after.has('connect-wallet')).toBe(true)
      // A mutated Set would be the same reference and Zustand would not notify.
      expect(after).not.toBe(before)
      expect(before.size).toBe(0)
    })

    it('should notify subscribers when a step completes', () => {
      const listener = jest.fn()
      const unsubscribe = authStore.subscribe(listener)

      authStore.getState().completeStep('connect-wallet')

      expect(listener).toHaveBeenCalled()
      unsubscribe()
    })
  })

  describe('Auth Lock State', () => {
    it('should manage auth lock state correctly', () => {
      expect(authStore.getState().authLock.isLocked).toBe(false)
      expect(authStore.getState().authLock.walletAddress).toBe(null)

      // Acquire lock
      const result = authStore.getState().acquireAuthLock('0x123', 'test-request')
      expect(result).toBe(true)
      expect(authStore.getState().authLock.isLocked).toBe(true)
      expect(authStore.getState().authLock.walletAddress).toBe('0x123')
      expect(authStore.getState().authLock.requestId).toBe('test-request')

      // Release lock
      authStore.getState().releaseAuthLock()
      expect(authStore.getState().authLock.isLocked).toBe(false)
      expect(authStore.getState().authLock.walletAddress).toBe(null)
      expect(authStore.getState().authLock.requestId).toBe(null)
    })
  })
})
