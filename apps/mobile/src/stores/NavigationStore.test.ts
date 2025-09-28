import { router } from 'expo-router'
import { mockFirebaseAuth, mockToast } from '../__tests__/mocks'
import { FIREBASE_AUTH } from '../config/firebase'
import { authStore } from './AuthStore'
import { NavigationStore } from './NavigationStore'

// Mock dependencies (not covered by global mocks)
jest.mock('expo-router', () => ({
  router: {
    replace: jest.fn(),
  },
}))

jest.mock('../config/firebase', () => ({
  FIREBASE_AUTH: {
    currentUser: null,
  },
}))

jest.mock('./AuthStore', () => ({
  authStore: {
    user: null,
    isAuthenticating: false,
    isWalletConnected: false,
    walletAddress: null,
    isFullyInitialized: false,
    hasInitializedWallet: false,
    hasInitializedFirebase: false,
    reset: jest.fn(),
  },
}))

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {})
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

// Mock setTimeout to make tests synchronous
jest.useFakeTimers()

describe('NavigationStore', () => {
  let navigationStore: NavigationStore
  const mockRouterReplace = router.replace as jest.Mock
  const mockSignOut = mockFirebaseAuth.signOut as jest.Mock
  // Use shared Toast mock
  const toastShowSpy = mockToast.show as jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    mockConsoleLog.mockClear()
    mockConsoleError.mockClear()

    // Reset FIREBASE_AUTH mock
    ;(FIREBASE_AUTH as { currentUser: { uid: string } | null }).currentUser = null

    // Reset authStore state
    Object.assign(authStore, {
      user: null,
      isAuthenticating: false,
      isWalletConnected: false,
      walletAddress: null,
      isFullyInitialized: false,
      hasInitializedWallet: false,
      hasInitializedFirebase: false,
    })

    navigationStore = new NavigationStore()

    // Fast-forward the setTimeout for initialization
    jest.advanceTimersByTime(100)
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.useFakeTimers()
  })

  afterAll(() => {
    mockConsoleLog.mockRestore()
    mockConsoleError.mockRestore()
    jest.useRealTimers()
  })

  describe('Initialization', () => {
    it('should initialize reactive navigation', () => {
      expect(mockConsoleLog).toHaveBeenCalledWith('🧭 NavigationStore: Reactive navigation initialized')
    })

    it('should wait for full initialization', () => {
      expect(mockConsoleLog).toHaveBeenCalledWith('🧭 NavigationStore: Waiting for initialization...', {
        walletInit: false,
        firebaseInit: false,
      })
    })
  })

  describe('Navigation Logic', () => {
    beforeEach(() => {
      // Set up fully initialized state
      Object.assign(authStore, {
        isFullyInitialized: true,
        hasInitializedWallet: true,
        hasInitializedFirebase: true,
      })
    })

    it('should skip navigation when authenticating', () => {
      Object.assign(authStore, {
        isAuthenticating: true,
      })

      // Trigger state change by updating authStore
      navigationStore['navigateBasedOnCurrentState']({
        user: null,
        isAuthenticating: true,
        isWalletConnected: false,
        walletAddress: null,
        isFullyInitialized: true,
      })

      expect(mockConsoleLog).toHaveBeenCalledWith('🧭 NavigationStore: Skipping navigation - auth in progress')
      expect(mockRouterReplace).not.toHaveBeenCalled()
    })

    it('should navigate to onboarding when wallet disconnected', () => {
      navigationStore['navigateBasedOnCurrentState']({
        user: null,
        isAuthenticating: false,
        isWalletConnected: false,
        walletAddress: null,
        isFullyInitialized: true,
      })

      expect(mockConsoleLog).toHaveBeenCalledWith('🧭 NavigationStore: Navigating to /onboarding - wallet disconnected')

      // Advance timer for navigation delay
      jest.advanceTimersByTime(50)
      expect(mockRouterReplace).toHaveBeenCalledWith('/onboarding')
    })

    it('should navigate to connecting when wallet connected but no user', () => {
      navigationStore['navigateBasedOnCurrentState']({
        user: null,
        isAuthenticating: false,
        isWalletConnected: true,
        walletAddress: '0x123',
        isFullyInitialized: true,
      })

      expect(mockConsoleLog).toHaveBeenCalledWith('🧭 NavigationStore: Navigating to /connecting - wallet connected, needs authentication')

      jest.advanceTimersByTime(50)
      expect(mockRouterReplace).toHaveBeenCalledWith('/connecting')
    })

    it('should navigate to dashboard when wallet connected and user authenticated', () => {
      const mockUser = { walletAddress: '0x123' }

      navigationStore['navigateBasedOnCurrentState']({
        user: mockUser,
        isAuthenticating: false,
        isWalletConnected: true,
        walletAddress: '0x123',
        isFullyInitialized: true,
      })

      expect(mockConsoleLog).toHaveBeenCalledWith(
        '🧭 NavigationStore: Navigating to /(auth)/dashboard - wallet connected and user authenticated: 0x123'
      )

      jest.advanceTimersByTime(50)
      expect(mockRouterReplace).toHaveBeenCalledWith('/(auth)/dashboard')
    })

    it('should handle navigation errors gracefully', () => {
      mockRouterReplace.mockImplementationOnce(() => {
        throw new Error('Navigation failed')
      })

      navigationStore['navigateBasedOnCurrentState']({
        user: null,
        isAuthenticating: false,
        isWalletConnected: false,
        walletAddress: null,
        isFullyInitialized: true,
      })

      jest.advanceTimersByTime(50)
      expect(mockConsoleError).toHaveBeenCalledWith('❌ NavigationStore: Navigation failed:', expect.any(Error))
    })
  })

  describe('Toast Notifications', () => {
    it('should show authentication successful toast', () => {
      const mockUser = {
        walletAddress: '0x123',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deviceId: 'test-device',
      }

      // First initialize
      navigationStore['handleToastNotifications']({ user: null, isAuthenticating: false }, undefined)

      // Then simulate authentication success
      navigationStore['handleToastNotifications']({ user: mockUser, isAuthenticating: false }, { user: null, isAuthenticating: false })

      expect(mockConsoleLog).toHaveBeenCalledWith('🎉 NavigationStore: Authentication successful')
      expect(toastShowSpy).toHaveBeenCalledWith({
        type: 'success',
        text1: 'Authentication Successful!',
        text2: 'Welcome to SuperPool',
        position: 'top',
        visibilityTime: 3000,
        topOffset: 60,
      })
    })

    it('should not show toast on initial render', () => {
      navigationStore['handleToastNotifications']({ user: null, isAuthenticating: false }, undefined)

      expect(toastShowSpy).not.toHaveBeenCalled()
    })
  })

  describe('Wallet State Changes', () => {
    it('should handle wallet disconnection', async () => {
      ;(FIREBASE_AUTH as { currentUser: { uid: string } | null }).currentUser = { uid: 'test' }

      await navigationStore['handleWalletDisconnection']()

      expect(authStore.reset).toHaveBeenCalled()
      expect(mockSignOut).toHaveBeenCalledWith(FIREBASE_AUTH)
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ NavigationStore: Firebase user signed out')
      expect(toastShowSpy).toHaveBeenCalledWith({
        type: 'info',
        text1: 'Wallet Disconnected',
        text2: 'You have been logged out',
        position: 'top',
        visibilityTime: 3000,
        topOffset: 60,
      })
    })

    it('should handle wallet disconnection without Firebase user', async () => {
      ;(FIREBASE_AUTH as { currentUser: { uid: string } | null }).currentUser = null

      await navigationStore['handleWalletDisconnection']()

      expect(authStore.reset).toHaveBeenCalled()
      expect(mockSignOut).not.toHaveBeenCalled()
      expect(toastShowSpy).toHaveBeenCalledWith({
        type: 'info',
        text1: 'Wallet Disconnected',
        text2: 'You have been logged out',
        position: 'top',
        visibilityTime: 3000,
        topOffset: 60,
      })
    })

    it('should handle Firebase signout errors during wallet disconnection', async () => {
      ;(FIREBASE_AUTH as { currentUser: { uid: string } | null }).currentUser = { uid: 'test' }
      mockSignOut.mockRejectedValueOnce(new Error('Signout failed'))

      await navigationStore['handleWalletDisconnection']()

      expect(mockConsoleError).toHaveBeenCalledWith('❌ NavigationStore: Firebase signout failed:', expect.any(Error))
      expect(authStore.reset).toHaveBeenCalled()
      expect(toastShowSpy).toHaveBeenCalled()
    })

    it('should handle wallet connection', () => {
      navigationStore['handleWalletConnection']()

      expect(mockConsoleLog).toHaveBeenCalledWith('🔗 NavigationStore: Handling wallet connection')
      expect(toastShowSpy).toHaveBeenCalledWith({
        type: 'success',
        text1: 'Wallet Connected!',
        text2: 'Starting authentication...',
        position: 'top',
        visibilityTime: 3000,
        topOffset: 60,
      })
    })

    it('should detect wallet disconnection state change', () => {
      const spy = jest.spyOn(navigationStore as NavigationStore & { handleWalletDisconnection: () => void }, 'handleWalletDisconnection')

      navigationStore['handleWalletStateChanges'](
        { isWalletConnected: false, walletAddress: null },
        { isWalletConnected: true, walletAddress: '0x123' }
      )

      expect(spy).toHaveBeenCalled()
    })

    it('should detect wallet connection state change', () => {
      const spy = jest.spyOn(navigationStore as NavigationStore & { handleWalletConnection: () => void }, 'handleWalletConnection')

      navigationStore['handleWalletStateChanges'](
        { isWalletConnected: true, walletAddress: '0x123' },
        { isWalletConnected: false, walletAddress: null }
      )

      expect(spy).toHaveBeenCalled()
    })

    it('should skip wallet state changes without previous state', () => {
      const disconnectionSpy = jest.spyOn(
        navigationStore as NavigationStore & { handleWalletDisconnection: () => void },
        'handleWalletDisconnection'
      )
      const connectionSpy = jest.spyOn(
        navigationStore as NavigationStore & { handleWalletConnection: () => void },
        'handleWalletConnection'
      )

      navigationStore['handleWalletStateChanges']({ isWalletConnected: false, walletAddress: null }, undefined)

      expect(disconnectionSpy).not.toHaveBeenCalled()
      expect(connectionSpy).not.toHaveBeenCalled()
    })
  })
})
