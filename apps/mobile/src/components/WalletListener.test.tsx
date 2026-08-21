import { render } from '@testing-library/react-native'
import React from 'react'
import { mockWagmiUseAccount } from '../__tests__/mocks'
import { unregisterForPushNotifications } from '../services/pushNotifications'
import { authStore } from '../stores/AuthStore'
import { WalletListener } from './WalletListener'

jest.mock('../services/pushNotifications', () => ({ unregisterForPushNotifications: jest.fn(async () => undefined) }))

const mockUnregister = unregisterForPushNotifications as jest.Mock

const WALLET_A = '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`
const WALLET_B = '0x0000000000000000000000000000000000000042' as `0x${string}`

function connected(address: `0x${string}`) {
  return { address, chainId: 1, isConnected: true, isConnecting: false }
}

const DISCONNECTED = { address: undefined, chainId: undefined, isConnected: false, isConnecting: false }

// Mock AuthStore (not covered by global mocks)
jest.mock('../stores/AuthStore', () => ({
  authStore: {
    initializeWalletState: jest.fn(),
    updateWalletState: jest.fn(),
  },
}))

describe('WalletListener', () => {
  const mockInitializeWalletState = authStore.initializeWalletState as jest.Mock
  const mockUpdateWalletState = authStore.updateWalletState as jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()

    // Default useAccount return value
    mockWagmiUseAccount.mockReturnValue({
      address: undefined,
      chainId: undefined,
      isConnected: false,
      isConnecting: false,
    })
  })

  describe('Component Rendering', () => {
    it('should render without crashing and return null', () => {
      const result = render(<WalletListener />)

      // Component returns null, so no children should be rendered
      expect(result.toJSON()).toBeNull()
    })
  })

  describe('Wallet State Initialization (lines 13-14)', () => {
    it('should initialize wallet state on mount', () => {
      render(<WalletListener />)

      expect(mockInitializeWalletState).toHaveBeenCalledTimes(1)
    })
  })

  describe('Wallet State Updates (lines 17-22)', () => {
    it('should update wallet state with default values', () => {
      mockWagmiUseAccount.mockReturnValue({
        address: undefined,
        chainId: undefined,
        isConnected: false,
        isConnecting: false,
      })

      render(<WalletListener />)

      expect(mockUpdateWalletState).toHaveBeenCalledWith({
        isConnected: false,
        address: undefined,
        chainId: undefined,
        isConnecting: false,
      })
    })

    it('should update wallet state when wallet is connected', () => {
      mockWagmiUseAccount.mockReturnValue({
        address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
        chainId: 1,
        isConnected: true,
        isConnecting: false,
      })

      render(<WalletListener />)

      expect(mockUpdateWalletState).toHaveBeenCalledWith({
        isConnected: true,
        address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
        chainId: 1,
        isConnecting: false,
      })
    })

    it('should update wallet state when wallet is connecting', () => {
      mockWagmiUseAccount.mockReturnValue({
        address: undefined,
        chainId: undefined,
        isConnected: false,
        isConnecting: true,
      })

      render(<WalletListener />)

      expect(mockUpdateWalletState).toHaveBeenCalledWith({
        isConnected: false,
        address: undefined,
        chainId: undefined,
        isConnecting: true,
      })
    })

    it('should update wallet state when wallet is disconnected', () => {
      mockWagmiUseAccount.mockReturnValue({
        address: undefined,
        chainId: undefined,
        isConnected: false,
        isConnecting: false,
      })

      render(<WalletListener />)

      expect(mockUpdateWalletState).toHaveBeenCalledWith({
        isConnected: false,
        address: undefined,
        chainId: undefined,
        isConnecting: false,
      })
    })
  })

  describe('Effect Dependencies (line 23)', () => {
    it('should re-run effect when isConnected changes', () => {
      const { rerender } = render(<WalletListener />)

      // Initial render
      expect(mockUpdateWalletState).toHaveBeenCalledTimes(1)

      // Change isConnected
      mockWagmiUseAccount.mockReturnValue({
        address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
        chainId: 1,
        isConnected: true,
        isConnecting: false,
      })

      rerender(<WalletListener />)

      expect(mockUpdateWalletState).toHaveBeenCalledTimes(2)
      expect(mockUpdateWalletState).toHaveBeenLastCalledWith({
        isConnected: true,
        address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
        chainId: 1,
        isConnecting: false,
      })
    })

    it('should re-run effect when address changes', () => {
      const { rerender } = render(<WalletListener />)

      // Initial render
      expect(mockUpdateWalletState).toHaveBeenCalledTimes(1)

      // Change address
      mockWagmiUseAccount.mockReturnValue({
        address: '0xnewaddress1234567890abcdef1234567890abcdef' as `0x${string}`,
        chainId: 1,
        isConnected: true,
        isConnecting: false,
      })

      rerender(<WalletListener />)

      expect(mockUpdateWalletState).toHaveBeenCalledTimes(2)
      expect(mockUpdateWalletState).toHaveBeenLastCalledWith({
        isConnected: true,
        address: '0xnewaddress1234567890abcdef1234567890abcdef' as `0x${string}`,
        chainId: 1,
        isConnecting: false,
      })
    })

    it('should re-run effect when chainId changes', () => {
      const { rerender } = render(<WalletListener />)

      // Initial render
      expect(mockUpdateWalletState).toHaveBeenCalledTimes(1)

      // Change chainId
      mockWagmiUseAccount.mockReturnValue({
        address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
        chainId: 137, // Polygon
        isConnected: true,
        isConnecting: false,
      })

      rerender(<WalletListener />)

      expect(mockUpdateWalletState).toHaveBeenCalledTimes(2)
      expect(mockUpdateWalletState).toHaveBeenLastCalledWith({
        isConnected: true,
        address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
        chainId: 137,
        isConnecting: false,
      })
    })

    it('should re-run effect when isConnecting changes', () => {
      const { rerender } = render(<WalletListener />)

      // Initial render
      expect(mockUpdateWalletState).toHaveBeenCalledTimes(1)

      // Change isConnecting
      mockWagmiUseAccount.mockReturnValue({
        address: undefined,
        chainId: undefined,
        isConnected: false,
        isConnecting: true,
      })

      rerender(<WalletListener />)

      expect(mockUpdateWalletState).toHaveBeenCalledTimes(2)
      expect(mockUpdateWalletState).toHaveBeenLastCalledWith({
        isConnected: false,
        address: undefined,
        chainId: undefined,
        isConnecting: true,
      })
    })

    it('should not re-run effect when dependencies do not change', () => {
      const walletState = {
        address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
        chainId: 1,
        isConnected: true,
        isConnecting: false,
      }

      mockWagmiUseAccount.mockReturnValue(walletState)

      const { rerender } = render(<WalletListener />)

      // Initial render
      expect(mockUpdateWalletState).toHaveBeenCalledTimes(1)

      // Rerender with same values
      mockWagmiUseAccount.mockReturnValue(walletState)
      rerender(<WalletListener />)

      // Should not call updateWalletState again
      expect(mockUpdateWalletState).toHaveBeenCalledTimes(1)
    })
  })

  describe('Wallet State Transitions', () => {
    it('should handle complete wallet connection flow', () => {
      const { rerender } = render(<WalletListener />)

      // Initial state - disconnected
      expect(mockUpdateWalletState).toHaveBeenLastCalledWith({
        isConnected: false,
        address: undefined,
        chainId: undefined,
        isConnecting: false,
      })

      // Start connecting
      mockWagmiUseAccount.mockReturnValue({
        address: undefined,
        chainId: undefined,
        isConnected: false,
        isConnecting: true,
      })
      rerender(<WalletListener />)

      expect(mockUpdateWalletState).toHaveBeenLastCalledWith({
        isConnected: false,
        address: undefined,
        chainId: undefined,
        isConnecting: true,
      })

      // Connection successful
      mockWagmiUseAccount.mockReturnValue({
        address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
        chainId: 1,
        isConnected: true,
        isConnecting: false,
      })
      rerender(<WalletListener />)

      expect(mockUpdateWalletState).toHaveBeenLastCalledWith({
        isConnected: true,
        address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
        chainId: 1,
        isConnecting: false,
      })

      expect(mockUpdateWalletState).toHaveBeenCalledTimes(3)
      // initializeWalletState is called on each render, not just once
      expect(mockInitializeWalletState).toHaveBeenCalledTimes(3)
    })

    it('should handle wallet disconnection', () => {
      // Start connected
      mockWagmiUseAccount.mockReturnValue({
        address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
        chainId: 1,
        isConnected: true,
        isConnecting: false,
      })

      const { rerender } = render(<WalletListener />)

      expect(mockUpdateWalletState).toHaveBeenLastCalledWith({
        isConnected: true,
        address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
        chainId: 1,
        isConnecting: false,
      })

      // Disconnect wallet
      mockWagmiUseAccount.mockReturnValue({
        address: undefined,
        chainId: undefined,
        isConnected: false,
        isConnecting: false,
      })
      rerender(<WalletListener />)

      expect(mockUpdateWalletState).toHaveBeenLastCalledWith({
        isConnected: false,
        address: undefined,
        chainId: undefined,
        isConnecting: false,
      })

      expect(mockUpdateWalletState).toHaveBeenCalledTimes(2)
    })
  })

  // -------------------------------------------------------------------------
  // Giving the push token back.
  //
  // A token left registered to the outgoing wallet delivers its join and loan
  // requests to whoever uses the device next — a privacy leak, not an
  // annoyance. Re-registration happens after the new wallet authenticates.
  // -------------------------------------------------------------------------

  describe('push token handover', () => {
    it('gives the token back when the wallet disconnects', () => {
      mockWagmiUseAccount.mockReturnValue(connected(WALLET_A))
      const { rerender } = render(<WalletListener />)

      mockWagmiUseAccount.mockReturnValue(DISCONNECTED)
      rerender(<WalletListener />)

      expect(mockUnregister).toHaveBeenCalledTimes(1)
    })

    it('gives it back when the wallet is switched without disconnecting', () => {
      mockWagmiUseAccount.mockReturnValue(connected(WALLET_A))
      const { rerender } = render(<WalletListener />)

      mockWagmiUseAccount.mockReturnValue(connected(WALLET_B))
      rerender(<WalletListener />)

      expect(mockUnregister).toHaveBeenCalledTimes(1)
    })

    it('does nothing on the first render, where nothing is registered yet', () => {
      mockWagmiUseAccount.mockReturnValue(connected(WALLET_A))

      render(<WalletListener />)

      expect(mockUnregister).not.toHaveBeenCalled()
    })

    it('does nothing when the same wallet stays connected', () => {
      mockWagmiUseAccount.mockReturnValue(connected(WALLET_A))
      const { rerender } = render(<WalletListener />)

      rerender(<WalletListener />)

      expect(mockUnregister).not.toHaveBeenCalled()
    })

    it('does nothing while no wallet has ever connected', () => {
      mockWagmiUseAccount.mockReturnValue(DISCONNECTED)
      const { rerender } = render(<WalletListener />)

      rerender(<WalletListener />)

      expect(mockUnregister).not.toHaveBeenCalled()
    })
  })
})
