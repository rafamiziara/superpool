import { ConnectionStateManager, connectionStateManager } from './connectionStateManager'

describe('ConnectionStateManager', () => {
  let manager: ConnectionStateManager

  beforeEach(() => {
    manager = new ConnectionStateManager()
  })

  describe('captureState', () => {
    it('should capture connection state with sequence number', () => {
      const state1 = manager.captureState(true, '0x123', 1)
      const state2 = manager.captureState(true, '0x123', 1)

      expect(state1.isConnected).toBe(true)
      expect(state1.address).toBe('0x123')
      expect(state1.chainId).toBe(1)
      expect(state1.sequenceNumber).toBe(1)
      expect(state1.timestamp).toBeDefined()

      expect(state2.sequenceNumber).toBe(2)
      expect(state2.sequenceNumber).toBeGreaterThan(state1.sequenceNumber)
    })

    it('should increment sequence counter correctly', () => {
      const state1 = manager.captureState(true, '0x123', 1)
      const state2 = manager.captureState(false, '0x456', 2)
      const state3 = manager.captureState(true, '0x789', 137)

      expect(state1.sequenceNumber).toBe(1)
      expect(state2.sequenceNumber).toBe(2)
      expect(state3.sequenceNumber).toBe(3)
    })
  })

  describe('validateState', () => {
    it('should validate consistent states', () => {
      const lockedState = manager.captureState(true, '0x123', 1)
      const currentState = manager.captureState(true, '0x123', 1)

      const isValid = manager.validateState(lockedState, currentState, 'test checkpoint')

      expect(isValid).toBe(true)
    })

    it('should detect connection state changes', () => {
      const lockedState = manager.captureState(true, '0x123', 1)
      const currentState = manager.captureState(false, '0x123', 1) // Connection changed

      const isValid = manager.validateState(lockedState, currentState, 'test checkpoint')

      expect(isValid).toBe(false)
    })

    it('should detect address changes', () => {
      const lockedState = manager.captureState(true, '0x123', 1)
      const currentState = manager.captureState(true, '0x456', 1) // Address changed

      const isValid = manager.validateState(lockedState, currentState, 'test checkpoint')

      expect(isValid).toBe(false)
    })

    it('should detect chain ID changes', () => {
      const lockedState = manager.captureState(true, '0x123', 1)
      const currentState = manager.captureState(true, '0x123', 137) // Chain changed

      const isValid = manager.validateState(lockedState, currentState, 'test checkpoint')

      expect(isValid).toBe(false)
    })

    it('should allow sequence number progression', () => {
      const lockedState = manager.captureState(true, '0x123', 1)
      const currentState = manager.captureState(true, '0x123', 1) // Same state, later sequence

      const isValid = manager.validateState(lockedState, currentState, 'test checkpoint')

      expect(isValid).toBe(true)
      expect(currentState.sequenceNumber).toBeGreaterThan(lockedState.sequenceNumber)
    })

    it('should reject backwards sequence numbers', () => {
      const laterState = manager.captureState(true, '0x123', 1)
      const earlierState = {
        ...laterState,
        sequenceNumber: laterState.sequenceNumber - 1,
      }

      const isValid = manager.validateState(laterState, earlierState, 'test checkpoint')

      expect(isValid).toBe(false)
    })
  })

  describe('validateInitialState', () => {
    it('should validate correct initial state', () => {
      const state = manager.captureState(true, '0x123', 1)

      const result = manager.validateInitialState(state, '0x123')

      expect(result.isValid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should reject disconnected state', () => {
      const state = manager.captureState(false, '0x123', 1)

      const result = manager.validateInitialState(state, '0x123')

      expect(result.isValid).toBe(false)
      expect(result.error).toBe('Wallet connection state invalid')
    })

    it('should reject state with no address', () => {
      const state = manager.captureState(true, undefined, 1)

      const result = manager.validateInitialState(state, '0x123')

      expect(result.isValid).toBe(false)
      expect(result.error).toBe('Wallet connection state invalid')
    })

    it('should reject address mismatch (case-sensitive)', () => {
      const state = manager.captureState(true, '0x123', 1)

      const result = manager.validateInitialState(state, '0x456')

      expect(result.isValid).toBe(false)
      expect(result.error).toBe('Wallet address mismatch')
    })

    it('should handle case-insensitive address matching', () => {
      const state = manager.captureState(true, '0x123ABC', 1)

      const result = manager.validateInitialState(state, '0x123abc')

      expect(result.isValid).toBe(true)
    })

    it('should reject state with no chainId', () => {
      const state = manager.captureState(true, '0x123', undefined)

      const result = manager.validateInitialState(state, '0x123')

      expect(result.isValid).toBe(false)
      expect(result.error).toBe('ChainId not found')
    })
  })

  describe('resetSequence', () => {
    it('should reset sequence counter', () => {
      const state1 = manager.captureState(true, '0x123', 1)
      expect(state1.sequenceNumber).toBe(1)

      manager.resetSequence()

      const state2 = manager.captureState(true, '0x123', 1)
      expect(state2.sequenceNumber).toBe(1) // Reset back to 1
    })
  })

  describe('singleton instance', () => {
    it('should provide a singleton instance', () => {
      expect(connectionStateManager).toBeInstanceOf(ConnectionStateManager)

      const state1 = connectionStateManager.captureState(true, '0x123', 1)
      const state2 = connectionStateManager.captureState(true, '0x456', 2)

      expect(state2.sequenceNumber).toBe(state1.sequenceNumber + 1)
    })
  })
})
