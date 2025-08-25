import { renderHook } from '@testing-library/react-hooks'
import { useAuthenticationStateReadonlyBridge } from './useAuthenticationStateReadonlyBridge'

// Mock the dependencies
jest.mock('./useAuthenticationStateReadonly', () => ({
  useAuthenticationStateReadonly: () => ({
    authError: null,
    isAuthenticating: false,
    authWalletAddress: null,
    isFirebaseAuthenticated: false,
    isFirebaseLoading: false,
  }),
}))

jest.mock('./useFirebaseAuth', () => ({
  useFirebaseAuth: () => ({
    isAuthenticated: false,
    isLoading: false,
    walletAddress: null,
  }),
}))

jest.mock('../stores', () => ({
  useAuthenticationStore: () => ({
    authError: null,
    isAuthenticating: false,
    authWalletAddress: null,
  }),
}))

describe('useAuthenticationStateReadonlyBridge', () => {
  it('should return authentication state from MobX store', () => {
    const { result } = renderHook(() => useAuthenticationStateReadonlyBridge())

    expect(result.current).toMatchObject({
      authError: null,
      isAuthenticating: false,
      authWalletAddress: null,
      isFirebaseAuthenticated: false,
      isFirebaseLoading: false,
    })
  })

  it('should provide debug information', () => {
    const { result } = renderHook(() => useAuthenticationStateReadonlyBridge())

    expect(result.current._debug).toBeDefined()
    expect(result.current._debug?.originalValues).toBeDefined()
    expect(result.current._debug?.mobxValues).toBeDefined()
    expect(result.current._debug?.firebaseValues).toBeDefined()
  })
})
