import { renderHook } from '@testing-library/react-hooks'
import { useAuthenticationMobX, useAuthenticationMobXReadonly } from './useAuthenticationMobX'

// Mock the dependencies
jest.mock('./useFirebaseAuth', () => ({
  useFirebaseAuth: () => ({
    isAuthenticated: false,
    isLoading: false,
    walletAddress: null,
  }),
}))

// Mock MobX store
const mockAuthStore = {
  authError: null,
  isAuthenticating: false,
  authWalletAddress: null,
  setAuthError: jest.fn(),
  acquireAuthLock: jest.fn(),
  releaseAuthLock: jest.fn(),
  reset: jest.fn(),
  isAuthenticatingForWallet: jest.fn(() => false),
}

jest.mock('../stores', () => ({
  useAuthenticationStore: () => mockAuthStore,
}))

describe('useAuthenticationMobX', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return authentication state from MobX store', () => {
    const { result } = renderHook(() => useAuthenticationMobX())

    expect(result.current).toMatchObject({
      authError: null,
      isAuthenticating: false,
      authWalletAddress: null,
      isFirebaseAuthenticated: false,
      isFirebaseLoading: false,
      firebaseWalletAddress: null,
    })
  })

  it('should provide computed derived state', () => {
    const { result } = renderHook(() => useAuthenticationMobX())

    expect(result.current.isFullyAuthenticated).toBe(false)
    expect(result.current.effectiveWalletAddress).toBe(null)
    expect(result.current.isLoading).toBe(false)
  })

  it('should provide store actions', () => {
    const { result } = renderHook(() => useAuthenticationMobX())

    expect(typeof result.current.setAuthError).toBe('function')
    expect(typeof result.current.acquireAuthLock).toBe('function')
    expect(typeof result.current.releaseAuthLock).toBe('function')
    expect(typeof result.current.reset).toBe('function')
    expect(typeof result.current.isAuthenticatingForWallet).toBe('function')
  })

  it('should provide store instance for advanced usage', () => {
    const { result } = renderHook(() => useAuthenticationMobX())

    expect(result.current.authStore).toBe(mockAuthStore)
  })

  it('should provide debug information', () => {
    const { result } = renderHook(() => useAuthenticationMobX())

    expect(result.current._mobxDebug).toBeDefined()
    expect(result.current._mobxDebug.storeState).toBeDefined()
    expect(result.current._mobxDebug.firebaseState).toBeDefined()
  })
})

describe('useAuthenticationMobXReadonly', () => {
  it('should return readonly authentication state', () => {
    const { result } = renderHook(() => useAuthenticationMobXReadonly())

    expect(result.current).toMatchObject({
      authError: null,
      isAuthenticating: false,
      authWalletAddress: null,
      isFirebaseAuthenticated: false,
      isFirebaseLoading: false,
      firebaseWalletAddress: null,
    })
  })

  it('should not provide action methods', () => {
    const { result } = renderHook(() => useAuthenticationMobXReadonly())

    // Readonly version should not have action methods
    expect('setAuthError' in result.current).toBe(false)
    expect('acquireAuthLock' in result.current).toBe(false)
    expect('releaseAuthLock' in result.current).toBe(false)
    expect('reset' in result.current).toBe(false)
  })

  it('should provide computed readonly state', () => {
    const { result } = renderHook(() => useAuthenticationMobXReadonly())

    expect(result.current.isFullyAuthenticated).toBe(false)
    expect(result.current.effectiveWalletAddress).toBe(null)
    expect(result.current.isLoading).toBe(false)
  })
})
