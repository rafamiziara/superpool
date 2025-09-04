import { signOut } from 'firebase/auth'
import { FirebaseCleanupManager } from './FirebaseCleanupManager'
import { FIREBASE_AUTH } from '../../../firebase.config'

// Mock Firebase Auth
jest.mock('firebase/auth', () => ({
  signOut: jest.fn(),
}))

// Mock Firebase config
jest.mock('../../../firebase.config', () => ({
  FIREBASE_AUTH: {
    currentUser: null,
  },
}))

describe('FirebaseCleanupManager', () => {
  let mockSignOut: jest.Mock
  let mockFirebaseAuth: { currentUser: unknown }

  beforeEach(() => {
    mockSignOut = signOut as jest.Mock
    mockFirebaseAuth = FIREBASE_AUTH as unknown as { currentUser: unknown }

    jest.clearAllMocks()

    // Reset Firebase Auth mock state
    mockFirebaseAuth.currentUser = null
  })

  describe('handleFirebaseCleanup', () => {
    describe('Success Scenarios', () => {
      beforeEach(() => {
        mockSignOut.mockResolvedValue(undefined)
      })

      it('should successfully sign out from Firebase', async () => {
        await FirebaseCleanupManager.handleFirebaseCleanup('test reason')

        expect(mockSignOut).toHaveBeenCalledWith(FIREBASE_AUTH)
        expect(mockSignOut).toHaveBeenCalledTimes(1)
      })

      it('should log appropriate messages during successful cleanup', async () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

        await FirebaseCleanupManager.handleFirebaseCleanup('wallet disconnection')

        expect(consoleSpy).toHaveBeenCalledWith('🔄 Initiating Firebase cleanup due to: wallet disconnection')
        expect(consoleSpy).toHaveBeenCalledWith('🚪 Signed out from Firebase due to wallet disconnection')
        expect(consoleSpy).toHaveBeenCalledTimes(2)

        consoleSpy.mockRestore()
      })

      it('should handle different cleanup reasons', async () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

        const reasons = ['authentication failure', 'session timeout', 'manual logout', 'security breach', 'wallet connection error']

        for (const reason of reasons) {
          consoleSpy.mockClear()

          await FirebaseCleanupManager.handleFirebaseCleanup(reason)

          expect(consoleSpy).toHaveBeenCalledWith(`🔄 Initiating Firebase cleanup due to: ${reason}`)
          expect(consoleSpy).toHaveBeenCalledWith(`🚪 Signed out from Firebase due to ${reason}`)
        }

        consoleSpy.mockRestore()
      })

      it('should complete cleanup within reasonable time', async () => {
        const start = performance.now()

        await FirebaseCleanupManager.handleFirebaseCleanup('performance test')

        const end = performance.now()
        expect(end - start).toBeLessThan(50)
      })
    })

    describe('Error Scenarios', () => {
      it('should handle Firebase signOut rejection', async () => {
        const signOutError = new Error('Firebase signOut failed')
        mockSignOut.mockRejectedValue(signOutError)

        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

        await expect(FirebaseCleanupManager.handleFirebaseCleanup('test reason')).rejects.toThrow(
          'Firebase cleanup failed: Firebase signOut failed'
        )

        expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Failed to sign out from Firebase:', signOutError)
        expect(mockSignOut).toHaveBeenCalledWith(FIREBASE_AUTH)

        consoleErrorSpy.mockRestore()
      })

      it('should handle non-Error signOut rejection', async () => {
        const signOutError = 'String error message'
        mockSignOut.mockRejectedValue(signOutError)

        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

        await expect(FirebaseCleanupManager.handleFirebaseCleanup('test reason')).rejects.toThrow(
          'Firebase cleanup failed: String error message'
        )

        expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Failed to sign out from Firebase:', signOutError)

        consoleErrorSpy.mockRestore()
      })

      it('should handle null/undefined error rejection', async () => {
        mockSignOut.mockRejectedValue(null)

        await expect(FirebaseCleanupManager.handleFirebaseCleanup('test reason')).rejects.toThrow('Firebase cleanup failed: null')
      })

      it('should handle complex error objects', async () => {
        const complexError = {
          code: 'auth/network-request-failed',
          message: 'Network request failed',
          customData: { requestId: '12345' },
        }
        mockSignOut.mockRejectedValue(complexError)

        await expect(FirebaseCleanupManager.handleFirebaseCleanup('test reason')).rejects.toThrow(
          'Firebase cleanup failed: [object Object]'
        )
      })

      it('should preserve original error information', async () => {
        const originalError = new Error('Original Firebase error')
        mockSignOut.mockRejectedValue(originalError)

        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

        await expect(FirebaseCleanupManager.handleFirebaseCleanup('test reason')).rejects.toThrow()

        expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Failed to sign out from Firebase:', originalError)

        consoleErrorSpy.mockRestore()
      })
    })

    describe('Concurrency and Multiple Calls', () => {
      beforeEach(() => {
        mockSignOut.mockResolvedValue(undefined)
      })

      it('should handle multiple simultaneous cleanup calls', async () => {
        const promises = Array.from({ length: 5 }, (_, i) => FirebaseCleanupManager.handleFirebaseCleanup(`concurrent test ${i}`))

        await Promise.all(promises)

        expect(mockSignOut).toHaveBeenCalledTimes(5)
      })

      it('should handle cleanup calls with different reasons simultaneously', async () => {
        const reasons = ['reason1', 'reason2', 'reason3', 'reason4', 'reason5']
        const promises = reasons.map((reason) => FirebaseCleanupManager.handleFirebaseCleanup(reason))

        await Promise.all(promises)

        expect(mockSignOut).toHaveBeenCalledTimes(5)
        reasons.forEach(() => {
          expect(mockSignOut).toHaveBeenCalledWith(FIREBASE_AUTH)
        })
      })

      it('should handle mixed success and failure scenarios', async () => {
        let callCount = 0
        mockSignOut.mockImplementation(() => {
          callCount++
          if (callCount <= 2) {
            return Promise.resolve(undefined)
          } else {
            return Promise.reject(new Error(`Call ${callCount} failed`))
          }
        })

        const promises = Array.from({ length: 5 }, (_, i) => FirebaseCleanupManager.handleFirebaseCleanup(`test ${i}`))

        const results = await Promise.allSettled(promises)

        expect(results.slice(0, 2).every((r) => r.status === 'fulfilled')).toBe(true)
        expect(results.slice(2).every((r) => r.status === 'rejected')).toBe(true)
      })
    })

    describe('Edge Cases', () => {
      it('should handle empty reason string', async () => {
        mockSignOut.mockResolvedValue(undefined)
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

        await FirebaseCleanupManager.handleFirebaseCleanup('')

        expect(consoleSpy).toHaveBeenCalledWith('🔄 Initiating Firebase cleanup due to: ')
        expect(consoleSpy).toHaveBeenCalledWith('🚪 Signed out from Firebase due to ')

        consoleSpy.mockRestore()
      })

      it('should handle very long reason strings', async () => {
        mockSignOut.mockResolvedValue(undefined)
        const longReason = 'A'.repeat(1000)

        await expect(FirebaseCleanupManager.handleFirebaseCleanup(longReason)).resolves.not.toThrow()

        expect(mockSignOut).toHaveBeenCalledWith(FIREBASE_AUTH)
      })

      it('should handle special characters in reason', async () => {
        mockSignOut.mockResolvedValue(undefined)
        const specialReason = 'Test with special chars: !@#$%^&*()_+{}|:"<>?[]\\;\',./'

        await expect(FirebaseCleanupManager.handleFirebaseCleanup(specialReason)).resolves.not.toThrow()
      })

      it('should handle unicode characters in reason', async () => {
        mockSignOut.mockResolvedValue(undefined)
        const unicodeReason = 'Test with unicode: 🔄🚪❌🎯🧹'

        await expect(FirebaseCleanupManager.handleFirebaseCleanup(unicodeReason)).resolves.not.toThrow()
      })
    })

    describe('Performance and Memory', () => {
      beforeEach(() => {
        mockSignOut.mockResolvedValue(undefined)
      })

      it('should handle multiple cleanup operations efficiently', async () => {
        const operations = Array.from({ length: 1000 }, (_, i) => FirebaseCleanupManager.handleFirebaseCleanup(`operation-${i}`))

        const start = performance.now()
        await Promise.all(operations)
        const end = performance.now()

        expect(end - start).toBeLessThan(1000) // Should complete within 1 second
        expect(mockSignOut).toHaveBeenCalledTimes(1000)
      })

      it('should not leak memory with repeated calls', async () => {
        const initialMemory = process.memoryUsage().heapUsed

        for (let i = 0; i < 100; i++) {
          await FirebaseCleanupManager.handleFirebaseCleanup(`memory-test-${i}`)
        }

        const finalMemory = process.memoryUsage().heapUsed
        const memoryIncrease = finalMemory - initialMemory

        // Memory increase should be reasonable for test environment
        expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024)
      })
    })
  })

  describe('isUserSignedIn', () => {
    it('should return false when no user is signed in', () => {
      mockFirebaseAuth.currentUser = null

      const result = FirebaseCleanupManager.isUserSignedIn()

      expect(result).toBe(false)
    })

    it('should return true when user is signed in', () => {
      mockFirebaseAuth.currentUser = {
        uid: 'test-user-id',
        email: 'test@example.com',
      }

      const result = FirebaseCleanupManager.isUserSignedIn()

      expect(result).toBe(true)
    })

    it('should handle undefined currentUser', () => {
      mockFirebaseAuth.currentUser = undefined

      const result = FirebaseCleanupManager.isUserSignedIn()

      expect(result).toBe(false)
    })

    it('should be consistent across multiple calls', () => {
      mockFirebaseAuth.currentUser = { uid: 'test-id' }

      const result1 = FirebaseCleanupManager.isUserSignedIn()
      const result2 = FirebaseCleanupManager.isUserSignedIn()
      const result3 = FirebaseCleanupManager.isUserSignedIn()

      expect(result1).toBe(true)
      expect(result2).toBe(true)
      expect(result3).toBe(true)
    })

    it('should reflect changes in authentication state', () => {
      // Start signed out
      mockFirebaseAuth.currentUser = null
      expect(FirebaseCleanupManager.isUserSignedIn()).toBe(false)

      // Sign in
      mockFirebaseAuth.currentUser = { uid: 'test-id' }
      expect(FirebaseCleanupManager.isUserSignedIn()).toBe(true)

      // Sign out again
      mockFirebaseAuth.currentUser = null
      expect(FirebaseCleanupManager.isUserSignedIn()).toBe(false)
    })
  })

  describe('getCurrentUserId', () => {
    it('should return null when no user is signed in', () => {
      mockFirebaseAuth.currentUser = null

      const result = FirebaseCleanupManager.getCurrentUserId()

      expect(result).toBeNull()
    })

    it('should return user ID when user is signed in', () => {
      const testUserId = 'test-user-123'
      mockFirebaseAuth.currentUser = {
        uid: testUserId,
        email: 'test@example.com',
      }

      const result = FirebaseCleanupManager.getCurrentUserId()

      expect(result).toBe(testUserId)
    })

    it('should return null when currentUser is undefined', () => {
      mockFirebaseAuth.currentUser = undefined

      const result = FirebaseCleanupManager.getCurrentUserId()

      expect(result).toBeNull()
    })

    it('should handle user object without uid', () => {
      mockFirebaseAuth.currentUser = {
        email: 'test@example.com',
        // Missing uid property
      }

      const result = FirebaseCleanupManager.getCurrentUserId()

      expect(result).toBeNull()
    })

    it('should handle user object with null uid', () => {
      mockFirebaseAuth.currentUser = {
        uid: null,
        email: 'test@example.com',
      }

      const result = FirebaseCleanupManager.getCurrentUserId()

      expect(result).toBeNull()
    })

    it('should handle user object with empty string uid', () => {
      mockFirebaseAuth.currentUser = {
        uid: '',
        email: 'test@example.com',
      }

      const result = FirebaseCleanupManager.getCurrentUserId()

      expect(result).toBeNull()
    })

    it('should return valid user IDs of different formats', () => {
      const userIds = ['simple-id', 'user-123-456', 'firebase-generated-uid-with-long-string-12345', 'special-chars_123']

      userIds.forEach((uid) => {
        mockFirebaseAuth.currentUser = { uid }

        const result = FirebaseCleanupManager.getCurrentUserId()

        expect(result).toBe(uid)
      })
    })
  })

  describe('Static Class Behavior', () => {
    it('should not be instantiable', () => {
      expect(() => new (FirebaseCleanupManager as unknown as new () => unknown)()).toThrow()
    })

    it('should have all methods as static', () => {
      expect(typeof FirebaseCleanupManager.handleFirebaseCleanup).toBe('function')
      expect(typeof FirebaseCleanupManager.isUserSignedIn).toBe('function')
      expect(typeof FirebaseCleanupManager.getCurrentUserId).toBe('function')

      // Ensure they're static (can be called on class)
      expect(FirebaseCleanupManager.handleFirebaseCleanup).toBe(FirebaseCleanupManager.handleFirebaseCleanup)
      expect(FirebaseCleanupManager.isUserSignedIn).toBe(FirebaseCleanupManager.isUserSignedIn)
      expect(FirebaseCleanupManager.getCurrentUserId).toBe(FirebaseCleanupManager.getCurrentUserId)
    })

    it('should maintain state independence between calls', () => {
      // Each method call should be independent and not affect others
      mockFirebaseAuth.currentUser = { uid: 'test-1' }
      const userId1 = FirebaseCleanupManager.getCurrentUserId()

      mockFirebaseAuth.currentUser = { uid: 'test-2' }
      const userId2 = FirebaseCleanupManager.getCurrentUserId()

      expect(userId1).toBe('test-1')
      expect(userId2).toBe('test-2')
    })
  })

  describe('Integration Scenarios', () => {
    it('should work correctly in authentication flow', async () => {
      // Start signed out
      mockFirebaseAuth.currentUser = null
      expect(FirebaseCleanupManager.isUserSignedIn()).toBe(false)
      expect(FirebaseCleanupManager.getCurrentUserId()).toBeNull()

      // Simulate sign in
      mockFirebaseAuth.currentUser = {
        uid: 'user-123',
        email: 'user@test.com',
      }
      expect(FirebaseCleanupManager.isUserSignedIn()).toBe(true)
      expect(FirebaseCleanupManager.getCurrentUserId()).toBe('user-123')

      // Perform cleanup (sign out)
      mockSignOut.mockResolvedValue(undefined)
      await FirebaseCleanupManager.handleFirebaseCleanup('test cleanup')

      // Simulate Firebase updating auth state after signOut
      mockFirebaseAuth.currentUser = null
      expect(FirebaseCleanupManager.isUserSignedIn()).toBe(false)
      expect(FirebaseCleanupManager.getCurrentUserId()).toBeNull()
    })

    it('should handle error recovery scenarios', async () => {
      mockFirebaseAuth.currentUser = { uid: 'error-user' }

      // First cleanup attempt fails
      mockSignOut.mockRejectedValueOnce(new Error('Network error'))

      await expect(FirebaseCleanupManager.handleFirebaseCleanup('first attempt')).rejects.toThrow('Firebase cleanup failed: Network error')

      // User should still be signed in after failed cleanup
      expect(FirebaseCleanupManager.isUserSignedIn()).toBe(true)

      // Second attempt succeeds
      mockSignOut.mockResolvedValue(undefined)
      await FirebaseCleanupManager.handleFirebaseCleanup('retry attempt')

      expect(mockSignOut).toHaveBeenCalledTimes(2)
    })

    it('should handle rapid state changes', async () => {
      const stateChanges = [{ uid: 'user1' }, null, { uid: 'user2' }, undefined, { uid: 'user3' }]

      for (let i = 0; i < stateChanges.length; i++) {
        mockFirebaseAuth.currentUser = stateChanges[i]

        const isSignedIn = FirebaseCleanupManager.isUserSignedIn()
        const userId = FirebaseCleanupManager.getCurrentUserId()

        if (stateChanges[i] && stateChanges[i]!.uid) {
          expect(isSignedIn).toBe(true)
          expect(userId).toBe(stateChanges[i]!.uid)
        } else {
          expect(isSignedIn).toBe(false)
          expect(userId).toBeNull()
        }
      }
    })
  })

  describe('Error Handling and Logging', () => {
    it('should not log unnecessarily during normal status checks', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

      mockFirebaseAuth.currentUser = { uid: 'test-user' }

      FirebaseCleanupManager.isUserSignedIn()
      FirebaseCleanupManager.getCurrentUserId()

      expect(consoleSpy).not.toHaveBeenCalled()
      expect(consoleWarnSpy).not.toHaveBeenCalled()
      expect(consoleErrorSpy).not.toHaveBeenCalled()

      consoleSpy.mockRestore()
      consoleWarnSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    })

    it('should provide clear error messages for different failure types', async () => {
      const errorTypes = [
        {
          error: new Error('Network timeout'),
          expectedMessage: 'Firebase cleanup failed: Network timeout',
        },
        {
          error: 'String error',
          expectedMessage: 'Firebase cleanup failed: String error',
        },
        {
          error: { code: 'auth/error' },
          expectedMessage: 'Firebase cleanup failed: [object Object]',
        },
        { error: null, expectedMessage: 'Firebase cleanup failed: null' },
        {
          error: undefined,
          expectedMessage: 'Firebase cleanup failed: undefined',
        },
      ]

      for (const { error, expectedMessage } of errorTypes) {
        mockSignOut.mockRejectedValueOnce(error)

        await expect(FirebaseCleanupManager.handleFirebaseCleanup('test')).rejects.toThrow(expectedMessage)
      }
    })
  })
})
