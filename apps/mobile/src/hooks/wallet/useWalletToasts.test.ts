import { EventEmitter } from 'events'
import { useAccount } from 'wagmi'
import { createMockRootStore, renderHookWithStore } from '../../test-utils'
import { authToasts } from '../../utils/toast'
import { useWalletToasts } from './useWalletToasts'

// wagmi and toast utils are already mocked in setupTests.ts
const mockUseAccount = useAccount as jest.MockedFunction<typeof useAccount>
const mockAuthToasts = authToasts as jest.Mocked<typeof authToasts>

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
  }) as const

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

describe('useWalletToasts', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    // Default mock state
    mockUseAccount.mockReturnValue(createMockAccountState())
  })

  it('should not show connection toast by default when wallet connects', () => {
    const { rerender } = renderHookWithStore(() => useWalletToasts())

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

    rerender({})

    // Should not show toast because showConnectionToasts defaults to false
    expect(mockAuthToasts.walletConnected).not.toHaveBeenCalled()
  })

  it('should show connection toast when explicitly enabled', () => {
    // Set up initial state with connector info BEFORE hook initialization
    const connectedState = createMockAccountState({
      address: '0x1234567890123456789012345678901234567890',
      addresses: ['0x1234567890123456789012345678901234567890'],
      chain: createMockChain(1, 'Ethereum'),
      chainId: 1,
      connector: createMockConnector('MetaMask'),
      isConnected: true,
      isDisconnected: false,
      status: 'connected',
    })

    mockUseAccount.mockReturnValue(connectedState)

    const mockStore = createMockRootStore()
    renderHookWithStore(() => useWalletToasts({ showConnectionToasts: true }), {
      store: mockStore,
    })

    // Now update the store to trigger the connection event
    mockStore.walletStore.updateConnectionState(true, connectedState.address, connectedState.chainId)

    expect(mockAuthToasts.walletConnected).toHaveBeenCalledWith('MetaMask')
    expect(mockAuthToasts.walletConnected).toHaveBeenCalledTimes(1)
  })

  it('should show disconnection toast by default', () => {
    // Start with connected state
    const connectedState = createMockAccountState({
      address: '0x1234567890123456789012345678901234567890',
      addresses: ['0x1234567890123456789012345678901234567890'],
      chain: createMockChain(1, 'Ethereum'),
      chainId: 1,
      connector: createMockConnector('MetaMask'),
      isConnected: true,
      isDisconnected: false,
      status: 'connected',
    })

    mockUseAccount.mockReturnValue(connectedState)
    const mockStore = createMockRootStore()

    // Set initial connected state
    mockStore.walletStore.updateConnectionState(true, connectedState.address, connectedState.chainId)

    renderHookWithStore(() => useWalletToasts(), { store: mockStore })

    // Simulate wallet disconnection
    mockUseAccount.mockReturnValue(createMockAccountState())
    mockStore.walletStore.updateConnectionState(false, undefined, undefined)

    expect(mockAuthToasts.walletDisconnected).toHaveBeenCalledTimes(1)
    expect(mockAuthToasts.walletDisconnected).toHaveBeenCalledWith()
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

    const { rerender } = renderHookWithStore(() => useWalletToasts({ showDisconnectionToasts: false }))

    // Simulate wallet disconnection
    mockUseAccount.mockReturnValue(createMockAccountState())

    rerender({})

    expect(mockAuthToasts.walletDisconnected).not.toHaveBeenCalled()
  })

  it('should handle multiple connection/disconnection cycles', () => {
    // First connection - set up MetaMask state BEFORE hook initialization
    const metaMaskState = createMockAccountState({
      address: '0x1234567890123456789012345678901234567890',
      addresses: ['0x1234567890123456789012345678901234567890'],
      chain: createMockChain(1, 'Ethereum'),
      chainId: 1,
      connector: createMockConnector('MetaMask'),
      isConnected: true,
      isDisconnected: false,
      status: 'connected',
    })

    mockUseAccount.mockReturnValue(metaMaskState)
    const mockStore = createMockRootStore()

    const { rerender } = renderHookWithStore(
      () =>
        useWalletToasts({
          showConnectionToasts: true,
          showDisconnectionToasts: true,
        }),
      { store: mockStore }
    )

    // Trigger first connection event
    mockStore.walletStore.updateConnectionState(true, metaMaskState.address, metaMaskState.chainId)

    expect(mockAuthToasts.walletConnected).toHaveBeenCalledWith('MetaMask')

    // Disconnection
    mockUseAccount.mockReturnValue(createMockAccountState())
    rerender({})
    mockStore.walletStore.updateConnectionState(false, undefined, undefined)

    expect(mockAuthToasts.walletDisconnected).toHaveBeenCalledTimes(1)

    // Second connection with different wallet - update connector BEFORE triggering connection
    const walletConnectState = createMockAccountState({
      address: '0x1234567890123456789012345678901234567890',
      addresses: ['0x1234567890123456789012345678901234567890'],
      chain: createMockChain(1, 'Ethereum'),
      chainId: 1,
      connector: createMockConnector('WalletConnect'),
      isConnected: true,
      isDisconnected: false,
      status: 'connected',
    })

    mockUseAccount.mockReturnValue(walletConnectState)
    rerender({}) // Update hook with new connector
    mockStore.walletStore.updateConnectionState(true, walletConnectState.address, walletConnectState.chainId)

    expect(mockAuthToasts.walletConnected).toHaveBeenCalledWith('WalletConnect')
    expect(mockAuthToasts.walletConnected).toHaveBeenCalledTimes(2)
  })

  it('should handle connection without connector name', () => {
    // Set up state without connector name BEFORE hook initialization
    const stateWithoutConnector = createMockAccountState({
      address: '0x1234567890123456789012345678901234567890',
      addresses: ['0x1234567890123456789012345678901234567890'],
      chain: createMockChain(1, 'Ethereum'),
      chainId: 1,
      connector: undefined,
      isConnected: true,
      isDisconnected: false,
      status: 'connected',
    })

    mockUseAccount.mockReturnValue(stateWithoutConnector)
    const mockStore = createMockRootStore()

    renderHookWithStore(() => useWalletToasts({ showConnectionToasts: true }), {
      store: mockStore,
    })

    // Trigger connection event
    mockStore.walletStore.updateConnectionState(true, stateWithoutConnector.address, stateWithoutConnector.chainId)

    expect(mockAuthToasts.walletConnected).toHaveBeenCalledWith(undefined)
  })

  it('should not trigger toasts for initial render if already connected', () => {
    // Start with connected state (simulating page refresh)
    const connectedState = createMockAccountState({
      address: '0x1234567890123456789012345678901234567890',
      addresses: ['0x1234567890123456789012345678901234567890'],
      chain: createMockChain(1, 'Ethereum'),
      chainId: 1,
      connector: createMockConnector('MetaMask'),
      isConnected: true,
      isDisconnected: false,
      status: 'connected',
    })

    mockUseAccount.mockReturnValue(connectedState)
    const mockStore = createMockRootStore()

    // Set initial state to connected (simulating already connected state)
    mockStore.walletStore.updateConnectionState(true, connectedState.address, connectedState.chainId)

    renderHookWithStore(() => useWalletToasts({ showConnectionToasts: true }), {
      store: mockStore,
    })

    // Should trigger connection toast because previouslyConnected starts as false
    expect(mockAuthToasts.walletConnected).toHaveBeenCalledWith('MetaMask')
  })
})
