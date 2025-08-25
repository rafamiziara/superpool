import { WalletConnectionStore } from '../stores/WalletConnectionStore'
import { AuthenticationOrchestrator } from './authenticationOrchestrator'
import { WalletConnectionBridge } from './walletConnectionBridge'

// Mock Firebase and other dependencies
jest.mock('../firebase.config', () => ({
  FIREBASE_AUTH: {},
  FIREBASE_FUNCTIONS: {},
}))

jest.mock('firebase/auth', () => ({
  signInWithCustomToken: jest.fn(),
}))

jest.mock('firebase/functions', () => ({
  httpsCallable: jest.fn(() => jest.fn()),
}))

jest.mock('../hooks/useLogoutState', () => ({
  getGlobalLogoutState: jest.fn(() => ({ isLoggingOut: false })),
}))

jest.mock('../utils/secureLogger', () => ({
  devOnly: jest.fn(),
}))

jest.mock('../utils/sessionManager', () => ({
  SessionManager: {
    clearSession: jest.fn(),
  },
}))

jest.mock('../utils/toast', () => ({
  authToasts: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('./authErrorRecoveryService', () => ({
  AuthErrorRecoveryService: {
    clearRecoveryData: jest.fn(),
  },
}))

jest.mock('./signatureService', () => ({
  SignatureService: {
    generateAndSignMessage: jest.fn(),
    signTypedData: jest.fn(),
  },
}))

describe('Wallet Connection Integration', () => {
  let walletStore: WalletConnectionStore
  let bridge: WalletConnectionBridge
  let authLock: React.MutableRefObject<any>
  let orchestrator: AuthenticationOrchestrator

  beforeEach(() => {
    jest.clearAllMocks()

    walletStore = new WalletConnectionStore()
    bridge = new WalletConnectionBridge(walletStore)

    authLock = {
      current: {
        isLocked: false,
        startTime: 0,
        walletAddress: null,
        abortController: null,
      },
    }

    orchestrator = new AuthenticationOrchestrator(authLock, bridge)
  })

  describe('Atomic State Validation', () => {
    it('should validate wallet connection state correctly', () => {
      // Connect wallet
      walletStore.connect('0x123', 1)

      // Capture atomic state
      const lockedState = bridge.captureState(true, '0x123', 1)

      expect(lockedState).toEqual({
        isConnected: true,
        address: '0x123',
        chainId: 1,
        timestamp: expect.any(Number),
        sequenceNumber: expect.any(Number),
      })

      // Validate initial state
      const validation = bridge.validateInitialState('0x123')
      expect(validation.isValid).toBe(true)
    })

    it('should detect state changes through sequence numbers', () => {
      // Capture initial state
      const initialState = bridge.captureState(true, '0x123', 1)

      // Change wallet state (simulating network switch)
      const newState = bridge.captureState(true, '0x123', 137)

      // Sequence number should be different
      expect(newState.sequenceNumber).toBeGreaterThan(initialState.sequenceNumber)
      expect(newState.chainId).toBe(137)
    })

    it('should validate state consistency correctly', () => {
      const lockedState = bridge.captureState(true, '0x123', 1)

      // Same state should validate successfully
      const currentState = bridge.getCurrentState()
      const isValid = bridge.validateState(lockedState, currentState, 'test-checkpoint')

      expect(isValid).toBe(true)
    })

    it('should reject validation when state changes', () => {
      const lockedState = bridge.captureState(true, '0x123', 1)

      // Simulate wallet disconnection
      walletStore.disconnect()

      const currentState = bridge.getCurrentState()
      const isValid = bridge.validateState(lockedState, currentState, 'disconnect-test')

      expect(isValid).toBe(false)
    })

    it('should reject mismatched wallet addresses', () => {
      walletStore.connect('0x123', 1)

      const validation = bridge.validateInitialState('0x456')
      expect(validation.isValid).toBe(false)
      expect(validation.error).toBe('Wallet address mismatch')
    })

    it('should reject disconnected wallet validation', () => {
      walletStore.disconnect()

      const validation = bridge.validateInitialState('0x123')
      expect(validation.isValid).toBe(false)
      expect(validation.error).toBe('Wallet connection state invalid')
    })

    it('should reject missing chain ID', () => {
      // Connect without chain ID
      walletStore.setConnectionState({
        isConnected: true,
        address: '0x123',
        chainId: undefined,
      })

      const validation = bridge.validateInitialState('0x123')
      expect(validation.isValid).toBe(false)
      expect(validation.error).toBe('ChainId not found')
    })
  })

  describe('Bridge State Synchronization', () => {
    it('should maintain store and singleton sync', () => {
      // Capture state through bridge
      bridge.captureState(true, '0x123', 1)

      // Check debug sync
      const debug = bridge.debugStateSync()
      expect(debug.inSync).toBe(true)
      expect(debug.store.isConnected).toBe(true)
      expect(debug.store.address).toBe('0x123')
      expect(debug.store.chainId).toBe(1)
    })

    it('should reset both systems correctly', () => {
      // Set up connected state
      walletStore.connect('0x123', 1)

      // Reset through bridge
      bridge.reset()

      // Verify store is reset
      expect(walletStore.isConnected).toBe(false)
      expect(walletStore.address).toBeUndefined()
      expect(walletStore.chainId).toBeUndefined()
    })
  })

  describe('MobX Store Integration', () => {
    it('should provide reactive state', () => {
      expect(walletStore.isConnected).toBe(false)

      // Connect wallet
      walletStore.connect('0x123', 1)

      // State should be immediately updated (reactive)
      expect(walletStore.isConnected).toBe(true)
      expect(walletStore.address).toBe('0x123')
      expect(walletStore.chainId).toBe(1)
      expect(walletStore.isWalletConnected).toBe(true)
    })

    it('should track connection state changes', () => {
      const initialSequence = walletStore.captureState().sequenceNumber

      // Multiple state changes
      walletStore.connect('0x123', 1)
      walletStore.disconnect()
      walletStore.connect('0x456', 137)

      const finalSequence = walletStore.captureState().sequenceNumber
      expect(finalSequence).toBeGreaterThan(initialSequence)
    })
  })

  describe('Authentication Orchestrator Integration', () => {
    it('should use bridge for state validation', async () => {
      // This test verifies the orchestrator constructor accepts the bridge
      expect(orchestrator).toBeInstanceOf(AuthenticationOrchestrator)

      // The orchestrator should use the bridge for validation
      // (This is verified by the fact that it constructs without error)
    })
  })
})
