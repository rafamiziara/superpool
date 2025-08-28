/**
 * Comprehensive test suite for useAuthenticationStateReadonly hook
 * Tests readonly state access and MobX reactivity
 */

import { runInAction } from 'mobx'
import { useAuthenticationStateReadonly } from './useAuthenticationStateReadonly'
import { createMockRootStore, renderHookWithStore } from '../../test-utils'
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

describe('useAuthenticationStateReadonly', () => {
  let mockStore: ReturnType<typeof createMockRootStore>

  beforeEach(() => {
    jest.clearAllMocks()
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
    })
  })

  describe('Initial State', () => {
    it('should return initial readonly state', () => {
      const { result } = renderHookWithStore(() => useAuthenticationStateReadonly(), { store: mockStore })

      expect(result.current).toEqual({
        authError: null,
        isAuthenticating: false,
        authWalletAddress: null,
        isFirebaseAuthenticated: false,
        isFirebaseLoading: false,
        _debug: null,
      })
    })
  })

  describe('Authentication Error State', () => {
    it('should reflect authentication errors from store', () => {
      const { result, rerender } = renderHookWithStore(() => useAuthenticationStateReadonly(), { store: mockStore })

      expect(result.current.authError).toBeNull()

      runInAction(() => {
        mockStore.authenticationStore.authError = {
        name: 'AppError',
        message: 'Authentication failed',
        type: ErrorType.AUTHENTICATION_FAILED,
        userFriendlyMessage: 'Authentication failed'
      } as AppError
      })
      rerender({})

      expect(result.current.authError).toBe('Authentication failed')
    })

    it('should reactively update when auth error changes', () => {
      const { result, rerender } = renderHookWithStore(() => useAuthenticationStateReadonly(), { store: mockStore })

      // Set initial error
      runInAction(() => {
        mockStore.authenticationStore.authError = {
        name: 'AppError',
        message: 'Network error',
        type: ErrorType.NETWORK_ERROR,
        userFriendlyMessage: 'Network error'
      } as AppError
      })
      rerender({})

      expect(result.current.authError).toBe('Network error')

      // Change error
      runInAction(() => {
        mockStore.authenticationStore.authError = {
        name: 'AppError',
        message: 'Signature rejected',
        type: ErrorType.SIGNATURE_REJECTED,
        userFriendlyMessage: 'Signature rejected'
      } as AppError
      })
      rerender({})

      expect(result.current.authError).toBe('Signature rejected')

      // Clear error
      runInAction(() => {
        mockStore.authenticationStore.authError = null
      })
      rerender({})

      expect(result.current.authError).toBeNull()
    })
  })

  describe('Authentication Status State', () => {
    it('should reflect authentication status from store', () => {
      const { result, rerender } = renderHookWithStore(() => useAuthenticationStateReadonly(), { store: mockStore })

      expect(result.current.isAuthenticating).toBe(false)

      runInAction(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          isLocked: true
        }
      })
      rerender({})

      expect(result.current.isAuthenticating).toBe(true)
    })

    it('should combine store and Firebase loading states', () => {
      const { result, rerender } = renderHookWithStore(() => useAuthenticationStateReadonly(), { store: mockStore })

      // Initially not loading
      expect(result.current.isAuthenticating).toBe(false)

      // Store authenticating
      runInAction(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          isLocked: true
        }
      })
      rerender({})

      expect(result.current.isAuthenticating).toBe(true)

      // Store done but Firebase loading
      runInAction(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          isLocked: false
        }
      })
      mockFirebaseAuth.isLoading = true
      rerender({})

      expect(result.current.isAuthenticating).toBe(true)

      // Both done
      mockFirebaseAuth.isLoading = false
      rerender({})

      expect(result.current.isAuthenticating).toBe(false)
    })
  })

  describe('Wallet Address State', () => {
    it('should reflect authenticated wallet address from store', () => {
      const { result, rerender } = renderHookWithStore(() => useAuthenticationStateReadonly(), { store: mockStore })

      expect(result.current.authWalletAddress).toBeNull()

      const walletAddress = '0x1234567890123456789012345678901234567890'
      runInAction(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          walletAddress
        }
      })
      rerender({})

      expect(result.current.authWalletAddress).toBe(walletAddress)
    })

    it('should prioritize Firebase wallet address over store address', () => {
      const { result, rerender } = renderHookWithStore(() => useAuthenticationStateReadonly(), { store: mockStore })

      const storeAddress = '0x1111111111111111111111111111111111111111'
      const firebaseAddress = '0x2222222222222222222222222222222222222222'

      // Set store address first
      runInAction(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          walletAddress: storeAddress
        }
      })
      rerender({})

      expect(result.current.authWalletAddress).toBe(storeAddress)

      // Set Firebase address - should take priority
      mockFirebaseAuth.walletAddress = firebaseAddress
      rerender({})

      expect(result.current.authWalletAddress).toBe(firebaseAddress)
    })

    it('should fallback to store address when Firebase has none', () => {
      const { result, rerender } = renderHookWithStore(() => useAuthenticationStateReadonly(), { store: mockStore })

      const storeAddress = '0x1111111111111111111111111111111111111111'

      runInAction(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          walletAddress: storeAddress
        }
      })
      mockFirebaseAuth.walletAddress = null
      rerender({})

      expect(result.current.authWalletAddress).toBe(storeAddress)
    })
  })

  describe('Firebase Authentication State', () => {
    it('should reflect Firebase authentication status', () => {
      const { result, rerender } = renderHookWithStore(() => useAuthenticationStateReadonly(), { store: mockStore })

      expect(result.current.isFirebaseAuthenticated).toBe(false)

      mockFirebaseAuth.isAuthenticated = true
      rerender({})

      expect(result.current.isFirebaseAuthenticated).toBe(true)
    })

    it('should reflect Firebase loading status', () => {
      const { result, rerender } = renderHookWithStore(() => useAuthenticationStateReadonly(), { store: mockStore })

      expect(result.current.isFirebaseLoading).toBe(false)

      mockFirebaseAuth.isLoading = true
      rerender({})

      expect(result.current.isFirebaseLoading).toBe(true)
    })
  })

  describe('Debug Information', () => {
    it('should provide debug info when wallet address exists', () => {
      const { result, rerender } = renderHookWithStore(() => useAuthenticationStateReadonly(), { store: mockStore })

      expect(result.current._debug).toBeNull()

      runInAction(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          walletAddress: '0x1234567890123456789012345678901234567890'
        }
      })
      rerender({})

      expect(result.current._debug).toEqual({ hasWalletAddress: true })
    })

    it('should clear debug info when wallet address is cleared', () => {
      const { result, rerender } = renderHookWithStore(() => useAuthenticationStateReadonly(), { store: mockStore })

      // Set address first
      runInAction(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          walletAddress: '0x1234567890123456789012345678901234567890'
        }
      })
      rerender({})

      expect(result.current._debug).toEqual({ hasWalletAddress: true })

      // Clear address
      runInAction(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          walletAddress: null
        }
      })
      rerender({})

      expect(result.current._debug).toBeNull()
    })
  })

  describe('MobX Reactivity', () => {
    it('should maintain reactivity across multiple state changes', () => {
      const { result, rerender } = renderHookWithStore(() => useAuthenticationStateReadonly(), { store: mockStore })

      // Initial state
      expect(result.current.isAuthenticating).toBe(false)
      expect(result.current.authError).toBeNull()
      expect(result.current.authWalletAddress).toBeNull()

      // First change batch
      runInAction(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          isLocked: true
        }
        mockStore.authenticationStore.authError = {
        name: 'AppError',
        message: 'Network error',
        type: ErrorType.NETWORK_ERROR,
        userFriendlyMessage: 'Network error'
      } as AppError
      })
      rerender({})

      expect(result.current.isAuthenticating).toBe(true)
      expect(result.current.authError).toBe('Network error')

      // Second change batch
      runInAction(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          walletAddress: '0x1234567890123456789012345678901234567890'
        }
        mockStore.authenticationStore.authError = null
      })
      rerender({})

      expect(result.current.authWalletAddress).toBe('0x1234567890123456789012345678901234567890')
      expect(result.current.authError).toBeNull()
      expect(result.current._debug).toEqual({ hasWalletAddress: true })
    })

    it('should handle rapid state changes', () => {
      const { result, rerender } = renderHookWithStore(() => useAuthenticationStateReadonly(), { store: mockStore })

      // Rapid state changes
      for (let i = 0; i < 5; i++) {
        runInAction(() => {
          mockStore.authenticationStore.authLock = {
            ...mockStore.authenticationStore.authLock,
            isLocked: i % 2 === 0
          }
          mockStore.authenticationStore.authError = i % 2 === 0 ? `Error ${i}` : null
        })
        rerender({})

        expect(result.current.isAuthenticating).toBe(i % 2 === 0)
        expect(result.current.authError).toBe(i % 2 === 0 ? `Error ${i}` : null)
      }
    })
  })

  describe('Readonly Behavior', () => {
    it('should not expose any mutation methods', () => {
      const { result } = renderHookWithStore(() => useAuthenticationStateReadonly(), { store: mockStore })

      // Should not have any methods - only state properties
      const keys = Object.keys(result.current)
      const methods = keys.filter(key => typeof result.current[key as keyof typeof result.current] === 'function')

      expect(methods).toHaveLength(0)
    })

    it('should only expose readonly state properties', () => {
      const { result } = renderHookWithStore(() => useAuthenticationStateReadonly(), { store: mockStore })

      const expectedKeys = [
        'authError',
        'isAuthenticating',
        'authWalletAddress',
        'isFirebaseAuthenticated',
        'isFirebaseLoading',
        '_debug'
      ]

      expect(Object.keys(result.current).sort()).toEqual(expectedKeys.sort())
    })
  })

  describe('Integration Scenarios', () => {
    it('should reflect complete authentication flow state changes', () => {
      const { result, rerender } = renderHookWithStore(() => useAuthenticationStateReadonly(), { store: mockStore })

      // Start authentication
      runInAction(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          isLocked: true
        }
        mockStore.authenticationStore.authError = null
      })
      rerender({})

      expect(result.current.isAuthenticating).toBe(true)
      expect(result.current.authError).toBeNull()

      // Authentication success
      runInAction(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          isLocked: false
        }
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          walletAddress: '0x1234567890123456789012345678901234567890'
        }
      })
      mockFirebaseAuth.isAuthenticated = true
      mockFirebaseAuth.walletAddress = '0x1234567890123456789012345678901234567890'
      rerender({})

      expect(result.current.isAuthenticating).toBe(false)
      expect(result.current.authError).toBeNull()
      expect(result.current.authWalletAddress).toBe('0x1234567890123456789012345678901234567890')
      expect(result.current.isFirebaseAuthenticated).toBe(true)
      expect(result.current._debug).toEqual({ hasWalletAddress: true })
    })

    it('should handle authentication logout flow', () => {
      const { result, rerender } = renderHookWithStore(() => useAuthenticationStateReadonly(), { store: mockStore })

      // Start with authenticated state
      runInAction(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          walletAddress: '0x1234567890123456789012345678901234567890'
        }
      })
      mockFirebaseAuth.isAuthenticated = true
      mockFirebaseAuth.walletAddress = '0x1234567890123456789012345678901234567890'
      rerender({})

      expect(result.current.authWalletAddress).toBe('0x1234567890123456789012345678901234567890')
      expect(result.current.isFirebaseAuthenticated).toBe(true)
      expect(result.current._debug).toEqual({ hasWalletAddress: true })

      // Logout - clear all state
      runInAction(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          walletAddress: null
        }
        mockStore.authenticationStore.authError = null
      })
      mockFirebaseAuth.isAuthenticated = false
      mockFirebaseAuth.walletAddress = null
      rerender({})

      expect(result.current.authWalletAddress).toBeNull()
      expect(result.current.isFirebaseAuthenticated).toBe(false)
      expect(result.current.authError).toBeNull()
      expect(result.current.isAuthenticating).toBe(false)
      expect(result.current._debug).toBeNull()
    })
  })

  describe('Edge Cases', () => {
    it('should handle undefined/null values gracefully', () => {
      const { result, rerender } = renderHookWithStore(() => useAuthenticationStateReadonly(), { store: mockStore })

      // Set to undefined/null explicitly
      runInAction(() => {
        mockStore.authenticationStore.authError = undefined as any
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          walletAddress: undefined as any
        }
      })
      mockFirebaseAuth.walletAddress = undefined as any
      rerender({})

      expect(result.current.authError).toBeUndefined()
      expect(result.current.authWalletAddress).toBeUndefined()
    })

    it('should handle empty string addresses', () => {
      const { result, rerender } = renderHookWithStore(() => useAuthenticationStateReadonly(), { store: mockStore })

      runInAction(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          walletAddress: ''
        }
      })
      rerender({})

      expect(result.current.authWalletAddress).toBe('')
      expect(result.current._debug).toBeNull() // Empty string is falsy
    })

    it('should prioritize truthy Firebase address over falsy store address', () => {
      const { result, rerender } = renderHookWithStore(() => useAuthenticationStateReadonly(), { store: mockStore })

      runInAction(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          walletAddress: ''
        }
      })
      mockFirebaseAuth.walletAddress = '0x1234567890123456789012345678901234567890'
      rerender({})

      expect(result.current.authWalletAddress).toBe('0x1234567890123456789012345678901234567890')
    })
  })
})