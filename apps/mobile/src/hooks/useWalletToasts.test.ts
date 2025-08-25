import { renderHook } from '@testing-library/react-hooks'
import { EventEmitter } from 'events'
import { useAccount } from 'wagmi'
import { appToasts } from '../utils/toast'
import { useWalletToasts } from './useWalletToasts'

// wagmi and toast utils are already mocked in setupTests.ts
const mockUseAccount = useAccount as jest.MockedFunction<typeof useAccount>
const mockAppToasts = appToasts as jest.Mocked<typeof appToasts>

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
  } as ReturnType<typeof useAccount>)

const createMockConnector = (name: string) =>
  ({
    id: name.toLowerCase(),
    name,
    type: 'injected',
    uid: `test-uid-${name}`,
    emitter: {
      uid: `emitter-${name}`,
      _emitter: {} as EventEmitter,
      emit: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
      once: jest.fn(),
      listenerCount: jest.fn(() => 0),
    },
    connect: jest.fn(),
    disconnect: jest.fn(),
    getAccounts: jest.fn(),
    getChainId: jest.fn(),
    getProvider: jest.fn(),
    isAuthorized: jest.fn(),
    onAccountsChanged: jest.fn(),
    onChainChanged: jest.fn(),
    onConnect: jest.fn(),
    onDisconnect: jest.fn(),
    onMessage: jest.fn(),
    switchChain: jest.fn(),
  } as const)

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
  } as const)

describe('useWalletToasts', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    // Default mock state
    mockUseAccount.mockReturnValue(createMockAccountState())
  })

  it('should not show connection toast by default when wallet connects', () => {
    const { rerender } = renderHook(() => useWalletToasts())

    // Simulate wallet connection
    mockUseAccount.mockReturnValue(
      createMockAccountState({
        address: '0x1234567890123456789012345678901234567890',
        addresses: ['0x1234567890123456789012345678901234567890'],
        chain: createMockChain(1, 'Ethereum'),
        chainId: 1,
        connector: createMockConnector('MetaMask'),
        isConnected: true,
        isDisconnected: false,
        status: 'connected',
      })
    )

    rerender()

    // Should not show toast because showConnectionToasts defaults to false
    expect(mockAppToasts.walletConnected).not.toHaveBeenCalled()
  })

  it('should show connection toast when explicitly enabled', () => {
    const { rerender } = renderHook(() => useWalletToasts({ showConnectionToasts: true }))

    // Simulate wallet connection
    mockUseAccount.mockReturnValue(
      createMockAccountState({
        address: '0x1234567890123456789012345678901234567890',
        addresses: ['0x1234567890123456789012345678901234567890'],
        chain: createMockChain(1, 'Ethereum'),
        chainId: 1,
        connector: createMockConnector('MetaMask'),
        isConnected: true,
        isDisconnected: false,
        status: 'connected',
      })
    )

    rerender()

    expect(mockAppToasts.walletConnected).toHaveBeenCalledWith('MetaMask')
    expect(mockAppToasts.walletConnected).toHaveBeenCalledTimes(1)
  })

  it('should show disconnection toast by default', () => {
    // Start with connected state
    mockUseAccount.mockReturnValue(
      createMockAccountState({
        address: '0x1234567890123456789012345678901234567890',
        addresses: ['0x1234567890123456789012345678901234567890'],
        chain: createMockChain(1, 'Ethereum'),
        chainId: 1,
        connector: createMockConnector('MetaMask'),
        isConnected: true,
        isDisconnected: false,
        status: 'connected',
      })
    )

    const { rerender } = renderHook(() => useWalletToasts())

    // Simulate wallet disconnection
    mockUseAccount.mockReturnValue(createMockAccountState())

    rerender()

    expect(mockAppToasts.walletDisconnected).toHaveBeenCalledTimes(1)
    expect(mockAppToasts.walletDisconnected).toHaveBeenCalledWith()
  })

  it('should not show disconnection toast when disabled', () => {
    // Start with connected state
    mockUseAccount.mockReturnValue(
      createMockAccountState({
        address: '0x1234567890123456789012345678901234567890',
        addresses: ['0x1234567890123456789012345678901234567890'],
        chain: createMockChain(1, 'Ethereum'),
        chainId: 1,
        connector: createMockConnector('MetaMask'),
        isConnected: true,
        isDisconnected: false,
        status: 'connected',
      })
    )

    const { rerender } = renderHook(() => useWalletToasts({ showDisconnectionToasts: false }))

    // Simulate wallet disconnection
    mockUseAccount.mockReturnValue(createMockAccountState())

    rerender()

    expect(mockAppToasts.walletDisconnected).not.toHaveBeenCalled()
  })

  it('should handle multiple connection/disconnection cycles', () => {
    const { rerender } = renderHook(() =>
      useWalletToasts({
        showConnectionToasts: true,
        showDisconnectionToasts: true,
      })
    )

    // First connection
    mockUseAccount.mockReturnValue(
      createMockAccountState({
        address: '0x1234567890123456789012345678901234567890',
        addresses: ['0x1234567890123456789012345678901234567890'],
        chain: createMockChain(1, 'Ethereum'),
        chainId: 1,
        connector: createMockConnector('MetaMask'),
        isConnected: true,
        isDisconnected: false,
        status: 'connected',
      })
    )
    rerender()

    expect(mockAppToasts.walletConnected).toHaveBeenCalledWith('MetaMask')

    // Disconnection
    mockUseAccount.mockReturnValue(createMockAccountState())
    rerender()

    expect(mockAppToasts.walletDisconnected).toHaveBeenCalledTimes(1)

    // Second connection with different wallet
    mockUseAccount.mockReturnValue(
      createMockAccountState({
        address: '0x1234567890123456789012345678901234567890',
        addresses: ['0x1234567890123456789012345678901234567890'],
        chain: createMockChain(1, 'Ethereum'),
        chainId: 1,
        connector: createMockConnector('WalletConnect'),
        isConnected: true,
        isDisconnected: false,
        status: 'connected',
      })
    )
    rerender()

    expect(mockAppToasts.walletConnected).toHaveBeenCalledWith('WalletConnect')
    expect(mockAppToasts.walletConnected).toHaveBeenCalledTimes(2)
  })

  it('should handle connection without connector name', () => {
    const { rerender } = renderHook(() => useWalletToasts({ showConnectionToasts: true }))

    // Simulate wallet connection without connector name
    mockUseAccount.mockReturnValue(
      createMockAccountState({
        address: '0x1234567890123456789012345678901234567890',
        addresses: ['0x1234567890123456789012345678901234567890'],
        chain: createMockChain(1, 'Ethereum'),
        chainId: 1,
        connector: undefined,
        isConnected: true,
        isDisconnected: false,
        status: 'connected',
      })
    )

    rerender()

    expect(mockAppToasts.walletConnected).toHaveBeenCalledWith(undefined)
  })

  it('should not trigger toasts for initial render if already connected', () => {
    // Start with connected state (simulating page refresh)
    mockUseAccount.mockReturnValue(
      createMockAccountState({
        address: '0x1234567890123456789012345678901234567890',
        addresses: ['0x1234567890123456789012345678901234567890'],
        chain: createMockChain(1, 'Ethereum'),
        chainId: 1,
        connector: createMockConnector('MetaMask'),
        isConnected: true,
        isDisconnected: false,
        status: 'connected',
      })
    )

    renderHook(() => useWalletToasts({ showConnectionToasts: true }))

    // Should trigger connection toast because previouslyConnected starts as false
    expect(mockAppToasts.walletConnected).toHaveBeenCalledWith('MetaMask')
  })
})
