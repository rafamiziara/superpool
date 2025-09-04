/**
 * Comprehensive test suite for useAuthenticationStateReadonly hook
 * Tests readonly state access and MobX reactivity
 */

import { runInAction } from 'mobx'
import { useAuthenticationStateReadonly } from './useAuthenticationStateReadonly'
import { createMockRootStore, waitForMobX } from '@mocks/factories/testFactory'
import { AppError, ErrorType } from '../../utils/errorHandling'
import { renderHook, act } from '@testing-library/react-native'

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

// Mock the useAuthenticationStore hook directly
let mockAuthenticationStore: any = null

jest.mock('../../stores', () => ({
  useAuthenticationStore: () => mockAuthenticationStore,
}))

describe('useAuthenticationStateReadonly', () => {
  let mockStore: ReturnType<typeof createMockRootStore>

  beforeEach(async () => {
    jest.clearAllMocks()
    mockStore = createMockRootStore()
    mockAuthenticationStore = mockStore.authenticationStore

    // Reset Firebase auth mock state
    Object.assign(mockFirebaseAuth, {
      isAuthenticated: false,
      isLoading: false,
      walletAddress: null,
      user: null,
    })

    // Wait for MobX to settle
    await waitForMobX()
  })

  describe('Initial State', () => {
    it('should return initial readonly state', () => {
      const { result } = renderHook(() => useAuthenticationStateReadonly())

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
      const { result } = renderHook(() => useAuthenticationStateReadonly())

      expect(result.current.authError).toBeNull()

      await act(async () => {
        runInAction(() => {
          mockStore.authenticationStore.authError = {
            name: 'AppError',
            message: 'Authentication failed',
            type: ErrorType.AUTHENTICATION_FAILED,
            userFriendlyMessage: 'Authentication failed',
          } as AppError
        })
        await waitForMobX()
      })

      expect(result.current.authError).toBe('Authentication failed')
    })

    it('should reactively update when auth error changes', async () => {
      const { result } = renderHook(() => useAuthenticationStateReadonly())

      // Set initial error
      await act(async () => {
        runInAction(() => {
          mockStore.authenticationStore.authError = {
            name: 'AppError',
            message: 'Network error',
            type: ErrorType.NETWORK_ERROR,
            userFriendlyMessage: 'Network error',
          } as AppError
        })
        await waitForMobX()
      })

      expect(result.current.authError).toBe('Network error')

      // Change error
      await act(async () => {
        runInAction(() => {
          mockStore.authenticationStore.authError = {
            name: 'AppError',
            message: 'Signature rejected',
            type: ErrorType.SIGNATURE_REJECTED,
            userFriendlyMessage: 'Signature rejected',
          } as AppError
        })
        await waitForMobX()
      })

      expect(result.current.authError).toBe('Signature rejected')

      // Clear error
      await act(async () => {
        runInAction(() => {
          mockStore.authenticationStore.authError = null
        })
        await waitForMobX()
      })

      expect(result.current.authError).toBeNull()
    })
  })

  describe('Authentication Status State', () => {
    it('should reflect authentication status from store', async () => {
      const { result } = renderHook(() => useAuthenticationStateReadonly())

      expect(result.current.isAuthenticating).toBe(false)

      await act(async () => {
        runInAction(() => {
          mockStore.authenticationStore.authLock = {
            ...mockStore.authenticationStore.authLock,
            isLocked: true,
          }
        })
        await waitForMobX()
      })

      expect(result.current.isAuthenticating).toBe(true)
    })

    it('should combine store and Firebase loading states', async () => {
      const { result } = renderHook(() => useAuthenticationStateReadonly())

      // Initially not loading
      expect(result.current.isAuthenticating).toBe(false)

      // Store authenticating
      await act(async () => {
        runInAction(() => {
          mockStore.authenticationStore.authLock = {
            ...mockStore.authenticationStore.authLock,
            isLocked: true,
          }
        })
        await waitForMobX()
      })

      expect(result.current.isAuthenticating).toBe(true)

      // Store done but Firebase loading
      await act(async () => {
        runInAction(() => {
          mockStore.authenticationStore.authLock = {
            ...mockStore.authenticationStore.authLock,
            isLocked: false,
          }
        })
        mockFirebaseAuth.isLoading = true
        await waitForMobX()
      })

      expect(result.current.isAuthenticating).toBe(true)

      // Both done
      await act(async () => {
        mockFirebaseAuth.isLoading = false
        await waitForMobX()
      })

      expect(result.current.isAuthenticating).toBe(false)
    })
  })

  describe('Wallet Address State', () => {
    it('should reflect authenticated wallet address from store', async () => {
      const { result } = renderHook(() => useAuthenticationStateReadonly())

      expect(result.current.authWalletAddress).toBeNull()

      const walletAddress = '0x1234567890123456789012345678901234567890'
      await act(async () => {
        runInAction(() => {
          mockStore.authenticationStore.authLock = {
            ...mockStore.authenticationStore.authLock,
            walletAddress,
          }
        })
        await waitForMobX()
      })

      expect(result.current.authWalletAddress).toBe(walletAddress)
    })

    it('should prioritize Firebase wallet address over store address', async () => {
      const { result } = renderHook(() => useAuthenticationStateReadonly())

      const storeAddress = '0x1111111111111111111111111111111111111111'
      const firebaseAddress = '0x2222222222222222222222222222222222222222'

      // Set store address first
      await act(async () => {
        runInAction(() => {
          mockStore.authenticationStore.authLock = {
            ...mockStore.authenticationStore.authLock,
            walletAddress: storeAddress,
          }
        })
        await waitForMobX()
      })

      expect(result.current.authWalletAddress).toBe(storeAddress)

      // Set Firebase address - should take priority
      await act(async () => {
        mockFirebaseAuth.walletAddress = firebaseAddress
        await waitForMobX()
      })

      expect(result.current.authWalletAddress).toBe(firebaseAddress)
    })

    it('should fallback to store address when Firebase has none', async () => {
      const { result } = renderHook(() => useAuthenticationStateReadonly())

      const storeAddress = '0x1111111111111111111111111111111111111111'

      await act(async () => {
        runInAction(() => {
          mockStore.authenticationStore.authLock = {
            ...mockStore.authenticationStore.authLock,
            walletAddress: storeAddress,
          }
        })
        mockFirebaseAuth.walletAddress = null
        await waitForMobX()
      })

      expect(result.current.authWalletAddress).toBe(storeAddress)
    })
  })

  describe('Firebase Authentication State', () => {
    it('should reflect Firebase authentication status', async () => {
      const { result } = renderHook(() => useAuthenticationStateReadonly())

      expect(result.current.isFirebaseAuthenticated).toBe(false)

      await act(async () => {
        mockFirebaseAuth.isAuthenticated = true
        await waitForMobX()
      })

      expect(result.current.isFirebaseAuthenticated).toBe(true)
    })

    it('should reflect Firebase loading status', async () => {
      const { result } = renderHook(() => useAuthenticationStateReadonly())

      expect(result.current.isFirebaseLoading).toBe(false)

      await act(async () => {
        mockFirebaseAuth.isLoading = true
        await waitForMobX()
      })

      expect(result.current.isFirebaseLoading).toBe(true)
    })
  })

  describe('Debug Information', () => {
    it('should provide debug info when wallet address exists', async () => {
      const { result } = renderHook(() => useAuthenticationStateReadonly())

      expect(result.current._debug).toBeNull()

      await act(async () => {
        runInAction(() => {
          mockStore.authenticationStore.authLock = {
            ...mockStore.authenticationStore.authLock,
            walletAddress: '0x1234567890123456789012345678901234567890',
          }
        })
        await waitForMobX()
      })

      expect(result.current._debug).toEqual({ hasWalletAddress: true })
    })

    it('should clear debug info when wallet address is cleared', async () => {
      const { result } = renderHook(() => useAuthenticationStateReadonly())

      // Set address first
      await act(async () => {
        runInAction(() => {
          mockStore.authenticationStore.authLock = {
            ...mockStore.authenticationStore.authLock,
            walletAddress: '0x1234567890123456789012345678901234567890',
          }
        })
        await waitForMobX()
      })

      expect(result.current._debug).toEqual({ hasWalletAddress: true })

      // Clear address
      await act(async () => {
        runInAction(() => {
          mockStore.authenticationStore.authLock = {
            ...mockStore.authenticationStore.authLock,
            walletAddress: null,
          }
        })
        await waitForMobX()
      })

      expect(result.current._debug).toBeNull()
    })
  })

  describe('MobX Reactivity', () => {
    it('should maintain reactivity across multiple state changes', async () => {
      const { result } = renderHook(() => useAuthenticationStateReadonly())

      // Initial state
      expect(result.current.isAuthenticating).toBe(false)
      expect(result.current.authError).toBeNull()
      expect(result.current.authWalletAddress).toBeNull()

      // First change batch
      await act(async () => {
        runInAction(() => {
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
        await waitForMobX()
      })

      expect(result.current.isAuthenticating).toBe(true)
      expect(result.current.authError).toBe('Network error')

      // Second change batch
      await act(async () => {
        runInAction(() => {
          mockStore.authenticationStore.authLock = {
            ...mockStore.authenticationStore.authLock,
            walletAddress: '0x1234567890123456789012345678901234567890',
          }
          mockStore.authenticationStore.authError = null
        })
        await waitForMobX()
      })

      expect(result.current.authWalletAddress).toBe('0x1234567890123456789012345678901234567890')
      expect(result.current.authError).toBeNull()
      expect(result.current._debug).toEqual({ hasWalletAddress: true })
    })

    it('should handle rapid state changes', async () => {
      const { result } = renderHook(() => useAuthenticationStateReadonly())

      // Rapid state changes
      for (let i = 0; i < 5; i++) {
        await act(async () => {
          runInAction(() => {
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
          await waitForMobX()
        })

        expect(result.current.isAuthenticating).toBe(i % 2 === 0)
        expect(result.current.authError).toEqual(i % 2 === 0 ? `Error ${i}` : null)
      }
    })
  })

  describe('Readonly Behavior', () => {
    it('should not expose any mutation methods', () => {
      const { result } = renderHook(() => useAuthenticationStateReadonly())

      // Should not have any methods - only state properties
      const keys = Object.keys(result.current)
      const methods = keys.filter((key) => typeof result.current[key as keyof typeof result.current] === 'function')

      expect(methods).toHaveLength(0)
    })

    it('should only expose readonly state properties', () => {
      const { result } = renderHook(() => useAuthenticationStateReadonly())

      const expectedKeys = ['authError', 'isAuthenticating', 'authWalletAddress', 'isFirebaseAuthenticated', 'isFirebaseLoading', '_debug']

      expect(Object.keys(result.current).sort()).toEqual(expectedKeys.sort())
    })
  })

  describe('Integration Scenarios', () => {
    it('should reflect complete authentication flow state changes', async () => {
      const { result } = renderHook(() => useAuthenticationStateReadonly())

      // Start authentication
      await act(async () => {
        runInAction(() => {
          mockStore.authenticationStore.authLock = {
            ...mockStore.authenticationStore.authLock,
            isLocked: true,
          }
          mockStore.authenticationStore.authError = null
        })
        await waitForMobX()
      })

      expect(result.current.isAuthenticating).toBe(true)
      expect(result.current.authError).toBeNull()

      // Authentication success
      await act(async () => {
        runInAction(() => {
          mockStore.authenticationStore.authLock = {
            ...mockStore.authenticationStore.authLock,
            isLocked: false,
            walletAddress: '0x1234567890123456789012345678901234567890',
          }
        })
        mockFirebaseAuth.isAuthenticated = true
        mockFirebaseAuth.walletAddress = '0x1234567890123456789012345678901234567890'
        await waitForMobX()
      })

      expect(result.current.isAuthenticating).toBe(false)
      expect(result.current.authError).toBeNull()
      expect(result.current.authWalletAddress).toBe('0x1234567890123456789012345678901234567890')
      expect(result.current.isFirebaseAuthenticated).toBe(true)
      expect(result.current._debug).toEqual({ hasWalletAddress: true })
    })

    it('should handle authentication logout flow', async () => {
      const { result } = renderHook(() => useAuthenticationStateReadonly())

      // Start with authenticated state
      await act(async () => {
        runInAction(() => {
          mockStore.authenticationStore.authLock = {
            ...mockStore.authenticationStore.authLock,
            walletAddress: '0x1234567890123456789012345678901234567890',
          }
        })
        mockFirebaseAuth.isAuthenticated = true
        mockFirebaseAuth.walletAddress = '0x1234567890123456789012345678901234567890'
        await waitForMobX()
      })

      expect(result.current.authWalletAddress).toBe('0x1234567890123456789012345678901234567890')
      expect(result.current.isFirebaseAuthenticated).toBe(true)
      expect(result.current._debug).toEqual({ hasWalletAddress: true })

      // Logout - clear all state
      await act(async () => {
        runInAction(() => {
          mockStore.authenticationStore.authLock = {
            ...mockStore.authenticationStore.authLock,
            walletAddress: null,
          }
          mockStore.authenticationStore.authError = null
        })
        mockFirebaseAuth.isAuthenticated = false
        mockFirebaseAuth.walletAddress = null
        await waitForMobX()
      })

      expect(result.current.authWalletAddress).toBeNull()
      expect(result.current.isFirebaseAuthenticated).toBe(false)
      expect(result.current.authError).toBeNull()
      expect(result.current.isAuthenticating).toBe(false)
      expect(result.current._debug).toBeNull()
    })
  })

  describe('Edge Cases', () => {
    it('should handle undefined/null values gracefully', async () => {
      const { result } = renderHook(() => useAuthenticationStateReadonly())

      // Set to undefined/null explicitly
      await act(async () => {
        runInAction(() => {
          mockStore.authenticationStore.authError = undefined as any
          mockStore.authenticationStore.authLock = {
            ...mockStore.authenticationStore.authLock,
            walletAddress: undefined as any,
          }
        })
        mockFirebaseAuth.walletAddress = undefined as any
        await waitForMobX()
      })

      expect(result.current.authError).toBeUndefined()
      expect(result.current.authWalletAddress).toBeUndefined()
    })

    it('should handle empty string addresses', async () => {
      const { result } = renderHook(() => useAuthenticationStateReadonly())

      await act(async () => {
        runInAction(() => {
          mockStore.authenticationStore.authLock = {
            ...mockStore.authenticationStore.authLock,
            walletAddress: '',
          }
        })
        await waitForMobX()
      })

      expect(result.current.authWalletAddress).toBe('')
      expect(result.current._debug).toBeNull() // Empty string is falsy
    })

    it('should prioritize truthy Firebase address over falsy store address', async () => {
      const { result } = renderHook(() => useAuthenticationStateReadonly())

      await act(async () => {
        runInAction(() => {
          mockStore.authenticationStore.authLock = {
            ...mockStore.authenticationStore.authLock,
            walletAddress: '',
          }
        })
        mockFirebaseAuth.walletAddress = '0x1234567890123456789012345678901234567890'
        await waitForMobX()
      })

      expect(result.current.authWalletAddress).toBe('0x1234567890123456789012345678901234567890')
    })
  })
})
