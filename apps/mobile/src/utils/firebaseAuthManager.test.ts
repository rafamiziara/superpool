import { FirebaseAuthManager } from './firebaseAuthManager'
import { ValidationUtils } from './ValidationUtils'

// Mock Firebase Auth
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

describe('FirebaseAuthManager', () => {
  let authManager: FirebaseAuthManager
  let mockValidationUtils: jest.Mocked<typeof ValidationUtils>

  beforeEach(() => {
    jest.clearAllMocks()
    
    // Reset Firebase Auth mock state
    mockFirebaseAuth.currentUser = null
    
    // Reset ValidationUtils mock
    mockValidationUtils = ValidationUtils as jest.Mocked<typeof ValidationUtils>
    mockValidationUtils.isValidWalletAddress.mockReturnValue(true)
    
    // Reset auth state changed mock
    mockOnAuthStateChanged.mockImplementation((auth, callback) => {
      // Store the callback for manual triggering
      ;(mockOnAuthStateChanged as any)._callback = callback
      // Return unsubscribe function
      return jest.fn()
    })

    authManager = FirebaseAuthManager.getInstance()
  })

  afterEach(() => {
    // Clean up singleton instance
    ;(FirebaseAuthManager as any)._instance = null
  })

  describe('Singleton Pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = FirebaseAuthManager.getInstance()
      const instance2 = FirebaseAuthManager.getInstance()
      
      expect(instance1).toBe(instance2)
      expect(instance1).toBeInstanceOf(FirebaseAuthManager)
    })

    it('should initialize Firebase auth listener on first getInstance call', () => {
      FirebaseAuthManager.getInstance()
      
      expect(mockOnAuthStateChanged).toHaveBeenCalledWith(
        mockFirebaseAuth,
        expect.any(Function)
      )
    })

    it('should not reinitialize listener on subsequent calls', () => {
      FirebaseAuthManager.getInstance()
      FirebaseAuthManager.getInstance()
      FirebaseAuthManager.getInstance()
      
      expect(mockOnAuthStateChanged).toHaveBeenCalledTimes(1)
    })
  })

  describe('Auth State Listener Management', () => {
    describe('Listener Registration', () => {
      it('should register auth state change listener', () => {
        const callback = jest.fn()
        const unsubscribe = authManager.subscribe(callback)
        
        expect(typeof unsubscribe).toBe('function')
        expect(authManager.getListenerCount()).toBe(1)
      })

      it('should support multiple listeners', () => {
        const callback1 = jest.fn()
        const callback2 = jest.fn()
        const callback3 = jest.fn()
        
        authManager.subscribe(callback1)
        authManager.subscribe(callback2)
        authManager.subscribe(callback3)
        
        expect(authManager.getListenerCount()).toBe(3)
      })

      it('should return unique unsubscribe functions for each listener', () => {
        const unsubscribe1 = authManager.subscribe(jest.fn())
        const unsubscribe2 = authManager.subscribe(jest.fn())
        
        expect(unsubscribe1).not.toBe(unsubscribe2)
        expect(typeof unsubscribe1).toBe('function')
        expect(typeof unsubscribe2).toBe('function')
      })
    })

    describe('Listener Unsubscription', () => {
      it('should remove listener when unsubscribe is called', () => {
        const callback = jest.fn()
        const unsubscribe = authManager.subscribe(callback)
        
        expect(authManager.getListenerCount()).toBe(1)
        
        unsubscribe()
        
        expect(authManager.getListenerCount()).toBe(0)
      })

      it('should only remove the specific listener that unsubscribed', () => {
        const callback1 = jest.fn()
        const callback2 = jest.fn()
        const callback3 = jest.fn()
        
        const unsubscribe1 = authManager.subscribe(callback1)
        authManager.subscribe(callback2)
        const unsubscribe3 = authManager.subscribe(callback3)
        
        expect(authManager.getListenerCount()).toBe(3)
        
        unsubscribe1()
        expect(authManager.getListenerCount()).toBe(2)
        
        unsubscribe3()
        expect(authManager.getListenerCount()).toBe(1)
      })

      it('should handle multiple unsubscribe calls gracefully', () => {
        const callback = jest.fn()
        const unsubscribe = authManager.subscribe(callback)
        
        unsubscribe()
        expect(authManager.getListenerCount()).toBe(0)
        
        // Should not throw or cause issues
        unsubscribe()
        unsubscribe()
        expect(authManager.getListenerCount()).toBe(0)
      })
    })

    describe('Listener Cleanup', () => {
      it('should remove all listeners when cleanup is called', () => {
        authManager.subscribe(jest.fn())
        authManager.subscribe(jest.fn())
        authManager.subscribe(jest.fn())
        
        expect(authManager.getListenerCount()).toBe(3)
        
        authManager.cleanup()
        
        expect(authManager.getListenerCount()).toBe(0)
      })

      it('should unsubscribe from Firebase auth when cleanup is called', () => {
        const mockUnsubscribe = jest.fn()
        mockOnAuthStateChanged.mockReturnValue(mockUnsubscribe)
        
        // Create fresh instance to capture new unsubscribe
        ;(FirebaseAuthManager as any)._instance = null
        const freshManager = FirebaseAuthManager.getInstance()
        
        freshManager.cleanup()
        
        expect(mockUnsubscribe).toHaveBeenCalled()
      })
    })
  })

  describe('Auth State Change Handling', () => {
    describe('User Sign In Events', () => {
      it('should notify listeners when user signs in with valid wallet address', () => {
        const callback = jest.fn()
        authManager.subscribe(callback)
        
        const user = {
          ...mockUser,
          uid: '0x1234567890123456789012345678901234567890',
        }
        
        mockValidationUtils.isValidWalletAddress.mockReturnValue(true)
        
        // Trigger auth state change
        const firebaseCallback = (mockOnAuthStateChanged as any)._callback
        firebaseCallback(user)
        
        expect(callback).toHaveBeenCalledWith({
          state: 'signed_in',
          walletAddress: '0x1234567890123456789012345678901234567890',
          user,
        })
      })

      it('should extract wallet address from different UID formats', () => {
        const callback = jest.fn()
        authManager.subscribe(callback)
        
        const testCases = [
          '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          '0x1111111111111111111111111111111111111111',
          '0x0000000000000000000000000000000000000000',
        ]
        
        testCases.forEach(walletAddress => {
          const user = { ...mockUser, uid: walletAddress }
          mockValidationUtils.isValidWalletAddress.mockReturnValue(true)
          
          const firebaseCallback = (mockOnAuthStateChanged as any)._callback
          firebaseCallback(user)
          
          expect(callback).toHaveBeenLastCalledWith({
            state: 'signed_in',
            walletAddress,
            user,
          })
        })
      })

      it('should handle invalid wallet addresses in UID', () => {
        const callback = jest.fn()
        authManager.subscribe(callback)
        
        const user = {
          ...mockUser,
          uid: 'invalid_uid_not_wallet_address',
        }
        
        mockValidationUtils.isValidWalletAddress.mockReturnValue(false)
        
        const firebaseCallback = (mockOnAuthStateChanged as any)._callback
        firebaseCallback(user)
        
        expect(callback).toHaveBeenCalledWith({
          state: 'signed_in',
          walletAddress: null,
          user,
        })
      })
    })

    describe('User Sign Out Events', () => {
      it('should notify listeners when user signs out', () => {
        const callback = jest.fn()
        authManager.subscribe(callback)
        
        // Trigger sign out (null user)
        const firebaseCallback = (mockOnAuthStateChanged as any)._callback
        firebaseCallback(null)
        
        expect(callback).toHaveBeenCalledWith({
          state: 'signed_out',
          walletAddress: null,
          user: null,
        })
      })

      it('should notify listeners when user is undefined', () => {
        const callback = jest.fn()
        authManager.subscribe(callback)
        
        // Trigger with undefined user
        const firebaseCallback = (mockOnAuthStateChanged as any)._callback
        firebaseCallback(undefined)
        
        expect(callback).toHaveBeenCalledWith({
          state: 'signed_out',
          walletAddress: null,
          user: null,
        })
      })
    })

    describe('Multiple Listener Notifications', () => {
      it('should notify all registered listeners of auth state changes', () => {
        const callback1 = jest.fn()
        const callback2 = jest.fn()
        const callback3 = jest.fn()
        
        authManager.subscribe(callback1)
        authManager.subscribe(callback2)
        authManager.subscribe(callback3)
        
        const user = {
          ...mockUser,
          uid: '0x1234567890123456789012345678901234567890',
        }
        
        const firebaseCallback = (mockOnAuthStateChanged as any)._callback
        firebaseCallback(user)
        
        const expectedCallData = {
          state: 'signed_in',
          walletAddress: '0x1234567890123456789012345678901234567890',
          user,
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
        
        authManager.subscribe(throwingCallback)
        authManager.subscribe(normalCallback)
        
        const user = { ...mockUser }
        
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
    describe('getCurrentAuthState', () => {
      it('should return current auth state when user is signed in', () => {
        mockFirebaseAuth.currentUser = {
          ...mockUser,
          uid: '0x1234567890123456789012345678901234567890',
        }
        
        const currentState = authManager.getCurrentAuthState()
        
        expect(currentState).toEqual({
          state: 'signed_in',
          walletAddress: '0x1234567890123456789012345678901234567890',
          user: mockFirebaseAuth.currentUser,
        })
      })

      it('should return signed out state when no user is signed in', () => {
        mockFirebaseAuth.currentUser = null
        
        const currentState = authManager.getCurrentAuthState()
        
        expect(currentState).toEqual({
          state: 'signed_out',
          walletAddress: null,
          user: null,
        })
      })

      it('should handle invalid wallet addresses in current user UID', () => {
        mockFirebaseAuth.currentUser = {
          ...mockUser,
          uid: 'invalid_wallet_uid',
        }
        
        mockValidationUtils.isValidWalletAddress.mockReturnValue(false)
        
        const currentState = authManager.getCurrentAuthState()
        
        expect(currentState).toEqual({
          state: 'signed_in',
          walletAddress: null,
          user: mockFirebaseAuth.currentUser,
        })
      })
    })

    describe('getCurrentWalletAddress', () => {
      it('should return wallet address when valid user is signed in', () => {
        mockFirebaseAuth.currentUser = {
          ...mockUser,
          uid: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        }
        
        const walletAddress = authManager.getCurrentWalletAddress()
        
        expect(walletAddress).toBe('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd')
      })

      it('should return null when no user is signed in', () => {
        mockFirebaseAuth.currentUser = null
        
        const walletAddress = authManager.getCurrentWalletAddress()
        
        expect(walletAddress).toBeNull()
      })

      it('should return null when user UID is not a valid wallet address', () => {
        mockFirebaseAuth.currentUser = {
          ...mockUser,
          uid: 'not_a_wallet_address',
        }
        
        mockValidationUtils.isValidWalletAddress.mockReturnValue(false)
        
        const walletAddress = authManager.getCurrentWalletAddress()
        
        expect(walletAddress).toBeNull()
      })
    })

    describe('isUserSignedIn', () => {
      it('should return true when user is signed in', () => {
        mockFirebaseAuth.currentUser = { ...mockUser }
        
        expect(authManager.isUserSignedIn()).toBe(true)
      })

      it('should return false when no user is signed in', () => {
        mockFirebaseAuth.currentUser = null
        
        expect(authManager.isUserSignedIn()).toBe(false)
      })

      it('should return false when user is undefined', () => {
        mockFirebaseAuth.currentUser = undefined as any
        
        expect(authManager.isUserSignedIn()).toBe(false)
      })
    })
  })

  describe('Wallet Address Extraction', () => {
    describe('extractWalletAddress', () => {
      it('should extract valid wallet addresses from UIDs', () => {
        const validUIDs = [
          '0x1234567890123456789012345678901234567890',
          '0xabcdefABCDEF1234567890abcdefABCDEF123456',
          '0x0000000000000000000000000000000000000000',
        ]
        
        validUIDs.forEach(uid => {
          mockValidationUtils.isValidWalletAddress.mockReturnValue(true)
          
          const extracted = authManager.extractWalletAddress(uid)
          
          expect(extracted).toBe(uid)
          expect(mockValidationUtils.isValidWalletAddress).toHaveBeenCalledWith(uid)
        })
      })

      it('should return null for invalid wallet addresses', () => {
        const invalidUIDs = [
          'regular_user_id',
          '0x123', // Too short
          'not_an_address',
          '',
          'user@example.com',
        ]
        
        invalidUIDs.forEach(uid => {
          mockValidationUtils.isValidWalletAddress.mockReturnValue(false)
          
          const extracted = authManager.extractWalletAddress(uid)
          
          expect(extracted).toBeNull()
        })
      })

      it('should handle null and undefined UIDs', () => {
        expect(authManager.extractWalletAddress(null as any)).toBeNull()
        expect(authManager.extractWalletAddress(undefined as any)).toBeNull()
      })
    })
  })

  describe('Integration with ValidationUtils', () => {
    it('should call ValidationUtils.isValidWalletAddress correctly', () => {
      const testUID = '0x1234567890123456789012345678901234567890'
      mockValidationUtils.isValidWalletAddress.mockReturnValue(true)
      
      authManager.extractWalletAddress(testUID)
      
      expect(mockValidationUtils.isValidWalletAddress).toHaveBeenCalledWith(testUID)
    })

    it('should respect ValidationUtils validation results', () => {
      const testUID = '0x1234567890123456789012345678901234567890'
      
      // Test when validation passes
      mockValidationUtils.isValidWalletAddress.mockReturnValue(true)
      expect(authManager.extractWalletAddress(testUID)).toBe(testUID)
      
      // Test when validation fails
      mockValidationUtils.isValidWalletAddress.mockReturnValue(false)
      expect(authManager.extractWalletAddress(testUID)).toBeNull()
    })
  })

  describe('Error Handling and Edge Cases', () => {
    it('should handle Firebase auth errors gracefully', () => {
      // Mock Firebase auth to throw error
      mockOnAuthStateChanged.mockImplementation(() => {
        throw new Error('Firebase auth error')
      })
      
      expect(() => {
        ;(FirebaseAuthManager as any)._instance = null
        FirebaseAuthManager.getInstance()
      }).not.toThrow()
    })

    it('should handle malformed user objects', () => {
      const callback = jest.fn()
      authManager.subscribe(callback)
      
      const malformedUsers = [
        { uid: null },
        { uid: undefined },
        {},
        { uid: 123 }, // Non-string UID
      ]
      
      malformedUsers.forEach(user => {
        const firebaseCallback = (mockOnAuthStateChanged as any)._callback
        firebaseCallback(user)
        
        expect(callback).toHaveBeenCalledWith(
          expect.objectContaining({
            walletAddress: null,
          })
        )
      })
    })

    it('should handle concurrent state changes', () => {
      const callback = jest.fn()
      authManager.subscribe(callback)
      
      const users = [
        { ...mockUser, uid: '0x1111111111111111111111111111111111111111' },
        { ...mockUser, uid: '0x2222222222222222222222222222222222222222' },
        null,
        { ...mockUser, uid: '0x3333333333333333333333333333333333333333' },
      ]
      
      const firebaseCallback = (mockOnAuthStateChanged as any)._callback
      
      // Trigger multiple state changes rapidly
      users.forEach(user => {
        firebaseCallback(user)
      })
      
      expect(callback).toHaveBeenCalledTimes(4)
      
      // Check last call
      expect(callback).toHaveBeenLastCalledWith({
        state: 'signed_in',
        walletAddress: '0x3333333333333333333333333333333333333333',
        user: users[3],
      })
    })
  })

  describe('Memory Management and Performance', () => {
    it('should not leak memory with many listener subscriptions/unsubscriptions', () => {
      const initialMemory = process.memoryUsage().heapUsed
      
      for (let i = 0; i < 1000; i++) {
        const unsubscribe = authManager.subscribe(jest.fn())
        unsubscribe()
      }
      
      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = finalMemory - initialMemory
      
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024) // Less than 50MB
      expect(authManager.getListenerCount()).toBe(0)
    })

    it('should handle rapid auth state changes efficiently', () => {
      const callback = jest.fn()
      authManager.subscribe(callback)
      
      const start = performance.now()
      
      const firebaseCallback = (mockOnAuthStateChanged as any)._callback
      
      // Trigger many state changes
      for (let i = 0; i < 100; i++) {
        const user = i % 2 === 0 
          ? { ...mockUser, uid: `0x${i.toString().padStart(40, '0')}` }
          : null
        firebaseCallback(user)
      }
      
      const end = performance.now()
      expect(end - start).toBeLessThan(100) // Should be fast
      expect(callback).toHaveBeenCalledTimes(100)
    })
  })

  describe('Singleton Lifecycle Management', () => {
    it('should maintain state across getInstance calls', () => {
      const instance1 = FirebaseAuthManager.getInstance()
      const callback = jest.fn()
      
      instance1.subscribe(callback)
      expect(instance1.getListenerCount()).toBe(1)
      
      const instance2 = FirebaseAuthManager.getInstance()
      expect(instance2.getListenerCount()).toBe(1)
      expect(instance1).toBe(instance2)
    })

    it('should allow cleanup and re-initialization', () => {
      let instance = FirebaseAuthManager.getInstance()
      instance.subscribe(jest.fn())
      
      expect(instance.getListenerCount()).toBe(1)
      
      instance.cleanup()
      expect(instance.getListenerCount()).toBe(0)
      
      // Create new instance after cleanup
      ;(FirebaseAuthManager as any)._instance = null
      instance = FirebaseAuthManager.getInstance()
      
      expect(instance.getListenerCount()).toBe(0)
      expect(mockOnAuthStateChanged).toHaveBeenCalledTimes(2) // Should re-initialize
    })
  })
})