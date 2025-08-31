/**
 * Tests for FirebaseAuthManager - focused on getting 100% coverage
 * 
 * This is a simplified test file that focuses on coverage first, 
 * functionality second due to complex Firebase mocking requirements.
 */

// Clear the default mock from setupTests to avoid conflicts
jest.unmock('./firebaseAuthManager')

// Mock dependencies BEFORE any imports
const mockOnAuthStateChanged = jest.fn()
const mockUnsubscribe = jest.fn()
const mockValidateWallet = jest.fn()

// Need to completely re-mock the firebase/auth module to override setupTests
jest.resetModules()
jest.mock('firebase/auth', () => ({
  onAuthStateChanged: mockOnAuthStateChanged,
  User: {},
  signInWithCustomToken: jest.fn(),
  signOut: jest.fn(),
}))

// Mock Firebase config
jest.mock('../firebase.config', () => ({
  FIREBASE_AUTH: { currentUser: null },
}))

// Mock ValidationUtils
jest.mock('./ValidationUtils', () => ({
  ValidationUtils: {
    isValidWalletAddress: mockValidateWallet,
  },
}))

// Import after mocking
import { firebaseAuthManager } from './firebaseAuthManager'

describe('FirebaseAuthManager Coverage Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Reset the manager state for each test
    ;(firebaseAuthManager as any).isInitialized = false
    ;(firebaseAuthManager as any).listeners = new Set()
    ;(firebaseAuthManager as any).unsubscribe = null
    
    // Setup default mock behavior
    mockValidateWallet.mockReturnValue(true)
    mockOnAuthStateChanged.mockImplementation((auth, callback) => {
      // Call callback immediately with null user (signed out state)
      callback(null)
      return mockUnsubscribe
    })
  })

  describe('Basic Functionality', () => {
    it('should add a listener and initialize', () => {
      const listener = jest.fn()
      
      const unsubscribe = firebaseAuthManager.addListener(listener)
      
      expect(mockOnAuthStateChanged).toHaveBeenCalled()
      expect(listener).toHaveBeenCalledWith({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        walletAddress: null,
      })
      expect(typeof unsubscribe).toBe('function')
    })

    it('should not reinitialize when already initialized', () => {
      // First call
      firebaseAuthManager.addListener(jest.fn())
      expect(mockOnAuthStateChanged).toHaveBeenCalledTimes(1)
      
      // Second call should not call onAuthStateChanged again
      firebaseAuthManager.addListener(jest.fn())
      expect(mockOnAuthStateChanged).toHaveBeenCalledTimes(1)
    })

    it('should remove listener when unsubscribe is called', () => {
      const listener = jest.fn()
      const unsubscribe = firebaseAuthManager.addListener(listener)
      
      // Should have 1 listener
      expect((firebaseAuthManager as any).listeners.size).toBe(1)
      
      unsubscribe()
      
      // Should have 0 listeners
      expect((firebaseAuthManager as any).listeners.size).toBe(0)
    })

    it('should return current state', () => {
      const state = firebaseAuthManager.getCurrentState()
      
      expect(state).toEqual({
        user: null,
        isLoading: true,
        isAuthenticated: false,
        walletAddress: null,
      })
    })

    it('should cleanup and reset', () => {
      // Add a listener to initialize
      firebaseAuthManager.addListener(jest.fn())
      
      firebaseAuthManager.cleanup()
      
      expect(mockUnsubscribe).toHaveBeenCalled()
      expect((firebaseAuthManager as any).isInitialized).toBe(false)
      expect((firebaseAuthManager as any).listeners.size).toBe(0)
    })
  })

  describe('Auth State Changes', () => {
    it('should handle user sign in with valid wallet address', () => {
      const listener = jest.fn()
      mockValidateWallet.mockReturnValue(true)
      
      // Setup mock to call callback with user data
      mockOnAuthStateChanged.mockImplementation((auth, callback) => {
        const user = {
          uid: '0x1234567890123456789012345678901234567890',
        }
        callback(user)
        return mockUnsubscribe
      })
      
      firebaseAuthManager.addListener(listener)
      
      expect(listener).toHaveBeenCalledWith({
        user: expect.objectContaining({
          uid: '0x1234567890123456789012345678901234567890',
        }),
        isLoading: false,
        isAuthenticated: true,
        walletAddress: '0x1234567890123456789012345678901234567890',
      })
    })

    it('should handle user with invalid wallet address', () => {
      const listener = jest.fn()
      mockValidateWallet.mockReturnValue(false)
      
      mockOnAuthStateChanged.mockImplementation((auth, callback) => {
        const user = {
          uid: 'invalid_wallet_address',
        }
        callback(user)
        return mockUnsubscribe
      })
      
      firebaseAuthManager.addListener(listener)
      
      expect(listener).toHaveBeenCalledWith({
        user: expect.objectContaining({
          uid: 'invalid_wallet_address',
        }),
        isLoading: false,
        isAuthenticated: true,
        walletAddress: null,
      })
    })

    it('should handle user without uid', () => {
      const listener = jest.fn()
      
      mockOnAuthStateChanged.mockImplementation((auth, callback) => {
        const user = {}  // User without uid
        callback(user)
        return mockUnsubscribe
      })
      
      firebaseAuthManager.addListener(listener)
      
      expect(listener).toHaveBeenCalledWith({
        user: {},
        isLoading: false,
        isAuthenticated: true,
        walletAddress: null,
      })
    })

    it('should notify all listeners of state changes', () => {
      const listener1 = jest.fn()
      const listener2 = jest.fn()
      
      firebaseAuthManager.addListener(listener1)
      firebaseAuthManager.addListener(listener2)
      
      expect(listener1).toHaveBeenCalled()
      expect(listener2).toHaveBeenCalled()
    })
  })

  describe('Edge Cases', () => {
    it('should handle cleanup when not initialized', () => {
      expect(() => {
        firebaseAuthManager.cleanup()
      }).not.toThrow()
    })

    it('should handle multiple cleanup calls', () => {
      firebaseAuthManager.addListener(jest.fn())
      firebaseAuthManager.cleanup()
      
      expect(() => {
        firebaseAuthManager.cleanup()
      }).not.toThrow()
    })
  })
})