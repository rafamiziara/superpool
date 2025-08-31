/**
 * Tests for FirebaseAuthManager - comprehensive test suite for 100% coverage
 * 
 * This test file uses a robust mocking strategy to achieve complete coverage
 * of all code paths including Firebase integration and edge cases.
 */

// Mock dependencies FIRST before any imports
const mockOnAuthStateChanged = jest.fn()
const mockUnsubscribe = jest.fn()
const mockValidateWallet = jest.fn()
const mockConsoleLog = jest.fn()
const mockConsoleWarn = jest.fn()

// Store the Firebase auth callback for manual triggering
let authStateCallback: ((user: any) => void) | null = null

// Clear setupTests.ts mock for this specific test
jest.unmock('./firebaseAuthManager')

// Comprehensive Firebase auth mocking
jest.doMock('firebase/auth', () => {
  const mockOnAuthStateChangedImpl = jest.fn().mockImplementation((auth, callback) => {
    // Store the callback so we can trigger it manually
    authStateCallback = callback
    // Call callback immediately with null (initial state)
    callback(null)
    // Return unsubscribe function
    return mockUnsubscribe
  })
  
  return {
    onAuthStateChanged: mockOnAuthStateChangedImpl,
    User: {},
    signInWithCustomToken: jest.fn(),
    signOut: jest.fn(),
  }
})

// Mock Firebase config
jest.doMock('../firebase.config', () => ({
  FIREBASE_AUTH: { currentUser: null },
}))

// Mock ValidationUtils
jest.doMock('./ValidationUtils', () => ({
  ValidationUtils: {
    isValidWalletAddress: mockValidateWallet,
  },
}))

// Mock console methods to test logging
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(mockConsoleLog)
  jest.spyOn(console, 'warn').mockImplementation(mockConsoleWarn)
})

afterAll(() => {
  jest.restoreAllMocks()
})

// Import after mocking - use require to ensure mocks are applied
const { firebaseAuthManager } = require('./firebaseAuthManager')

describe('FirebaseAuthManager Complete Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockConsoleLog.mockClear()
    mockConsoleWarn.mockClear()
    
    // Reset manager state
    ;(firebaseAuthManager as any).isInitialized = false
    ;(firebaseAuthManager as any).listeners = new Set()
    ;(firebaseAuthManager as any).unsubscribe = null
    ;(firebaseAuthManager as any).currentState = {
      user: null,
      isLoading: true,
      isAuthenticated: false,
      walletAddress: null,
    }
    
    // Reset callback storage
    authStateCallback = null
    
    // Setup default mock behavior
    mockValidateWallet.mockReturnValue(true)
    mockOnAuthStateChanged.mockImplementation((auth, callback) => {
      authStateCallback = callback
      callback(null)
      return mockUnsubscribe
    })
  })

  describe('Core Functionality', () => {
    it('should initialize Firebase auth listener on first addListener call', () => {
      const listener = jest.fn()
      
      firebaseAuthManager.addListener(listener)
      
      // Should log initialization (line 48)
      expect(mockConsoleLog).toHaveBeenCalledWith('🔥 Initializing global Firebase auth manager...')
      
      // Should call listener with initial state (lines 81, 64-66)
      expect(listener).toHaveBeenCalledWith({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        walletAddress: null,
      })
      
      // Verify manager is initialized
      expect((firebaseAuthManager as any).isInitialized).toBe(true)
    })

    it('should not reinitialize when already initialized (line 45)', () => {
      // First initialization
      firebaseAuthManager.addListener(jest.fn())
      expect(mockConsoleLog).toHaveBeenCalledWith('🔥 Initializing global Firebase auth manager...')
      mockConsoleLog.mockClear()
      
      // Second call - should hit early return on line 45
      firebaseAuthManager.addListener(jest.fn())
      expect(mockConsoleLog).not.toHaveBeenCalledWith('🔥 Initializing global Firebase auth manager...') // No additional initialization log
    })

    it('should remove specific listener when unsubscribe is called (lines 84-85)', () => {
      const listener1 = jest.fn()
      const listener2 = jest.fn()
      
      const unsubscribe1 = firebaseAuthManager.addListener(listener1)
      firebaseAuthManager.addListener(listener2)
      
      expect((firebaseAuthManager as any).listeners.size).toBe(2)
      
      // Test the cleanup function returned by addListener (line 84-85)
      unsubscribe1()
      
      expect((firebaseAuthManager as any).listeners.size).toBe(1)
      
      // Trigger auth state change to verify only listener2 gets called
      if (authStateCallback) {
        listener1.mockClear()
        listener2.mockClear()
        
        const testUser = { uid: '0x1234567890123456789012345678901234567890' }
        authStateCallback(testUser)
        
        expect(listener1).not.toHaveBeenCalled() // Removed listener
        expect(listener2).toHaveBeenCalled() // Active listener
      }
    })

    it('should cleanup Firebase subscription and reset state (lines 103-108)', () => {
      // Initialize by adding a listener
      firebaseAuthManager.addListener(jest.fn())
      
      // Verify it's initialized
      expect((firebaseAuthManager as any).isInitialized).toBe(true)
      expect((firebaseAuthManager as any).listeners.size).toBe(1)
      expect((firebaseAuthManager as any).unsubscribe).toBe(mockUnsubscribe)
      
      // Test cleanup method (lines 103-108)
      firebaseAuthManager.cleanup()
      
      // Should log cleanup (line 104)
      expect(mockConsoleLog).toHaveBeenCalledWith('🧹 Cleaning up global Firebase auth manager')
      
      // Should call unsubscribe function (line 105)
      expect(mockUnsubscribe).toHaveBeenCalled()
      
      // Should reset all state (lines 106-108)
      expect((firebaseAuthManager as any).unsubscribe).toBe(null)
      expect((firebaseAuthManager as any).isInitialized).toBe(false)
      expect((firebaseAuthManager as any).listeners.size).toBe(0)
    })

    it('should handle cleanup when not initialized', () => {
      // Should not throw when cleanup called without initialization
      expect(() => {
        firebaseAuthManager.cleanup()
      }).not.toThrow()
      
      // Should not log or call unsubscribe
      expect(mockConsoleLog).not.toHaveBeenCalled()
      expect(mockUnsubscribe).not.toHaveBeenCalled()
    })
  })

  describe('Auth State Change Callback Coverage (lines 51-69)', () => {
    it('should handle user sign-in with valid wallet address', () => {
      const listener = jest.fn()
      firebaseAuthManager.addListener(listener)
      
      mockValidateWallet.mockReturnValue(true)
      
      // Clear initial calls
      listener.mockClear()
      mockConsoleLog.mockClear()
      
      // Trigger auth state change callback (lines 51-69)
      const testUser = { 
        uid: '0x1234567890123456789012345678901234567890',
        email: 'test@example.com'
      }
      
      if (authStateCallback) {
        authStateCallback(testUser)
        
        // Should log auth state change (lines 51-54)
        expect(mockConsoleLog).toHaveBeenCalledWith('🔥 Firebase auth state changed:', {
          uid: testUser.uid,
          isAuthenticated: true,
        })
        
        // Should update currentState (lines 56-61)
        const currentState = firebaseAuthManager.getCurrentState()
        expect(currentState).toEqual({
          user: testUser,
          isLoading: false,
          isAuthenticated: true,
          walletAddress: '0x1234567890123456789012345678901234567890',
        })
        
        // Should notify listeners (lines 64-66)
        expect(listener).toHaveBeenCalledWith(currentState)
      }
    })

    it('should handle user sign-out', () => {
      const listener = jest.fn()
      firebaseAuthManager.addListener(listener)
      
      listener.mockClear()
      mockConsoleLog.mockClear()
      
      // Trigger sign-out (null user)
      if (authStateCallback) {
        authStateCallback(null)
        
        // Should log sign-out (lines 51-54)
        expect(mockConsoleLog).toHaveBeenCalledWith('🔥 Firebase auth state changed:', {
          uid: undefined,
          isAuthenticated: false,
        })
        
        // Should update to signed-out state (lines 56-61)
        expect(listener).toHaveBeenCalledWith({
          user: null,
          isLoading: false,
          isAuthenticated: false,
          walletAddress: null,
        })
      }
    })

    it('should handle user with undefined uid', () => {
      const listener = jest.fn()
      firebaseAuthManager.addListener(listener)
      
      listener.mockClear()
      
      // Trigger with user that has no uid
      if (authStateCallback) {
        const userWithoutUid = { email: 'test@example.com' }
        authStateCallback(userWithoutUid)
        
        // Should extract null wallet address (lines 12-22)
        expect(listener).toHaveBeenCalledWith({
          user: userWithoutUid,
          isLoading: false,
          isAuthenticated: true,
          walletAddress: null,
        })
      }
    })

    it('should notify multiple listeners simultaneously (lines 64-66)', () => {
      const listener1 = jest.fn()
      const listener2 = jest.fn()
      const listener3 = jest.fn()
      
      firebaseAuthManager.addListener(listener1)
      firebaseAuthManager.addListener(listener2) 
      firebaseAuthManager.addListener(listener3)
      
      // Clear initial calls
      listener1.mockClear()
      listener2.mockClear()
      listener3.mockClear()
      
      // Trigger state change
      if (authStateCallback) {
        const testUser = { uid: '0x1111111111111111111111111111111111111111' }
        authStateCallback(testUser)
        
        // All listeners should be notified (forEach on line 64)
        expect(listener1).toHaveBeenCalled()
        expect(listener2).toHaveBeenCalled()
        expect(listener3).toHaveBeenCalled()
        
        // All should receive the same state
        const expectedState = {
          user: testUser,
          isLoading: false,
          isAuthenticated: true,
          walletAddress: '0x1111111111111111111111111111111111111111',
        }
        
        expect(listener1).toHaveBeenCalledWith(expectedState)
        expect(listener2).toHaveBeenCalledWith(expectedState)
        expect(listener3).toHaveBeenCalledWith(expectedState)
      }
    })
  })

  describe('extractWalletAddress Coverage (lines 12-22)', () => {
    it('should extract valid wallet address from user UID', () => {
      mockValidateWallet.mockReturnValue(true)
      const listener = jest.fn()
      firebaseAuthManager.addListener(listener)
      
      listener.mockClear()
      
      if (authStateCallback) {
        const user = { uid: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' }
        authStateCallback(user)
        
        // Should call ValidationUtils.isValidWalletAddress
        expect(mockValidateWallet).toHaveBeenCalledWith(user.uid)
        
        // Should extract wallet address (return user.uid on line 22)
        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining({
            walletAddress: user.uid,
          })
        )
      }
    })

    it('should return null for null user (line 13)', () => {
      const listener = jest.fn()
      firebaseAuthManager.addListener(listener)
      
      listener.mockClear()
      
      if (authStateCallback) {
        // Test null user (line 12-13: if (!user?.uid))
        authStateCallback(null)
        
        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining({
            walletAddress: null,
          })
        )
      }
    })

    it('should return null for user without uid (line 13)', () => {
      const listener = jest.fn()
      firebaseAuthManager.addListener(listener)
      
      listener.mockClear()
      
      if (authStateCallback) {
        // Test user without uid (line 12-13: if (!user?.uid))
        authStateCallback({})
        
        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining({
            walletAddress: null,
          })
        )
      }
    })

    it('should handle invalid wallet address and log warning (lines 17-20)', () => {
      mockValidateWallet.mockReturnValue(false)
      const listener = jest.fn()
      firebaseAuthManager.addListener(listener)
      
      listener.mockClear()
      mockConsoleWarn.mockClear()
      
      if (authStateCallback) {
        const userWithInvalidUid = { uid: 'not-a-wallet-address' }
        authStateCallback(userWithInvalidUid)
        
        // Should validate the UID (line 17)
        expect(mockValidateWallet).toHaveBeenCalledWith('not-a-wallet-address')
        
        // Should log security warning (line 18)
        expect(mockConsoleWarn).toHaveBeenCalledWith('🚨 Security: Firebase UID does not match valid wallet address format')
        
        // Should return null (line 19)
        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining({
            walletAddress: null,
          })
        )
      }
    })
  })

  describe('getCurrentState Method', () => {
    it('should return current state synchronously', () => {
      const initialState = firebaseAuthManager.getCurrentState()
      
      expect(initialState).toEqual({
        user: null,
        isLoading: true,
        isAuthenticated: false,
        walletAddress: null,
      })
    })

    it('should return updated state after auth change', () => {
      firebaseAuthManager.addListener(jest.fn())
      
      if (authStateCallback) {
        const testUser = { uid: '0x9999999999999999999999999999999999999999' }
        authStateCallback(testUser)
        
        const currentState = firebaseAuthManager.getCurrentState()
        expect(currentState).toEqual({
          user: testUser,
          isLoading: false,
          isAuthenticated: true,
          walletAddress: '0x9999999999999999999999999999999999999999',
        })
      }
    })
  })

  describe('Edge Cases and Error Scenarios', () => {
    it('should handle rapid successive state changes', () => {
      const listener = jest.fn()
      firebaseAuthManager.addListener(listener)
      
      if (authStateCallback) {
        // Clear initial call
        listener.mockClear()
        
        // Rapid state changes
        authStateCallback({ uid: '0x1111' })
        authStateCallback(null)
        authStateCallback({ uid: '0x2222' })
        authStateCallback({ uid: '0x3333' })
        
        // Should handle all changes
        expect(listener).toHaveBeenCalledTimes(4)
        
        // Final state should be the last one
        const finalState = firebaseAuthManager.getCurrentState()
        expect(finalState.user.uid).toBe('0x3333')
      }
    })


    it('should maintain singleton behavior', () => {
      // Import again to verify singleton
      const { firebaseAuthManager: secondInstance } = require('./firebaseAuthManager')
      
      expect(secondInstance).toBe(firebaseAuthManager)
    })
  })
})