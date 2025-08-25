import { WalletConnectionStore } from '../stores/WalletConnectionStore'
import { WalletConnectionBridge, createWalletConnectionBridge } from './walletConnectionBridge'

// Mock the connectionStateManager singleton
jest.mock('../utils/connectionStateManager', () => {
  const mockConnectionStateManager = {
    captureState: jest.fn((isConnected, address, chainId) => ({
      isConnected,
      address,
      chainId,
      timestamp: Date.now(),
      sequenceNumber: 1,
    })),
    validateState: jest.fn(() => true),
    validateInitialState: jest.fn(() => ({ isValid: true })),
    resetSequence: jest.fn(),
  }

  return {
    connectionStateManager: mockConnectionStateManager,
  }
})

describe('WalletConnectionBridge', () => {
  let walletStore: WalletConnectionStore
  let bridge: WalletConnectionBridge

  beforeEach(() => {
    jest.clearAllMocks()
    walletStore = new WalletConnectionStore()
    bridge = new WalletConnectionBridge(walletStore)
  })

  describe('captureState', () => {
    it('should capture state in both store and singleton', () => {
      const result = bridge.captureState(true, '0x123', 1)

      expect(result).toEqual({
        isConnected: true,
        address: '0x123',
        chainId: 1,
        timestamp: expect.any(Number),
        sequenceNumber: expect.any(Number),
      })

      // Verify store state is updated
      expect(walletStore.isConnected).toBe(true)
      expect(walletStore.address).toBe('0x123')
      expect(walletStore.chainId).toBe(1)
    })

    it('should handle disconnected state', () => {
      const result = bridge.captureState(false, undefined, undefined)

      expect(result.isConnected).toBe(false)
      expect(result.address).toBeUndefined()
      expect(result.chainId).toBeUndefined()

      expect(walletStore.isConnected).toBe(false)
      expect(walletStore.address).toBeUndefined()
      expect(walletStore.chainId).toBeUndefined()
    })
  })

  describe('validateState', () => {
    it('should validate state through store', () => {
      const lockedState = {
        isConnected: true,
        address: '0x123',
        chainId: 1,
        timestamp: Date.now(),
        sequenceNumber: 1,
      }

      const currentState = {
        isConnected: true,
        address: '0x123',
        chainId: 1,
        timestamp: Date.now(),
        sequenceNumber: 1,
      }

      const result = bridge.validateState(lockedState, currentState, 'test-checkpoint')
      expect(result).toBe(true)
    })
  })

  describe('validateInitialState', () => {
    it('should validate initial state for connected wallet', () => {
      // Set up connected state
      walletStore.connect('0x123', 1)

      const result = bridge.validateInitialState('0x123')
      expect(result.isValid).toBe(true)
    })

    it('should reject invalid wallet address', () => {
      walletStore.connect('0x123', 1)

      const result = bridge.validateInitialState('0x456')
      expect(result.isValid).toBe(false)
      expect(result.error).toBe('Wallet address mismatch')
    })

    it('should reject disconnected wallet', () => {
      walletStore.disconnect()

      const result = bridge.validateInitialState('0x123')
      expect(result.isValid).toBe(false)
      expect(result.error).toBe('Wallet connection state invalid')
    })
  })

  describe('getCurrentState', () => {
    it('should return current state from store', () => {
      walletStore.connect('0x123', 1)

      const result = bridge.getCurrentState()
      expect(result).toEqual({
        isConnected: true,
        address: '0x123',
        chainId: 1,
        timestamp: expect.any(Number),
        sequenceNumber: expect.any(Number),
      })
    })
  })

  describe('reset', () => {
    it('should reset both store and singleton', () => {
      walletStore.connect('0x123', 1)

      bridge.reset()

      expect(walletStore.isConnected).toBe(false)
      expect(walletStore.address).toBeUndefined()
      expect(walletStore.chainId).toBeUndefined()
    })
  })

  describe('getWalletStore', () => {
    it('should return the wallet store instance', () => {
      const store = bridge.getWalletStore()
      expect(store).toBe(walletStore)
    })
  })

  describe('debugStateSync', () => {
    it('should compare states between store and singleton', () => {
      walletStore.connect('0x123', 1)

      const debug = bridge.debugStateSync()

      expect(debug.store).toBeDefined()
      expect(debug.singleton).toBeDefined()
      expect(debug.inSync).toBeDefined()
    })
  })
})

describe('createWalletConnectionBridge', () => {
  it('should create a bridge instance with store', () => {
    const walletStore = new WalletConnectionStore()
    const bridge = createWalletConnectionBridge(walletStore)

    expect(bridge).toBeInstanceOf(WalletConnectionBridge)
    expect(bridge.getWalletStore()).toBe(walletStore)
  })
})
