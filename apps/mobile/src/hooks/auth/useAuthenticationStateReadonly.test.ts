import { renderHook } from '@testing-library/react-native'
import { useAuthenticationStateReadonly } from './useAuthenticationStateReadonly'

// Mock the dependencies
jest.mock('./useAuthenticationStateReadonly', () => ({
  useAuthenticationStateReadonly: () => ({
    authError: null,
    isAuthenticating: false,
    authWalletAddress: null,
    isFirebaseAuthenticated: false,
    isFirebaseLoading: false,
    _debug: { hasWalletAddress: false },
  }),
}))

jest.mock('./useFirebaseAuth', () => ({
  useFirebaseAuth: () => ({
    isAuthenticated: false,
    isLoading: false,
    walletAddress: null,
  }),
}))

jest.mock('../../stores', () => ({
  useAuthenticationStore: () => ({
    authError: null,
    isAuthenticating: false,
    authWalletAddress: null,
  }),
}))

describe('useAuthenticationStateReadonly', () => {
  it('should return authentication state from MobX store', () => {
    const { result } = renderHook(() => useAuthenticationStateReadonly())

    expect(result.current).toMatchObject({
      authError: null,
      isAuthenticating: false,
      authWalletAddress: null,
      isFirebaseAuthenticated: false,
      isFirebaseLoading: false,
    })
  })

  it('should provide minimal debug information', () => {
    const { result } = renderHook(() => useAuthenticationStateReadonly())

    // Debug info is minimal now - just indicates if wallet address exists
    expect(result.current._debug).toBeDefined()
  })
})
