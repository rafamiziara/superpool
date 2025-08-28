import { renderHook } from '@testing-library/react-native'
import { useAccount } from 'wagmi'
import { useWalletConnectionTrigger } from './useWalletConnectionTrigger'

// wagmi is already mocked in setupTests.ts
const mockUseAccount = useAccount as jest.MockedFunction<typeof useAccount>

// Helper function to create mock account states with proper typing
const createMockAccountState = (overrides = {}) =>
  ({
    address: undefined,
    addresses: undefined,
    chain: undefined,
    chainId: undefined,
    connector: undefined,
    isConnected: false,
    isReconnecting: false,
    isConnecting: false,
    isDisconnected: true,
    status: 'disconnected' as const,
    ...overrides,
  }) as ReturnType<typeof useAccount>

const createMockChain = (id: number, name: string) =>
  ({
    id,
    name,
    nativeCurrency: {
      name: id === 1 ? 'Ether' : 'MATIC',
      symbol: id === 1 ? 'ETH' : 'MATIC',
      decimals: 18,
    },
    rpcUrls: {
      default: {
        http: [id === 1 ? 'https://mainnet.infura.io' : 'https://polygon-rpc.com'],
      },
    },
  }) as const

describe('useWalletConnectionTrigger', () => {
  const mockOnNewConnection = jest.fn()
  const mockOnDisconnection = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()

    // Default mock state
    mockUseAccount.mockReturnValue(createMockAccountState())
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should handle new wallet connection', () => {
    // Start with disconnected state
    const { rerender } = renderHook(() =>
      useWalletConnectionTrigger({
        onNewConnection: mockOnNewConnection,
        onDisconnection: mockOnDisconnection,
      })
    )

    expect(mockOnNewConnection).not.toHaveBeenCalled()

    // Simulate wallet connection
    mockUseAccount.mockReturnValue(
      createMockAccountState({
        address: '0x1234567890123456789012345678901234567890',
        addresses: ['0x1234567890123456789012345678901234567890'],
        chain: createMockChain(1, 'Ethereum'),
        chainId: 1,
        isConnected: true,
        isDisconnected: false,
        status: 'connected',
      })
    )

    rerender()

    // Should schedule authentication trigger with debounce
    expect(mockOnNewConnection).not.toHaveBeenCalled() // Not called immediately

    // Fast-forward timers to trigger debounced call
    jest.runAllTimers()

    expect(mockOnNewConnection).toHaveBeenCalledWith('0x1234567890123456789012345678901234567890', 1)
    expect(mockOnNewConnection).toHaveBeenCalledTimes(1)
  })

  it('should handle wallet disconnection', () => {
    // Start with connected state
    mockUseAccount.mockReturnValue(
      createMockAccountState({
        address: '0x1234567890123456789012345678901234567890',
        addresses: ['0x1234567890123456789012345678901234567890'],
        chain: createMockChain(1, 'Ethereum'),
        chainId: 1,
        isConnected: true,
        isDisconnected: false,
        status: 'connected',
      })
    )

    const { rerender } = renderHook(() =>
      useWalletConnectionTrigger({
        onNewConnection: mockOnNewConnection,
        onDisconnection: mockOnDisconnection,
      })
    )

    // Simulate wallet disconnection
    mockUseAccount.mockReturnValue(createMockAccountState())

    rerender()

    expect(mockOnDisconnection).toHaveBeenCalledTimes(1)
    expect(mockOnDisconnection).toHaveBeenCalledWith()
  })

  it('should handle chain changes without triggering new authentication', () => {
    // Start with connected state on Ethereum
    mockUseAccount.mockReturnValue(
      createMockAccountState({
        address: '0x1234567890123456789012345678901234567890',
        addresses: ['0x1234567890123456789012345678901234567890'],
        chain: createMockChain(1, 'Ethereum'),
        chainId: 1,
        isConnected: true,
        isDisconnected: false,
        status: 'connected',
      })
    )

    const { rerender } = renderHook(() =>
      useWalletConnectionTrigger({
        onNewConnection: mockOnNewConnection,
        onDisconnection: mockOnDisconnection,
      })
    )

    // Change to Polygon
    mockUseAccount.mockReturnValue(
      createMockAccountState({
        address: '0x1234567890123456789012345678901234567890',
        addresses: ['0x1234567890123456789012345678901234567890'],
        chain: createMockChain(137, 'Polygon'),
        chainId: 137,
        isConnected: true,
        isDisconnected: false,
        status: 'connected',
      })
    )

    rerender()

    // Should NOT trigger new authentication for chain changes
    jest.runAllTimers()
    expect(mockOnNewConnection).not.toHaveBeenCalled()
    expect(mockOnDisconnection).not.toHaveBeenCalled()
  })

  it('should debounce multiple rapid connection changes', () => {
    const { rerender } = renderHook(() =>
      useWalletConnectionTrigger({
        onNewConnection: mockOnNewConnection,
        onDisconnection: mockOnDisconnection,
      })
    )

    // First connection from disconnected state
    mockUseAccount.mockReturnValue(
      createMockAccountState({
        address: '0x1234567890123456789012345678901234567890',
        addresses: ['0x1234567890123456789012345678901234567890'],
        chain: createMockChain(1, 'Ethereum'),
        chainId: 1,
        isConnected: true,
        isDisconnected: false,
        status: 'connected',
      })
    )
    rerender()

    // Rapid disconnection
    mockUseAccount.mockReturnValue(createMockAccountState())
    rerender()

    // Rapid reconnection before first timeout completes
    mockUseAccount.mockReturnValue(
      createMockAccountState({
        address: '0x1234567890123456789012345678901234567890',
        addresses: ['0x1234567890123456789012345678901234567890'],
        chain: createMockChain(1, 'Ethereum'),
        chainId: 1,
        isConnected: true,
        isDisconnected: false,
        status: 'connected',
      })
    )
    rerender()

    // Should trigger authentication for the new connection after debounce
    jest.runAllTimers()
    expect(mockOnNewConnection).toHaveBeenCalledTimes(1)
    expect(mockOnNewConnection).toHaveBeenCalledWith('0x1234567890123456789012345678901234567890', 1)
  })

  it('should cleanup timeouts on unmount', () => {
    mockUseAccount.mockReturnValue(
      createMockAccountState({
        address: '0x1234567890123456789012345678901234567890',
        addresses: ['0x1234567890123456789012345678901234567890'],
        chain: createMockChain(1, 'Ethereum'),
        chainId: 1,
        isConnected: true,
        isDisconnected: false,
        status: 'connected',
      })
    )

    const { unmount } = renderHook(() =>
      useWalletConnectionTrigger({
        onNewConnection: mockOnNewConnection,
        onDisconnection: mockOnDisconnection,
      })
    )

    // Should not crash on unmount with pending timeouts
    expect(() => unmount()).not.toThrow()
  })

  it('should reset connection state on mount', () => {
    // Start already connected (simulating page refresh scenario)
    mockUseAccount.mockReturnValue(
      createMockAccountState({
        address: '0x1234567890123456789012345678901234567890',
        addresses: ['0x1234567890123456789012345678901234567890'],
        chain: createMockChain(1, 'Ethereum'),
        chainId: 1,
        isConnected: true,
        isDisconnected: false,
        status: 'connected',
      })
    )

    renderHook(() =>
      useWalletConnectionTrigger({
        onNewConnection: mockOnNewConnection,
        onDisconnection: mockOnDisconnection,
      })
    )

    // Should trigger new connection since previous state was reset
    jest.runAllTimers()
    expect(mockOnNewConnection).toHaveBeenCalledWith('0x1234567890123456789012345678901234567890', 1)
  })
})
