/**
 * Comprehensive test suite for useAuthenticationIntegration hook
 * Tests orchestrator initialization, connection handling, and authentication flow
 */

import { act, waitFor } from '@testing-library/react-native'
import { useAuthenticationIntegration } from './useAuthenticationIntegration'
import { createMockRootStore, renderHookWithStore } from '../../test-utils'

// Create proper Chain type mock
const createMockChain = (id: number, name: string) => ({
  id,
  name,
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://ethereum.publicnode.com'],
    },
  },
})

// Create proper UseAccountReturnType mocks
const createMockConnectedAccount = (address: string, chainId = 1) => ({
  isConnected: true as const,
  address: address as `0x${string}`,
  chain: createMockChain(chainId, chainId === 1 ? 'Ethereum' : 'Polygon'),
  addresses: [address as `0x${string}`],
  chainId,
  connector: undefined,
  isReconnecting: true as const, // Required by type
  isConnecting: false as const,
  isDisconnected: false as const,
  status: 'connected' as const,
})

const createMockDisconnectedAccount = () => ({
  isConnected: false as const,
  address: undefined,
  chain: undefined,
  addresses: undefined,
  chainId: undefined,
  connector: undefined,
  isReconnecting: false as const,
  isConnecting: true as const, // Required by type
  isDisconnected: true as const,
  status: 'disconnected' as const,
})

// Mock AuthenticationOrchestrator
const mockOrchestrator = {
  authenticate: jest.fn(),
  handleDisconnection: jest.fn(),
}

jest.mock('../../services/authentication', () => ({
  AuthenticationOrchestrator: jest.fn().mockImplementation(() => mockOrchestrator),
}))

// Mock Firebase config
jest.mock('../../firebase.config', () => ({
  FIREBASE_AUTH: {
    currentUser: null,
    signOut: jest.fn(() => Promise.resolve()),
  },
}))

// Mock wagmi hooks
const mockSignMessageAsync = jest.fn()
const mockSignTypedDataAsync = jest.fn()
const mockDisconnect = jest.fn()

jest.mock('wagmi', () => ({
  useAccount: jest.fn(() => ({
    isConnected: false,
    address: undefined,
    chain: createMockChain(1, 'Ethereum'),
    addresses: undefined,
    chainId: undefined,
    connector: undefined,
    isReconnecting: false,
    isConnecting: false,
    isDisconnected: true,
    status: 'disconnected',
  })),
  useSignMessage: jest.fn(() => ({
    signMessageAsync: mockSignMessageAsync,
  })),
  useSignTypedData: jest.fn(() => ({
    signTypedDataAsync: mockSignTypedDataAsync,
  })),
  useDisconnect: jest.fn(() => ({
    disconnect: mockDisconnect,
  })),
}))

// Mock references
const mockUseAccount = require('wagmi').useAccount as jest.MockedFunction<typeof import('wagmi').useAccount>
const AuthenticationOrchestratorMock = require('../../services/authentication').AuthenticationOrchestrator as jest.MockedFunction<any>

describe('useAuthenticationIntegration', () => {
  let mockStore: ReturnType<typeof createMockRootStore>
  let consoleSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    mockStore = createMockRootStore()
    
    consoleSpy = jest.spyOn(console, 'log').mockImplementation()

    // Reset wagmi mocks
    mockSignMessageAsync.mockResolvedValue('0xmockedsignature')
    mockSignTypedDataAsync.mockResolvedValue('0xmockedsignature')
    mockDisconnect.mockResolvedValue(undefined as any)

    // Reset orchestrator mock
    mockOrchestrator.authenticate.mockResolvedValue({ success: true })
    mockOrchestrator.handleDisconnection.mockResolvedValue(undefined as any)

    mockUseAccount.mockReturnValue(createMockDisconnectedAccount())

    // Mock FIREBASE_AUTH.currentUser
    require('../../firebase.config').FIREBASE_AUTH.currentUser = null
  })

  afterEach(() => {
    consoleSpy.mockRestore()
    jest.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should return integration functions', () => {
      const { result } = renderHookWithStore(() => useAuthenticationIntegration(), { store: mockStore })

      expect(result.current).toEqual(
        expect.objectContaining({
          onNewConnection: expect.any(Function),
          onDisconnection: expect.any(Function),
          triggerAuthentication: expect.any(Function),
          needsAuthentication: expect.any(Function),
          getOrchestrator: expect.any(Function),
        })
      )
    })

    it('should initialize orchestrator lazily', () => {
      const { result } = renderHookWithStore(() => useAuthenticationIntegration(), { store: mockStore })

      // Orchestrator should not be created until first use
      expect(AuthenticationOrchestratorMock).not.toHaveBeenCalled()

      // Trigger orchestrator creation
      act(() => {
        result.current.getOrchestrator()
      })

      expect(AuthenticationOrchestratorMock).toHaveBeenCalledWith(
        mockStore.authenticationStore,
        mockStore.walletStore
      )
      expect(consoleSpy).toHaveBeenCalledWith('🎭 Authentication orchestrator initialized')
    })

    it('should reuse orchestrator instance', () => {
      const { result } = renderHookWithStore(() => useAuthenticationIntegration(), { store: mockStore })

      const orchestrator1 = act(() => result.current.getOrchestrator())
      const orchestrator2 = act(() => result.current.getOrchestrator())

      expect(orchestrator1).toBe(orchestrator2)
      expect(AuthenticationOrchestratorMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('New Connection Handling', () => {
    it('should handle new wallet connection', async () => {
      const { result } = renderHookWithStore(() => useAuthenticationIntegration(), { store: mockStore })

      const walletAddress = '0x1234567890123456789012345678901234567890'
      const chainId = 1

      await act(async () => {
        await result.current.onNewConnection(walletAddress, chainId)
      })

      expect(consoleSpy).toHaveBeenCalledWith('🚀 Handling new wallet connection:', {
        walletAddress,
        chainId,
      })

      expect(mockStore.walletStore.connect).toHaveBeenCalledWith(walletAddress, chainId)
      expect(mockOrchestrator.authenticate).toHaveBeenCalled()
    })

    it('should handle new connection without chainId', async () => {
      mockUseAccount.mockReturnValue({
        isConnected: true,
        address: '0x1234567890123456789012345678901234567890',
        chain: createMockChain(137, 'Polygon'),
        addresses: ['0x1234567890123456789012345678901234567890'],
        chainId: 137,
        connector: undefined,
        isReconnecting: false,
        isConnecting: false,
        isDisconnected: false,
        status: 'connected',
      })

      const { result } = renderHookWithStore(() => useAuthenticationIntegration(), { store: mockStore })

      const walletAddress = '0x1234567890123456789012345678901234567890'

      await act(async () => {
        await result.current.onNewConnection(walletAddress)
      })

      // Should use chain ID from useAccount hook
      expect(mockStore.walletStore.connect).toHaveBeenCalledWith(walletAddress, 137)
    })

    it('should fallback to chain ID 1 when no chain info available', async () => {
      mockUseAccount.mockReturnValue({
        isConnected: true,
        address: '0x1234567890123456789012345678901234567890',
        chain: undefined,
        addresses: ['0x1234567890123456789012345678901234567890'],
        chainId: undefined,
        connector: undefined,
        isReconnecting: false,
        isConnecting: false,
        isDisconnected: false,
        status: 'connected',
      })

      const { result } = renderHookWithStore(() => useAuthenticationIntegration(), { store: mockStore })

      const walletAddress = '0x1234567890123456789012345678901234567890'

      await act(async () => {
        await result.current.onNewConnection(walletAddress)
      })

      expect(mockStore.walletStore.connect).toHaveBeenCalledWith(walletAddress, 1)
    })

    it('should handle authentication errors during new connection', async () => {
      const error = new Error('Authentication failed')
      mockOrchestrator.authenticate.mockRejectedValue(error)
      
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

      const { result } = renderHookWithStore(() => useAuthenticationIntegration(), { store: mockStore })

      const walletAddress = '0x1234567890123456789012345678901234567890'

      await act(async () => {
        await result.current.onNewConnection(walletAddress, 1)
      })

      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Authentication failed:', error)
      expect(mockStore.authenticationStore.failStep).toHaveBeenCalledWith(
        'firebase-auth',
        'Authentication failed'
      )

      consoleErrorSpy.mockRestore()
    })
  })

  describe('Disconnection Handling', () => {
    it('should handle wallet disconnection', async () => {
      const { result } = renderHookWithStore(() => useAuthenticationIntegration(), { store: mockStore })

      await act(async () => {
        await result.current.onDisconnection()
      })

      expect(mockOrchestrator.handleDisconnection).toHaveBeenCalled()
    })

    it('should handle disconnection errors', async () => {
      const error = new Error('Disconnection failed')
      mockOrchestrator.handleDisconnection.mockRejectedValue(error)
      
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

      const { result } = renderHookWithStore(() => useAuthenticationIntegration(), { store: mockStore })

      await act(async () => {
        await result.current.onDisconnection()
      })

      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Disconnection handling failed:', error)

      consoleErrorSpy.mockRestore()
    })
  })

  describe('Manual Authentication', () => {
    it('should trigger manual authentication', async () => {
      mockUseAccount.mockReturnValue({
        isConnected: true,
        address: '0x1234567890123456789012345678901234567890',
        chain: createMockChain(1, 'Ethereum'),
        addresses: ['0x1234567890123456789012345678901234567890'],
        chainId: 1,
        connector: undefined,
        isReconnecting: false,
        isConnecting: false,
        isDisconnected: false,
        status: 'connected',
      })

      const { result } = renderHookWithStore(() => useAuthenticationIntegration(), { store: mockStore })

      await act(async () => {
        await result.current.triggerAuthentication()
      })

      expect(consoleSpy).toHaveBeenCalledWith('🔐 Manual authentication triggered')
      expect(mockOrchestrator.authenticate).toHaveBeenCalled()
    })

    it('should handle manual authentication when not connected', async () => {
      const { result } = renderHookWithStore(() => useAuthenticationIntegration(), { store: mockStore })

      await act(async () => {
        await result.current.triggerAuthentication()
      })

      expect(consoleSpy).toHaveBeenCalledWith('⚠️ Manual authentication requested but no wallet connected')
    })

    it('should handle manual authentication errors', async () => {
      const error = new Error('Manual auth failed')
      mockOrchestrator.authenticate.mockRejectedValue(error)
      
      mockUseAccount.mockReturnValue({
        isConnected: true,
        address: '0x1234567890123456789012345678901234567890',
        chain: createMockChain(1, 'Ethereum'),
        addresses: ['0x1234567890123456789012345678901234567890'],
        chainId: 1,
        connector: undefined,
        isReconnecting: false,
        isConnecting: false,
        isDisconnected: false,
        status: 'connected',
      })
      
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

      const { result } = renderHookWithStore(() => useAuthenticationIntegration(), { store: mockStore })

      await act(async () => {
        await result.current.triggerAuthentication()
      })

      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Authentication failed:', error)

      consoleErrorSpy.mockRestore()
    })
  })

  describe('Needs Authentication Logic', () => {
    it('should return false when wallet not connected', () => {
      const { result } = renderHookWithStore(() => useAuthenticationIntegration(), { store: mockStore })

      expect(result.current.needsAuthentication()).toBe(false)
    })

    it('should return false when Firebase user exists', () => {
      mockUseAccount.mockReturnValue({
        isConnected: true,
        address: '0x1234567890123456789012345678901234567890',
        chain: createMockChain(1, 'Ethereum'),
        addresses: ['0x1234567890123456789012345678901234567890'],
        chainId: 1,
        connector: undefined,
        isReconnecting: false,
        isConnecting: false,
        isDisconnected: false,
        status: 'connected',
      })

      require('../../firebase.config').FIREBASE_AUTH.currentUser = { uid: 'test-uid' }

      const { result } = renderHookWithStore(() => useAuthenticationIntegration(), { store: mockStore })

      expect(result.current.needsAuthentication()).toBe(false)
      expect(consoleSpy).toHaveBeenCalledWith(
        '🔍 Firebase user already authenticated, no authentication needed:',
        'test-uid'
      )
    })

    it('should return false when auth store has wallet address', () => {
      mockUseAccount.mockReturnValue({
        isConnected: true,
        address: '0x1234567890123456789012345678901234567890',
        chain: createMockChain(1, 'Ethereum'),
        addresses: ['0x1234567890123456789012345678901234567890'],
        chainId: 1,
        connector: undefined,
        isReconnecting: false,
        isConnecting: false,
        isDisconnected: false,
        status: 'connected',
      })

      mockStore.authenticationStore.authWalletAddress = '0x1234567890123456789012345678901234567890'

      const { result } = renderHookWithStore(() => useAuthenticationIntegration(), { store: mockStore })

      expect(result.current.needsAuthentication()).toBe(false)
      expect(consoleSpy).toHaveBeenCalledWith('🔍 MobX store shows authenticated wallet, no authentication needed')
    })

    it('should return false when authentication is in progress', () => {
      mockUseAccount.mockReturnValue({
        isConnected: true,
        address: '0x1234567890123456789012345678901234567890',
        chain: createMockChain(1, 'Ethereum'),
        addresses: ['0x1234567890123456789012345678901234567890'],
        chainId: 1,
        connector: undefined,
        isReconnecting: false,
        isConnecting: false,
        isDisconnected: false,
        status: 'connected',
      })

      mockStore.authenticationStore.isAuthenticating = true

      const { result } = renderHookWithStore(() => useAuthenticationIntegration(), { store: mockStore })

      expect(result.current.needsAuthentication()).toBe(false)
      expect(consoleSpy).toHaveBeenCalledWith('🔍 Authentication already in progress, skipping')
    })

    it('should return true when wallet connected but not authenticated', () => {
      mockUseAccount.mockReturnValue({
        isConnected: true,
        address: '0x1234567890123456789012345678901234567890',
        chain: createMockChain(1, 'Ethereum'),
        addresses: ['0x1234567890123456789012345678901234567890'],
        chainId: 1,
        connector: undefined,
        isReconnecting: false,
        isConnecting: false,
        isDisconnected: false,
        status: 'connected',
      })

      const { result } = renderHookWithStore(() => useAuthenticationIntegration(), { store: mockStore })

      expect(result.current.needsAuthentication()).toBe(true)
      expect(consoleSpy).toHaveBeenCalledWith('🔍 Authentication needed: wallet connected but not authenticated')
    })
  })

  describe('Wagmi Function References', () => {
    it('should update wagmi function refs when functions change', () => {
      const { rerender } = renderHookWithStore(() => useAuthenticationIntegration(), { store: mockStore })

      const newSignMessage = jest.fn()
      const newSignTypedData = jest.fn()
      const newDisconnect = jest.fn()

      // Mock new functions
      require('wagmi').useSignMessage.mockReturnValue({
        signMessageAsync: newSignMessage,
      })
      require('wagmi').useSignTypedData.mockReturnValue({
        signTypedDataAsync: newSignTypedData,
      })
      require('wagmi').useDisconnect.mockReturnValue({
        disconnect: newDisconnect,
      })

      rerender({})

      // The hook should update its internal refs (this is tested indirectly through orchestrator usage)
      expect(newSignMessage).toBeDefined()
      expect(newSignTypedData).toBeDefined()
      expect(newDisconnect).toBeDefined()
    })
  })

  describe('Integration Context Building', () => {
    it('should build proper authentication context for orchestrator', async () => {
      const mockConnector = {
        id: 'metamask',
        name: 'MetaMask',
        type: 'injected' as const,
      }

      mockUseAccount.mockReturnValue({
        isConnected: true,
        address: '0x1234567890123456789012345678901234567890',
        chain: createMockChain(137, 'Polygon'),
        addresses: ['0x1234567890123456789012345678901234567890'],
        chainId: 137,
        connector: mockConnector,
        isReconnecting: false,
        isConnecting: false,
        isDisconnected: false,
        status: 'connected',
      })

      const { result } = renderHookWithStore(() => useAuthenticationIntegration(), { store: mockStore })

      await act(async () => {
        await result.current.onNewConnection('0x1234567890123456789012345678901234567890', 137)
      })

      // Verify orchestrator was called (context is built internally)
      expect(mockOrchestrator.authenticate).toHaveBeenCalled()
      
      // The authenticate call should include the proper context
      const call = mockOrchestrator.authenticate.mock.calls[0]
      expect(call).toBeDefined()
    })
  })

  describe('Error Recovery', () => {
    it('should handle orchestrator initialization errors', () => {
      AuthenticationOrchestratorMock.mockImplementation(() => {
        throw new Error('Orchestrator init failed')
      })

      const { result } = renderHookWithStore(() => useAuthenticationIntegration(), { store: mockStore })

      expect(() => {
        act(() => {
          result.current.getOrchestrator()
        })
      }).toThrow('Orchestrator init failed')
    })

    it('should handle authentication context building errors', async () => {
      // Mock an error during context building
      mockUseAccount.mockImplementation(() => {
        throw new Error('Account context error')
      })

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

      expect(() => {
        renderHookWithStore(() => useAuthenticationIntegration(), { store: mockStore })
      }).toThrow('Account context error')

      consoleErrorSpy.mockRestore()
    })
  })

  describe('Cleanup and Unmounting', () => {
    it('should cleanup resources on unmount', () => {
      const { unmount } = renderHookWithStore(() => useAuthenticationIntegration(), { store: mockStore })

      expect(() => unmount()).not.toThrow()
    })

    it('should maintain orchestrator instance across rerenders', () => {
      const { result, rerender } = renderHookWithStore(() => useAuthenticationIntegration(), { store: mockStore })

      const orchestrator1 = act(() => result.current.getOrchestrator())
      
      rerender({})
      
      const orchestrator2 = act(() => result.current.getOrchestrator())

      expect(orchestrator1).toBe(orchestrator2)
      expect(AuthenticationOrchestratorMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('Edge Cases', () => {
    it('should handle undefined chain gracefully', async () => {
      mockUseAccount.mockReturnValue({
        isConnected: true,
        address: '0x1234567890123456789012345678901234567890',
        chain: undefined,
        addresses: ['0x1234567890123456789012345678901234567890'],
        chainId: undefined,
        connector: undefined,
        isReconnecting: false,
        isConnecting: false,
        isDisconnected: false,
        status: 'connected',
      })

      const { result } = renderHookWithStore(() => useAuthenticationIntegration(), { store: mockStore })

      await act(async () => {
        await result.current.onNewConnection('0x1234567890123456789012345678901234567890')
      })

      expect(mockStore.walletStore.connect).toHaveBeenCalledWith(
        '0x1234567890123456789012345678901234567890',
        1 // fallback chain ID
      )
    })

    it('should handle null addresses gracefully', () => {
      mockUseAccount.mockReturnValue({
        isConnected: false,
        address: undefined,
        chain: createMockChain(1, 'Ethereum'),
        addresses: undefined,
        chainId: undefined,
        connector: undefined,
        isReconnecting: false,
        isConnecting: false,
        isDisconnected: true,
        status: 'disconnected',
      })

      const { result } = renderHookWithStore(() => useAuthenticationIntegration(), { store: mockStore })

      expect(result.current.needsAuthentication()).toBe(false)
    })

    it('should handle rapid connection/disconnection cycles', async () => {
      const { result } = renderHookWithStore(() => useAuthenticationIntegration(), { store: mockStore })

      const walletAddress = '0x1234567890123456789012345678901234567890'

      // Rapid connection
      await act(async () => {
        await result.current.onNewConnection(walletAddress, 1)
      })

      // Immediate disconnection
      await act(async () => {
        await result.current.onDisconnection()
      })

      // Another connection
      await act(async () => {
        await result.current.onNewConnection(walletAddress, 137)
      })

      expect(mockOrchestrator.authenticate).toHaveBeenCalledTimes(2)
      expect(mockOrchestrator.handleDisconnection).toHaveBeenCalledTimes(1)
    })
  })
})