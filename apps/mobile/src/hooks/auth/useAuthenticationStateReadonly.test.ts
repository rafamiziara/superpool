/**
 * Comprehensive test suite for useAuthenticationStateReadonly hook
 * Tests readonly state access and MobX reactivity
 */

import { createMockRootStore, waitForMobX } from '@mocks/factories/testFactory'
import { createMockAuthenticationStore } from '@mocks/factories/storeFactory'
import { act, renderHook } from '@testing-library/react-native'
import { AppError, ErrorType } from '../../utils/errorHandling'
import { useAuthenticationStateReadonly } from './useAuthenticationStateReadonly'

import type { FirebaseAuthState } from '@superpool/types'
import { runInAction } from 'mobx'

// Create a mock Firebase auth state that can be controlled from tests
let mockFirebaseAuthState: FirebaseAuthState = {
  isAuthenticated: false,
  isLoading: false,
  walletAddress: null,
  user: null,
}

// Mock hook function that will be replaced in tests
let mockUseFirebaseAuth: () => FirebaseAuthState

jest.mock('./useFirebaseAuth', () => ({
  useFirebaseAuth: () => mockUseFirebaseAuth(),
}))

// Mock the useAuthenticationStore hook directly
let mockAuthenticationStore: ReturnType<typeof createMockAuthenticationStore> | null = null

jest.mock('../../stores', () => ({
  useAuthenticationStore: () => mockAuthenticationStore,
}))

// Helper function to update MobX state
const updateStore = async (updateFn: () => void) => {
  await act(async () => {
    runInAction(updateFn)
    await waitForMobX()
  })
}

describe('useAuthenticationStateReadonly', () => {
  let mockStore: ReturnType<typeof createMockRootStore>

  beforeEach(async () => {
    jest.clearAllMocks()
    mockStore = createMockRootStore()
    mockAuthenticationStore = mockStore.authenticationStore

    // Reset Firebase auth mock state
    mockFirebaseAuthState = {
      isAuthenticated: false,
      isLoading: false,
      walletAddress: null,
      user: null,
    }

    // Set up the mock function to return current state
    mockUseFirebaseAuth = () => mockFirebaseAuthState

    // Wait for MobX to settle
    await waitForMobX()
  })

  describe('Initial State', () => {
    it('should return initial readonly state', () => {
      const { result, rerender: _rerender } = renderHook(() => useAuthenticationStateReadonly())

      // Debug: Check what the hook is returning
      console.log('Hook result:', result.current)
      console.log('Mock store authError:', mockStore.authenticationStore.authError)
      console.log('Mock store isAuthenticating:', mockStore.authenticationStore.isAuthenticating)
      console.log('Mock store authWalletAddress:', mockStore.authenticationStore.authWalletAddress)
      console.log('Mock Firebase state:', mockFirebaseAuthState)

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
    it('should reflect authentication errors from store', async () => {
      const { result, rerender } = renderHook(() => useAuthenticationStateReadonly())

      console.log('Initial authError:', result.current.authError)
      expect(result.current.authError).toBeNull()

      await act(async () => {
        console.log('Setting error...')
        runInAction(() => {
          mockStore.authenticationStore.authError = {
            name: 'AppError',
            message: 'Authentication failed',
            type: ErrorType.AUTHENTICATION_FAILED,
            userFriendlyMessage: 'Authentication failed',
          } as AppError
        })
        console.log('After setting error, store has:', mockStore.authenticationStore.authError)
        await waitForMobX()
      })

      // Force a rerender to check for reactivity
      rerender({})

      console.log('After act and rerender, hook result:', result.current.authError)
      console.log('Store error after act:', mockStore.authenticationStore.authError)
      expect(result.current.authError).toBe('Authentication failed')
    })

    it('should reactively update when auth error changes', async () => {
      const { result, rerender } = renderHook(() => useAuthenticationStateReadonly())

      // Set initial error
      await updateStore(() => {
        mockStore.authenticationStore.authError = {
          name: 'AppError',
          message: 'Network error',
          type: ErrorType.NETWORK_ERROR,
          userFriendlyMessage: 'Network error',
        } as AppError
      })
      rerender()

      expect(result.current.authError).toBe('Network error')

      // Change error
      await updateStore(() => {
        mockStore.authenticationStore.authError = {
          name: 'AppError',
          message: 'Signature rejected',
          type: ErrorType.SIGNATURE_REJECTED,
          userFriendlyMessage: 'Signature rejected',
        } as AppError
      })
      rerender()

      expect(result.current.authError).toBe('Signature rejected')

      // Clear error
      await updateStore(() => {
        mockStore.authenticationStore.authError = null
      })
      rerender()

      expect(result.current.authError).toBeNull()
    })
  })

  describe('Authentication Status State', () => {
    it('should reflect authentication status from store', async () => {
      const { result, rerender } = renderHook(() => useAuthenticationStateReadonly())

      expect(result.current.isAuthenticating).toBe(false)

      await updateStore(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          isLocked: true,
        }
      })
      rerender()

      expect(result.current.isAuthenticating).toBe(true)
    })

    it('should combine store and Firebase loading states', async () => {
      const { result, rerender } = renderHook(() => useAuthenticationStateReadonly())

      // Initially not loading
      expect(result.current.isAuthenticating).toBe(false)

      // Store authenticating
      await updateStore(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          isLocked: true,
        }
      })
      rerender()

      expect(result.current.isAuthenticating).toBe(true)

      // Store done but Firebase loading
      await updateStore(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          isLocked: false,
        }
        mockFirebaseAuthState.isLoading = true
      })
      rerender()

      expect(result.current.isAuthenticating).toBe(true)

      // Both done
      await updateStore(() => {
        mockFirebaseAuthState.isLoading = false
      })
      rerender()

      expect(result.current.isAuthenticating).toBe(false)
    })
  })

  describe('Wallet Address State', () => {
    it('should reflect authenticated wallet address from store', async () => {
      const { result, rerender } = renderHook(() => useAuthenticationStateReadonly())

      expect(result.current.authWalletAddress).toBeNull()

      const walletAddress = '0x1234567890123456789012345678901234567890'
      await updateStore(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          walletAddress,
        }
      })
      rerender()

      expect(result.current.authWalletAddress).toBe(walletAddress)
    })

    it('should prioritize Firebase wallet address over store address', async () => {
      const { result, rerender } = renderHook(() => useAuthenticationStateReadonly())

      const storeAddress = '0x1111111111111111111111111111111111111111'
      const firebaseAddress = '0x2222222222222222222222222222222222222222'

      // Set store address first
      await updateStore(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          walletAddress: storeAddress,
        }
      })
      rerender()

      expect(result.current.authWalletAddress).toBe(storeAddress)

      // Set Firebase address - should take priority
      await updateStore(() => {
        mockFirebaseAuthState.walletAddress = firebaseAddress
      })
      rerender()

      expect(result.current.authWalletAddress).toBe(firebaseAddress)
    })

    it('should fallback to store address when Firebase has none', async () => {
      const { result, rerender } = renderHook(() => useAuthenticationStateReadonly())

      const storeAddress = '0x1111111111111111111111111111111111111111'

      await updateStore(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          walletAddress: storeAddress,
        }
        mockFirebaseAuthState.walletAddress = null
      })
      rerender()

      expect(result.current.authWalletAddress).toBe(storeAddress)
    })
  })

  describe('Firebase Authentication State', () => {
    it('should reflect Firebase authentication status', async () => {
      const { result, rerender } = renderHook(() => useAuthenticationStateReadonly())

      expect(result.current.isFirebaseAuthenticated).toBe(false)

      await updateStore(() => {
        mockFirebaseAuthState.isAuthenticated = true
      })
      rerender()

      expect(result.current.isFirebaseAuthenticated).toBe(true)
    })

    it('should reflect Firebase loading status', async () => {
      const { result, rerender } = renderHook(() => useAuthenticationStateReadonly())

      expect(result.current.isFirebaseLoading).toBe(false)

      await updateStore(() => {
        mockFirebaseAuthState.isLoading = true
      })
      rerender()

      expect(result.current.isFirebaseLoading).toBe(true)
    })
  })

  describe('Debug Information', () => {
    it('should provide debug info when wallet address exists', async () => {
      const { result, rerender } = renderHook(() => useAuthenticationStateReadonly())

      expect(result.current._debug).toBeNull()

      await updateStore(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          walletAddress: '0x1234567890123456789012345678901234567890',
        }
      })
      rerender()

      expect(result.current._debug).toEqual({ hasWalletAddress: true })
    })

    it('should clear debug info when wallet address is cleared', async () => {
      const { result, rerender } = renderHook(() => useAuthenticationStateReadonly())

      // Set address first
      await updateStore(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          walletAddress: '0x1234567890123456789012345678901234567890',
        }
      })
      rerender()

      expect(result.current._debug).toEqual({ hasWalletAddress: true })

      // Clear address
      await updateStore(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          walletAddress: null,
        }
      })
      rerender()

      expect(result.current._debug).toBeNull()
    })
  })

  describe('MobX Reactivity', () => {
    it('should maintain reactivity across multiple state changes', async () => {
      const { result, rerender } = renderHook(() => useAuthenticationStateReadonly())

      // Initial state
      expect(result.current.isAuthenticating).toBe(false)
      expect(result.current.authError).toBeNull()
      expect(result.current.authWalletAddress).toBeNull()

      // First change batch
      await updateStore(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          isLocked: true,
        }
        mockStore.authenticationStore.authError = {
          name: 'AppError',
          message: 'Network error',
          type: ErrorType.NETWORK_ERROR,
          userFriendlyMessage: 'Network error',
        } as AppError
      })
      rerender()

      expect(result.current.isAuthenticating).toBe(true)
      expect(result.current.authError).toBe('Network error')

      // Second change batch
      await updateStore(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          walletAddress: '0x1234567890123456789012345678901234567890',
        }
        mockStore.authenticationStore.authError = null
      })
      rerender()

      expect(result.current.authWalletAddress).toBe('0x1234567890123456789012345678901234567890')
      expect(result.current.authError).toBeNull()
      expect(result.current._debug).toEqual({ hasWalletAddress: true })
    })

    it('should handle rapid state changes', async () => {
      const { result, rerender } = renderHook(() => useAuthenticationStateReadonly())

      // Rapid state changes
      for (let i = 0; i < 5; i++) {
        await updateStore(() => {
          mockStore.authenticationStore.authLock = {
            ...mockStore.authenticationStore.authLock,
            isLocked: i % 2 === 0,
          }
          mockStore.authenticationStore.authError =
            i % 2 === 0
              ? ({
                  name: 'AppError',
                  message: `Error ${i}`,
                  type: ErrorType.AUTHENTICATION_FAILED,
                  userFriendlyMessage: `Error ${i}`,
                } as AppError)
              : null
        })
        rerender()

        expect(result.current.isAuthenticating).toBe(i % 2 === 0)
        expect(result.current.authError).toEqual(i % 2 === 0 ? `Error ${i}` : null)
      }
    })
  })

  describe('Readonly Behavior', () => {
    it('should not expose any mutation methods', () => {
      const { result, rerender: _rerender } = renderHook(() => useAuthenticationStateReadonly())

      // Should not have any methods - only state properties
      const keys = Object.keys(result.current)
      const methods = keys.filter((key) => typeof result.current[key as keyof typeof result.current] === 'function')

      expect(methods).toHaveLength(0)
    })

    it('should only expose readonly state properties', () => {
      const { result, rerender: _rerender } = renderHook(() => useAuthenticationStateReadonly())

      const expectedKeys = ['authError', 'isAuthenticating', 'authWalletAddress', 'isFirebaseAuthenticated', 'isFirebaseLoading', '_debug']

      expect(Object.keys(result.current).sort()).toEqual(expectedKeys.sort())
    })
  })

  describe('Integration Scenarios', () => {
    it('should reflect complete authentication flow state changes', async () => {
      const { result, rerender } = renderHook(() => useAuthenticationStateReadonly())

      // Start authentication
      await updateStore(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          isLocked: true,
        }
        mockStore.authenticationStore.authError = null
      })
      rerender()

      expect(result.current.isAuthenticating).toBe(true)
      expect(result.current.authError).toBeNull()

      // Authentication success
      await updateStore(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          isLocked: false,
          walletAddress: '0x1234567890123456789012345678901234567890',
        }
        mockFirebaseAuthState.isAuthenticated = true
        mockFirebaseAuthState.walletAddress = '0x1234567890123456789012345678901234567890'
      })
      rerender()

      expect(result.current.isAuthenticating).toBe(false)
      expect(result.current.authError).toBeNull()
      expect(result.current.authWalletAddress).toBe('0x1234567890123456789012345678901234567890')
      expect(result.current.isFirebaseAuthenticated).toBe(true)
      expect(result.current._debug).toEqual({ hasWalletAddress: true })
    })

    it('should handle authentication logout flow', async () => {
      const { result, rerender } = renderHook(() => useAuthenticationStateReadonly())

      // Start with authenticated state
      await updateStore(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          walletAddress: '0x1234567890123456789012345678901234567890',
        }
        mockFirebaseAuthState.isAuthenticated = true
        mockFirebaseAuthState.walletAddress = '0x1234567890123456789012345678901234567890'
      })
      rerender()

      expect(result.current.authWalletAddress).toBe('0x1234567890123456789012345678901234567890')
      expect(result.current.isFirebaseAuthenticated).toBe(true)
      expect(result.current._debug).toEqual({ hasWalletAddress: true })

      // Logout - clear all state
      await updateStore(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          walletAddress: null,
        }
        mockStore.authenticationStore.authError = null
        mockFirebaseAuthState.isAuthenticated = false
        mockFirebaseAuthState.walletAddress = null
      })
      rerender()

      expect(result.current.authWalletAddress).toBeNull()
      expect(result.current.isFirebaseAuthenticated).toBe(false)
      expect(result.current.authError).toBeNull()
      expect(result.current.isAuthenticating).toBe(false)
      expect(result.current._debug).toBeNull()
    })
  })

  describe('Edge Cases', () => {
    it('should handle undefined/null values gracefully', async () => {
      const { result, rerender } = renderHook(() => useAuthenticationStateReadonly())

      // Set to undefined/null explicitly
      await updateStore(() => {
        mockStore.authenticationStore.authError = null
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          walletAddress: null,
        }
        mockFirebaseAuthState.walletAddress = null
      })
      rerender()

      expect(result.current.authError).toBeNull()
      expect(result.current.authWalletAddress).toBeNull()
    })

    it('should handle empty string addresses', async () => {
      const { result, rerender } = renderHook(() => useAuthenticationStateReadonly())

      await updateStore(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          walletAddress: '',
        }
      })
      rerender()

      expect(result.current.authWalletAddress).toBe('')
      expect(result.current._debug).toBeNull() // Empty string is falsy
    })

    it('should prioritize truthy Firebase address over falsy store address', async () => {
      const { result, rerender } = renderHook(() => useAuthenticationStateReadonly())

      await updateStore(() => {
        mockStore.authenticationStore.authLock = {
          ...mockStore.authenticationStore.authLock,
          walletAddress: '',
        }
        mockFirebaseAuthState.walletAddress = '0x1234567890123456789012345678901234567890'
      })
      rerender()

      expect(result.current.authWalletAddress).toBe('0x1234567890123456789012345678901234567890')
    })
  })
})
