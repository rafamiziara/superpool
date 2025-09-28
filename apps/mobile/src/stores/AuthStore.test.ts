import { AuthStore } from './AuthStore'

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {})

// Mock setTimeout to make tests synchronous
jest.useFakeTimers()

describe('AuthStore', () => {
  let authStore: AuthStore

  beforeEach(() => {
    jest.clearAllMocks()
    mockConsoleLog.mockClear()
    authStore = new AuthStore()
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
      const result1 = authStore.acquireAuthLock('0x123')
      expect(result1).toBe(true)

      // Try to acquire lock again - should fail
      const result2 = authStore.acquireAuthLock('0x456')
      expect(result2).toBe(false)
      expect(mockConsoleLog).toHaveBeenCalledWith('🔒 Auth lock already held, skipping authentication')
    })
  })

  describe('Initialization State Management', () => {
    it('should initialize Firebase state only once (lines 145-147)', () => {
      expect(authStore.hasInitializedFirebase).toBe(false)

      // First initialization
      authStore.initializeFirebaseState()
      expect(authStore.hasInitializedFirebase).toBe(true)
      expect(mockConsoleLog).toHaveBeenCalledWith('🔥 Firebase state initialized')

      // Second initialization should not log again (already initialized)
      mockConsoleLog.mockClear()
      authStore.initializeFirebaseState()
      expect(mockConsoleLog).not.toHaveBeenCalledWith('🔥 Firebase state initialized')
    })
  })

  describe('Reset Methods', () => {
    it('should reset progress state (lines 163-166)', () => {
      // Set up some state
      authStore.currentStep = 'generate-message'
      authStore.completedSteps.add('connect-wallet')
      authStore.failedStep = 'request-signature'
      authStore.error = 'Test error'

      // Reset progress
      authStore.resetProgress()

      expect(authStore.currentStep).toBe(null)
      expect(authStore.completedSteps.size).toBe(0)
      expect(authStore.failedStep).toBe(null)
      expect(authStore.error).toBe(null)
    })

    it('should reset wallet state (lines 170-174)', () => {
      // Set up wallet state
      authStore.isWalletConnected = true
      authStore.walletAddress = '0x123'
      authStore.chainId = 1
      authStore.isWalletConnecting = true
      authStore.hasInitializedWallet = true

      // Reset wallet state
      authStore.resetWalletState()

      expect(authStore.isWalletConnected).toBe(false)
      expect(authStore.walletAddress).toBe(null)
      expect(authStore.chainId).toBe(null)
      expect(authStore.isWalletConnecting).toBe(false)
      expect(authStore.hasInitializedWallet).toBe(false)
    })

    it('should reset initialization state (lines 178-180)', () => {
      // Set up initialization state
      authStore.hasInitializedWallet = true
      authStore.hasInitializedFirebase = true

      // Reset initialization
      authStore.resetInitialization()

      expect(authStore.hasInitializedWallet).toBe(false)
      expect(authStore.hasInitializedFirebase).toBe(false)
      expect(mockConsoleLog).toHaveBeenCalledWith('🔄 Initialization state reset')
    })
  })

  describe('Helper Methods', () => {
    it('should check if authenticating for specific wallet (line 185)', () => {
      // Test when not authenticating (no lock acquired)
      expect(authStore.isAuthenticatingForWallet('0x123456789abcdef')).toBe(false)

      // Set up authentication state by acquiring lock
      authStore.acquireAuthLock('0x123456789ABCDEF')

      // Test case-insensitive matching when authenticating
      expect(authStore.isAuthenticating).toBe(true) // Computed from authLock.isLocked
      expect(authStore.isAuthenticatingForWallet('0x123456789abcdef')).toBe(true)
      expect(authStore.isAuthenticatingForWallet('0x123456789ABCDEF')).toBe(true)
      expect(authStore.isAuthenticatingForWallet('0xdifferentaddress')).toBe(false)

      // Test when lock is released
      authStore.releaseAuthLock()
      expect(authStore.isAuthenticating).toBe(false)
      expect(authStore.isAuthenticatingForWallet('0x123456789abcdef')).toBe(false)
    })
  })

  describe('Computed Properties', () => {
    it('should compute isFullyInitialized correctly', () => {
      // Initially both false
      expect(authStore.isFullyInitialized).toBe(false)

      // Only wallet initialized
      authStore.hasInitializedWallet = true
      expect(authStore.isFullyInitialized).toBe(false)

      // Only Firebase initialized
      authStore.hasInitializedWallet = false
      authStore.hasInitializedFirebase = true
      expect(authStore.isFullyInitialized).toBe(false)

      // Both initialized
      authStore.hasInitializedWallet = true
      authStore.hasInitializedFirebase = true
      expect(authStore.isFullyInitialized).toBe(true)
    })
  })

  describe('Auth Lock State', () => {
    it('should manage auth lock state correctly', () => {
      expect(authStore.authLock.isLocked).toBe(false)
      expect(authStore.authLock.walletAddress).toBe(null)

      // Acquire lock
      const result = authStore.acquireAuthLock('0x123', 'test-request')
      expect(result).toBe(true)
      expect(authStore.authLock.isLocked).toBe(true)
      expect(authStore.authLock.walletAddress).toBe('0x123')
      expect(authStore.authLock.requestId).toBe('test-request')

      // Release lock
      authStore.releaseAuthLock()
      expect(authStore.authLock.isLocked).toBe(false)
      expect(authStore.authLock.walletAddress).toBe(null)
      expect(authStore.authLock.requestId).toBe(null)
    })
  })
})
