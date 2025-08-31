// Mock Firebase before importing anything else
const mockFirebaseAuth = {
  currentUser: null,
}

const mockOnAuthStateChanged = jest.fn()
const mockUser = {
  uid: '0x1234567890123456789012345678901234567890',
  email: null,
  isAnonymous: false,
}

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: mockOnAuthStateChanged,
  User: jest.fn(),
}))

jest.mock('../firebase.config', () => ({
  FIREBASE_AUTH: mockFirebaseAuth,
  FIREBASE_FIRESTORE: {},
  FIREBASE_FUNCTIONS: {},
}))

jest.mock('./ValidationUtils', () => ({
  ValidationUtils: {
    isValidWalletAddress: jest.fn(),
  },
}))

jest.mock('@superpool/types', () => ({
  FirebaseAuthState: {
    SIGNED_OUT: 'signed_out',
    SIGNED_IN: 'signed_in',
    UNKNOWN: 'unknown',
  },
}))

// Now import the modules after mocking
import { firebaseAuthManager } from './firebaseAuthManager'
import { ValidationUtils } from './ValidationUtils'


describe('FirebaseAuthManager', () => {
  let mockValidationUtils: jest.Mocked<typeof ValidationUtils>

  beforeEach(() => {
    jest.clearAllMocks()
    
    // Reset Firebase Auth mock state
    mockFirebaseAuth.currentUser = null
    
    // Reset ValidationUtils mock
    mockValidationUtils = ValidationUtils as jest.Mocked<typeof ValidationUtils>
    mockValidationUtils.isValidWalletAddress.mockReturnValue(true)
    
    // Reset auth state changed mock
    mockOnAuthStateChanged.mockClear()
    mockOnAuthStateChanged.mockImplementation((auth, callback) => {
      // Store the callback for manual triggering
      ;(mockOnAuthStateChanged as any)._callback = callback
      // Return unsubscribe function
      return jest.fn()
    })

    // Clean up any existing listeners if method exists
    if (typeof firebaseAuthManager.cleanup === 'function') {
      firebaseAuthManager.cleanup()
    }
    
    // Reset the internal state of the manager
    ;(firebaseAuthManager as any).isInitialized = false
    ;(firebaseAuthManager as any).listeners = new Set()
    ;(firebaseAuthManager as any).unsubscribe = null
  })

  afterEach(() => {
    // Clean up after each test if method exists
    if (typeof firebaseAuthManager.cleanup === 'function') {
      firebaseAuthManager.cleanup()
    }
  })

  describe('Singleton Pattern', () => {
    it('should provide a single global instance', () => {
      expect(firebaseAuthManager).toBeDefined()
      expect(typeof firebaseAuthManager.addListener).toBe('function')
      expect(typeof firebaseAuthManager.getCurrentState).toBe('function')
    })

    it('should initialize Firebase auth listener on first addListener call', () => {
      const callback = jest.fn()
      firebaseAuthManager.addListener(callback)
      
      expect(mockOnAuthStateChanged).toHaveBeenCalledWith(
        mockFirebaseAuth,
        expect.any(Function)
      )
    })

    it('should not reinitialize listener on subsequent addListener calls', () => {
      firebaseAuthManager.addListener(jest.fn())
      firebaseAuthManager.addListener(jest.fn())
      firebaseAuthManager.addListener(jest.fn())
      
      expect(mockOnAuthStateChanged).toHaveBeenCalledTimes(1)
    })
  })

  describe('Auth State Listener Management', () => {
    describe('Listener Registration', () => {
      it('should register auth state change listener', () => {
        const callback = jest.fn()
        const unsubscribe = firebaseAuthManager.addListener(callback)
        
        expect(typeof unsubscribe).toBe('function')
        // Verify callback was called with initial state
        expect(callback).toHaveBeenCalledWith(expect.objectContaining({
          user: null,
          isLoading: expect.any(Boolean),
          isAuthenticated: false,
          walletAddress: null,
        }))
      })

      it('should support multiple listeners', () => {
        const callback1 = jest.fn()
        const callback2 = jest.fn()
        const callback3 = jest.fn()
        
        firebaseAuthManager.addListener(callback1)
        firebaseAuthManager.addListener(callback2)
        firebaseAuthManager.addListener(callback3)
        
        // All callbacks should be called with initial state
        expect(callback1).toHaveBeenCalled()
        expect(callback2).toHaveBeenCalled()
        expect(callback3).toHaveBeenCalled()
      })

      it('should return unique unsubscribe functions for each listener', () => {
        const unsubscribe1 = firebaseAuthManager.addListener(jest.fn())
        const unsubscribe2 = firebaseAuthManager.addListener(jest.fn())
        
        expect(unsubscribe1).not.toBe(unsubscribe2)
        expect(typeof unsubscribe1).toBe('function')
        expect(typeof unsubscribe2).toBe('function')
      })
    })

    describe('Listener Unsubscription', () => {
      it('should remove listener when unsubscribe is called', () => {
        const callback1 = jest.fn()
        const callback2 = jest.fn()
        
        const unsubscribe1 = firebaseAuthManager.addListener(callback1)
        firebaseAuthManager.addListener(callback2)
        
        // Trigger auth state change to test listener removal
        const firebaseCallback = (mockOnAuthStateChanged as any)._callback
        const testUser = { ...mockUser, uid: '0x1234567890123456789012345678901234567890' }
        
        // Clear previous calls
        callback1.mockClear()
        callback2.mockClear()
        
        // Remove first listener
        unsubscribe1()
        
        // Trigger state change
        firebaseCallback(testUser)
        
        // Only callback2 should be called
        expect(callback1).not.toHaveBeenCalled()
        expect(callback2).toHaveBeenCalled()
      })

      it('should only remove the specific listener that unsubscribed', () => {
        const callback1 = jest.fn()
        const callback2 = jest.fn()
        const callback3 = jest.fn()
        
        const unsubscribe1 = firebaseAuthManager.addListener(callback1)
        firebaseAuthManager.addListener(callback2)
        const unsubscribe3 = firebaseAuthManager.addListener(callback3)
        
        // Clear initial calls
        callback1.mockClear()
        callback2.mockClear()
        callback3.mockClear()
        
        // Remove first and third listeners
        unsubscribe1()
        unsubscribe3()
        
        // Trigger state change
        const firebaseCallback = (mockOnAuthStateChanged as any)._callback
        const testUser = { ...mockUser, uid: '0x1234567890123456789012345678901234567890' }
        firebaseCallback(testUser)
        
        // Only callback2 should be called
        expect(callback1).not.toHaveBeenCalled()
        expect(callback2).toHaveBeenCalled()
        expect(callback3).not.toHaveBeenCalled()
      })

      it('should handle multiple unsubscribe calls gracefully', () => {
        const callback = jest.fn()
        const unsubscribe = firebaseAuthManager.addListener(callback)
        
        // Should not throw or cause issues
        expect(() => {
          unsubscribe()
          unsubscribe()
          unsubscribe()
        }).not.toThrow()
      })
    })

    describe('Listener Cleanup', () => {
      it('should remove all listeners when cleanup is called', () => {
        const callback1 = jest.fn()
        const callback2 = jest.fn()
        const callback3 = jest.fn()
        
        firebaseAuthManager.addListener(callback1)
        firebaseAuthManager.addListener(callback2)
        firebaseAuthManager.addListener(callback3)
        
        firebaseAuthManager.cleanup()
        
        // Clear previous calls
        callback1.mockClear()
        callback2.mockClear()
        callback3.mockClear()
        
        // Trigger state change after cleanup
        const firebaseCallback = (mockOnAuthStateChanged as any)._callback
        if (firebaseCallback) {
          const testUser = { ...mockUser, uid: '0x1234567890123456789012345678901234567890' }
          firebaseCallback(testUser)
          
          // No callbacks should be called after cleanup
          expect(callback1).not.toHaveBeenCalled()
          expect(callback2).not.toHaveBeenCalled()
          expect(callback3).not.toHaveBeenCalled()
        }
      })

      it('should unsubscribe from Firebase auth when cleanup is called', () => {
        const mockUnsubscribe = jest.fn()
        mockOnAuthStateChanged.mockReturnValue(mockUnsubscribe)
        
        // Add a listener to trigger initialization
        firebaseAuthManager.addListener(jest.fn())
        
        firebaseAuthManager.cleanup()
        
        expect(mockUnsubscribe).toHaveBeenCalled()
      })
    })
  })

  describe('Auth State Change Handling', () => {
    describe('User Sign In Events', () => {
      it('should notify listeners when user signs in with valid wallet address', () => {
        const callback = jest.fn()
        firebaseAuthManager.addListener(callback)
        
        const user = {
          ...mockUser,
          uid: '0x1234567890123456789012345678901234567890',
        }
        
        mockValidationUtils.isValidWalletAddress.mockReturnValue(true)
        
        // Clear initial call
        callback.mockClear()
        
        // Trigger auth state change
        const firebaseCallback = (mockOnAuthStateChanged as any)._callback
        firebaseCallback(user)
        
        expect(callback).toHaveBeenCalledWith({
          user,
          isLoading: false,
          isAuthenticated: true,
          walletAddress: '0x1234567890123456789012345678901234567890',
        })
      })

      it('should extract wallet address from different UID formats', () => {
        const callback = jest.fn()
        firebaseAuthManager.addListener(callback)
        
        const testCases = [
          '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          '0x1111111111111111111111111111111111111111',
          '0x0000000000000000000000000000000000000000',
        ]
        
        testCases.forEach(walletAddress => {
          const user = { ...mockUser, uid: walletAddress }
          mockValidationUtils.isValidWalletAddress.mockReturnValue(true)
          
          callback.mockClear()
          
          const firebaseCallback = (mockOnAuthStateChanged as any)._callback
          firebaseCallback(user)
          
          expect(callback).toHaveBeenCalledWith({
            user,
            isLoading: false,
            isAuthenticated: true,
            walletAddress,
          })
        })
      })

      it('should handle invalid wallet addresses in UID', () => {
        const callback = jest.fn()
        firebaseAuthManager.addListener(callback)
        
        const user = {
          ...mockUser,
          uid: 'invalid_uid_not_wallet_address',
        }
        
        mockValidationUtils.isValidWalletAddress.mockReturnValue(false)
        
        callback.mockClear()
        
        const firebaseCallback = (mockOnAuthStateChanged as any)._callback
        firebaseCallback(user)
        
        expect(callback).toHaveBeenCalledWith({
          user,
          isLoading: false,
          isAuthenticated: true,
          walletAddress: null,
        })
      })
    })

    describe('User Sign Out Events', () => {
      it('should notify listeners when user signs out', () => {
        const callback = jest.fn()
        firebaseAuthManager.addListener(callback)
        
        callback.mockClear()
        
        // Trigger sign out (null user)
        const firebaseCallback = (mockOnAuthStateChanged as any)._callback
        firebaseCallback(null)
        
        expect(callback).toHaveBeenCalledWith({
          user: null,
          isLoading: false,
          isAuthenticated: false,
          walletAddress: null,
        })
      })

      it('should notify listeners when user is undefined', () => {
        const callback = jest.fn()
        firebaseAuthManager.addListener(callback)
        
        callback.mockClear()
        
        // Trigger with undefined user
        const firebaseCallback = (mockOnAuthStateChanged as any)._callback
        firebaseCallback(undefined)
        
        expect(callback).toHaveBeenCalledWith({
          user: undefined,
          isLoading: false,
          isAuthenticated: false,
          walletAddress: null,
        })
      })
    })

    describe('Multiple Listener Notifications', () => {
      it('should notify all registered listeners of auth state changes', () => {
        const callback1 = jest.fn()
        const callback2 = jest.fn()
        const callback3 = jest.fn()
        
        firebaseAuthManager.addListener(callback1)
        firebaseAuthManager.addListener(callback2)
        firebaseAuthManager.addListener(callback3)
        
        const user = {
          ...mockUser,
          uid: '0x1234567890123456789012345678901234567890',
        }
        
        // Clear initial calls
        callback1.mockClear()
        callback2.mockClear()
        callback3.mockClear()
        
        const firebaseCallback = (mockOnAuthStateChanged as any)._callback
        firebaseCallback(user)
        
        const expectedCallData = {
          user,
          isLoading: false,
          isAuthenticated: true,
          walletAddress: '0x1234567890123456789012345678901234567890',
        }
        
        expect(callback1).toHaveBeenCalledWith(expectedCallData)
        expect(callback2).toHaveBeenCalledWith(expectedCallData)
        expect(callback3).toHaveBeenCalledWith(expectedCallData)
      })

      it('should handle listener exceptions gracefully', () => {
        const throwingCallback = jest.fn().mockImplementation(() => {
          throw new Error('Listener error')
        })
        const normalCallback = jest.fn()
        
        firebaseAuthManager.addListener(throwingCallback)
        firebaseAuthManager.addListener(normalCallback)
        
        const user = { ...mockUser }
        
        throwingCallback.mockClear()
        normalCallback.mockClear()
        
        expect(() => {
          const firebaseCallback = (mockOnAuthStateChanged as any)._callback
          firebaseCallback(user)
        }).not.toThrow()
        
        expect(throwingCallback).toHaveBeenCalled()
        expect(normalCallback).toHaveBeenCalled()
      })
    })
  })

  describe('Current State Access', () => {
    describe('getCurrentState', () => {
      it('should return initial state when no user is signed in', () => {
        const currentState = firebaseAuthManager.getCurrentState()
        
        expect(currentState).toEqual({
          user: null,
          isLoading: true,
          isAuthenticated: false,
          walletAddress: null,
        })
      })

      it('should return updated state after user signs in', () => {
        const callback = jest.fn()
        firebaseAuthManager.addListener(callback)
        
        const user = {
          ...mockUser,
          uid: '0x1234567890123456789012345678901234567890',
        }
        
        mockValidationUtils.isValidWalletAddress.mockReturnValue(true)
        
        // Trigger state change
        const firebaseCallback = (mockOnAuthStateChanged as any)._callback
        firebaseCallback(user)
        
        const currentState = firebaseAuthManager.getCurrentState()
        
        expect(currentState).toEqual({
          user,
          isLoading: false,
          isAuthenticated: true,
          walletAddress: '0x1234567890123456789012345678901234567890',
        })
      })

      it('should handle invalid wallet addresses in current user UID', () => {
        const callback = jest.fn()
        firebaseAuthManager.addListener(callback)
        
        const user = {
          ...mockUser,
          uid: 'invalid_wallet_uid',
        }
        
        mockValidationUtils.isValidWalletAddress.mockReturnValue(false)
        
        // Trigger state change
        const firebaseCallback = (mockOnAuthStateChanged as any)._callback
        firebaseCallback(user)
        
        const currentState = firebaseAuthManager.getCurrentState()
        
        expect(currentState).toEqual({
          user,
          isLoading: false,
          isAuthenticated: true,
          walletAddress: null,
        })
      })
    })

    describe('State Derivation', () => {
      it('should extract wallet address from current state', () => {
        const callback = jest.fn()
        firebaseAuthManager.addListener(callback)
        
        const user = {
          ...mockUser,
          uid: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        }
        
        mockValidationUtils.isValidWalletAddress.mockReturnValue(true)
        
        const firebaseCallback = (mockOnAuthStateChanged as any)._callback
        firebaseCallback(user)
        
        const currentState = firebaseAuthManager.getCurrentState()
        expect(currentState.walletAddress).toBe('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd')
        expect(currentState.isAuthenticated).toBe(true)
      })

      it('should indicate authentication status correctly', () => {
        const callback = jest.fn()
        firebaseAuthManager.addListener(callback)
        
        // Test signed out state
        let firebaseCallback = (mockOnAuthStateChanged as any)._callback
        firebaseCallback(null)
        
        let currentState = firebaseAuthManager.getCurrentState()
        expect(currentState.isAuthenticated).toBe(false)
        expect(currentState.user).toBe(null)
        
        // Test signed in state
        const user = { ...mockUser, uid: '0x1234567890123456789012345678901234567890' }
        firebaseCallback(user)
        
        currentState = firebaseAuthManager.getCurrentState()
        expect(currentState.isAuthenticated).toBe(true)
        expect(currentState.user).toBe(user)
      })
    })
  })

  describe('Wallet Address Validation Integration', () => {
    it('should use ValidationUtils to validate wallet addresses', () => {
      const callback = jest.fn()
      firebaseAuthManager.addListener(callback)
      
      const testUID = '0x1234567890123456789012345678901234567890'
      const user = { ...mockUser, uid: testUID }
      
      mockValidationUtils.isValidWalletAddress.mockReturnValue(true)
      
      const firebaseCallback = (mockOnAuthStateChanged as any)._callback
      firebaseCallback(user)
      
      expect(mockValidationUtils.isValidWalletAddress).toHaveBeenCalledWith(testUID)
      
      const currentState = firebaseAuthManager.getCurrentState()
      expect(currentState.walletAddress).toBe(testUID)
    })
    
    it('should handle validation failures correctly', () => {
      const callback = jest.fn()
      firebaseAuthManager.addListener(callback)
      
      const invalidUID = 'not_a_wallet_address'
      const user = { ...mockUser, uid: invalidUID }
      
      mockValidationUtils.isValidWalletAddress.mockReturnValue(false)
      
      const firebaseCallback = (mockOnAuthStateChanged as any)._callback
      firebaseCallback(user)
      
      expect(mockValidationUtils.isValidWalletAddress).toHaveBeenCalledWith(invalidUID)
      
      const currentState = firebaseAuthManager.getCurrentState()
      expect(currentState.walletAddress).toBeNull()
      expect(currentState.isAuthenticated).toBe(true) // Still authenticated, just no valid wallet
    })
  })


  describe('Error Handling and Edge Cases', () => {
    it('should handle Firebase auth errors gracefully', () => {
      // Mock Firebase auth to throw error
      mockOnAuthStateChanged.mockImplementation(() => {
        throw new Error('Firebase auth error')
      })
      
      expect(() => {
        firebaseAuthManager.cleanup()
        firebaseAuthManager.addListener(jest.fn())
      }).not.toThrow()
    })

    it('should handle malformed user objects', () => {
      const callback = jest.fn()
      firebaseAuthManager.addListener(callback)
      
      const malformedUsers = [
        { uid: null },
        { uid: undefined },
        {},
        { uid: 123 }, // Non-string UID
      ]
      
      malformedUsers.forEach(user => {
        callback.mockClear()
        
        const firebaseCallback = (mockOnAuthStateChanged as any)._callback
        firebaseCallback(user)
        
        expect(callback).toHaveBeenCalledWith(
          expect.objectContaining({
            walletAddress: null,
            isAuthenticated: true, // Still has user object
            user,
          })
        )
      })
    })

    it('should handle concurrent state changes', () => {
      const callback = jest.fn()
      firebaseAuthManager.addListener(callback)
      
      const users = [
        { ...mockUser, uid: '0x1111111111111111111111111111111111111111' },
        { ...mockUser, uid: '0x2222222222222222222222222222222222222222' },
        null,
        { ...mockUser, uid: '0x3333333333333333333333333333333333333333' },
      ]
      
      callback.mockClear() // Clear initial call
      
      const firebaseCallback = (mockOnAuthStateChanged as any)._callback
      
      // Trigger multiple state changes rapidly
      users.forEach(user => {
        firebaseCallback(user)
      })
      
      expect(callback).toHaveBeenCalledTimes(4)
      
      // Check last call
      expect(callback).toHaveBeenLastCalledWith({
        user: users[3],
        isLoading: false,
        isAuthenticated: true,
        walletAddress: '0x3333333333333333333333333333333333333333',
      })
    })
  })

  describe('Memory Management and Performance', () => {
    it('should not leak memory with many listener subscriptions/unsubscriptions', () => {
      const initialMemory = process.memoryUsage().heapUsed
      
      for (let i = 0; i < 100; i++) { // Reduced iterations for test speed
        const unsubscribe = firebaseAuthManager.addListener(jest.fn())
        unsubscribe()
      }
      
      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = finalMemory - initialMemory
      
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024) // Less than 10MB
    })

    it('should handle rapid auth state changes efficiently', () => {
      const callback = jest.fn()
      firebaseAuthManager.addListener(callback)
      
      callback.mockClear() // Clear initial call
      
      const start = performance.now()
      
      const firebaseCallback = (mockOnAuthStateChanged as any)._callback
      
      // Trigger many state changes
      for (let i = 0; i < 50; i++) { // Reduced for test speed
        const user = i % 2 === 0 
          ? { ...mockUser, uid: `0x${i.toString().padStart(40, '0')}` }
          : null
        firebaseCallback(user)
      }
      
      const end = performance.now()
      expect(end - start).toBeLessThan(100) // Should be fast
      expect(callback).toHaveBeenCalledTimes(50)
    })
  })

  describe('Lifecycle Management', () => {
    it('should maintain listener state across multiple addListener calls', () => {
      const callback1 = jest.fn()
      const callback2 = jest.fn()
      
      firebaseAuthManager.addListener(callback1)
      firebaseAuthManager.addListener(callback2)
      
      // Test that state changes notify both listeners
      callback1.mockClear()
      callback2.mockClear()
      
      const firebaseCallback = (mockOnAuthStateChanged as any)._callback
      const user = { ...mockUser, uid: '0x1234567890123456789012345678901234567890' }
      firebaseCallback(user)
      
      expect(callback1).toHaveBeenCalled()
      expect(callback2).toHaveBeenCalled()
    })

    it('should allow cleanup and re-initialization', () => {
      const callback = jest.fn()
      firebaseAuthManager.addListener(callback)
      
      // Trigger a state change to verify listener is active
      callback.mockClear()
      const firebaseCallback = (mockOnAuthStateChanged as any)._callback
      firebaseCallback({ ...mockUser })
      expect(callback).toHaveBeenCalled()
      
      firebaseAuthManager.cleanup()
      
      // After cleanup, listeners should not be called
      callback.mockClear()
      // Add new listener to re-initialize
      const newCallback = jest.fn()
      firebaseAuthManager.addListener(newCallback)
      
      expect(mockOnAuthStateChanged).toHaveBeenCalledTimes(2) // Should re-initialize
    })
  })
})