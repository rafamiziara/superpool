import { act, renderHook } from '@testing-library/react-hooks'
import { __resetGlobalLogoutStateForTesting, getGlobalLogoutState, useGlobalLogoutState, useLogoutState } from './useLogoutState'

describe('useLogoutState', () => {
  it('should initialize with correct default state', () => {
    const { result } = renderHook(() => useLogoutState())

    expect(result.current.isLoggingOut).toBe(false)
    expect(typeof result.current.startLogout).toBe('function')
    expect(typeof result.current.finishLogout).toBe('function')
  })

  it('should handle start logout correctly', () => {
    const { result } = renderHook(() => useLogoutState())

    act(() => {
      result.current.startLogout()
    })

    expect(result.current.isLoggingOut).toBe(true)
  })

  it('should handle finish logout correctly', () => {
    const { result } = renderHook(() => useLogoutState())

    act(() => {
      result.current.startLogout()
    })

    expect(result.current.isLoggingOut).toBe(true)

    act(() => {
      result.current.finishLogout()
    })

    expect(result.current.isLoggingOut).toBe(false)
  })

  it('should handle multiple start/finish calls', () => {
    const { result } = renderHook(() => useLogoutState())

    // Multiple start calls
    act(() => {
      result.current.startLogout()
    })
    expect(result.current.isLoggingOut).toBe(true)

    act(() => {
      result.current.startLogout()
    })
    expect(result.current.isLoggingOut).toBe(true)

    // Single finish call
    act(() => {
      result.current.finishLogout()
    })
    expect(result.current.isLoggingOut).toBe(false)

    // Multiple finish calls
    act(() => {
      result.current.finishLogout()
    })
    expect(result.current.isLoggingOut).toBe(false)
  })
})

describe('useGlobalLogoutState', () => {
  it('should initialize global state and provide access', () => {
    const { result } = renderHook(() => useGlobalLogoutState())

    expect(result.current.isLoggingOut).toBe(false)
    expect(typeof result.current.startLogout).toBe('function')
    expect(typeof result.current.finishLogout).toBe('function')

    // Global state should be accessible
    expect(() => getGlobalLogoutState()).not.toThrow()
    const globalState = getGlobalLogoutState()
    expect(globalState.isLoggingOut).toBe(false)
  })

  it('should synchronize global state operations', () => {
    const { result } = renderHook(() => useGlobalLogoutState())

    act(() => {
      result.current.startLogout()
    })

    expect(result.current.isLoggingOut).toBe(true)
    expect(getGlobalLogoutState().isLoggingOut).toBe(true)

    act(() => {
      result.current.finishLogout()
    })

    expect(result.current.isLoggingOut).toBe(false)
    expect(getGlobalLogoutState().isLoggingOut).toBe(false)
  })
})

describe('getGlobalLogoutState', () => {
  beforeEach(() => {
    // Reset global state before each test
    __resetGlobalLogoutStateForTesting()
  })

  it('should throw error when not initialized', () => {
    // Global state should now be reset
    expect(() => getGlobalLogoutState()).toThrow('Global logout state not initialized. Use useGlobalLogoutState in a component first.')
  })

  it('should return state after initialization', () => {
    // Initialize global state
    renderHook(() => useGlobalLogoutState())

    const state = getGlobalLogoutState()
    expect(state).toHaveProperty('isLoggingOut')
    expect(state).toHaveProperty('startLogout')
    expect(state).toHaveProperty('finishLogout')
  })
})
