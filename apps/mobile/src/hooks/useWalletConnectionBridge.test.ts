import { renderHook } from '@testing-library/react-hooks'
import { useWalletConnectionBridge, useWalletConnectionState } from './useWalletConnectionBridge'

// Mock the store
const mockWalletStore = {
  isConnected: false,
  address: undefined,
  chainId: undefined,
  isConnecting: false,
  connectionError: null,
  isWalletConnected: false,
  currentState: {
    isConnected: false,
    address: undefined,
    chainId: undefined,
    isConnecting: false,
    connectionError: null,
  },
  connect: jest.fn(),
  disconnect: jest.fn(),
  setConnecting: jest.fn(),
  setConnectionError: jest.fn(),
  setConnectionState: jest.fn(),
  updateConnectionState: jest.fn(),
}

// Mock the bridge service
const mockBridge = {
  captureState: jest.fn(),
  validateState: jest.fn(() => true),
  validateInitialState: jest.fn(() => ({ isValid: true })),
  getCurrentState: jest.fn(),
  resetSequence: jest.fn(),
  reset: jest.fn(),
  getWalletStore: jest.fn(() => mockWalletStore),
  debugStateSync: jest.fn(() => ({
    store: { isConnected: false },
    singleton: { isConnected: false },
    inSync: true,
  })),
}

jest.mock('../stores', () => ({
  useWalletConnectionStore: () => mockWalletStore,
}))

jest.mock('../services/walletConnectionBridge', () => ({
  createWalletConnectionBridge: () => mockBridge,
}))

describe('useWalletConnectionBridge', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return wallet connection state from store', () => {
    const { result } = renderHook(() => useWalletConnectionBridge())

    expect(result.current).toMatchObject({
      isConnected: false,
      address: undefined,
      chainId: undefined,
      isConnecting: false,
      connectionError: null,
      isWalletConnected: false,
    })
  })

  it('should provide store actions', () => {
    const { result } = renderHook(() => useWalletConnectionBridge())

    expect(typeof result.current.connect).toBe('function')
    expect(typeof result.current.disconnect).toBe('function')
    expect(typeof result.current.setConnecting).toBe('function')
    expect(typeof result.current.setConnectionError).toBe('function')
    expect(typeof result.current.setConnectionState).toBe('function')
  })

  it('should provide bridge methods', () => {
    const { result } = renderHook(() => useWalletConnectionBridge())

    expect(typeof result.current.captureState).toBe('function')
    expect(typeof result.current.validateState).toBe('function')
    expect(typeof result.current.validateInitialState).toBe('function')
    expect(typeof result.current.getCurrentState).toBe('function')
    expect(typeof result.current.resetSequence).toBe('function')
    expect(typeof result.current.reset).toBe('function')
  })

  it('should provide debug utilities', () => {
    const { result } = renderHook(() => useWalletConnectionBridge())

    expect(result.current.debugStateSync).toBeDefined()
    expect(result.current._debug).toBeDefined()
    expect(result.current._debug.storeState).toBeDefined()
    expect(result.current._debug.bridgeSync).toBeDefined()
  })

  it('should provide store and bridge instances', () => {
    const { result } = renderHook(() => useWalletConnectionBridge())

    expect(result.current.walletStore).toBe(mockWalletStore)
    expect(result.current.bridge).toBe(mockBridge)
  })
})

describe('useWalletConnectionState', () => {
  it('should return readonly wallet connection state', () => {
    const { result } = renderHook(() => useWalletConnectionState())

    expect(result.current).toMatchObject({
      isConnected: false,
      address: undefined,
      chainId: undefined,
      isConnecting: false,
      connectionError: null,
      isWalletConnected: false,
    })
  })

  it('should not provide action methods', () => {
    const { result } = renderHook(() => useWalletConnectionState())

    expect('connect' in result.current).toBe(false)
    expect('disconnect' in result.current).toBe(false)
    expect('setConnecting' in result.current).toBe(false)
    expect('setConnectionError' in result.current).toBe(false)
  })

  it('should provide current state object', () => {
    const { result } = renderHook(() => useWalletConnectionState())

    expect(result.current.currentState).toBeDefined()
    expect(result.current.currentState).toEqual(mockWalletStore.currentState)
  })
})
