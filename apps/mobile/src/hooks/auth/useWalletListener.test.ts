import { renderHook } from '@testing-library/react-native'
import { mockWagmiUseAccount } from '../../__tests__/mocks'
import { useWalletListener } from './useWalletListener'

// Mock console.log to test logging
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {})

describe('useWalletListener', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockConsoleLog.mockClear()
  })

  afterAll(() => {
    mockConsoleLog.mockRestore()
  })

  it('should return wallet connection state when connected', () => {
    mockWagmiUseAccount.mockReturnValue({
      isConnected: true,
      address: '0x123456789',
      chainId: 137,
      isConnecting: false,
    })

    const { result } = renderHook(() => useWalletListener())

    expect(result.current.isConnected).toBe(true)
    expect(result.current.address).toBe('0x123456789')
    expect(result.current.chainId).toBe(137)
    expect(result.current.isConnecting).toBe(false)
  })

  it('should return null address when disconnected', () => {
    mockWagmiUseAccount.mockReturnValue({
      isConnected: false,
      address: undefined,
      chainId: undefined,
      isConnecting: false,
    })

    const { result } = renderHook(() => useWalletListener())

    expect(result.current.isConnected).toBe(false)
    expect(result.current.address).toBe(null)
    expect(result.current.chainId).toBe(null)
  })

  it('should log wallet connection', () => {
    mockWagmiUseAccount.mockReturnValue({
      isConnected: true,
      address: '0x123456789',
      chainId: 137,
      isConnecting: false,
    })

    renderHook(() => useWalletListener())

    expect(mockConsoleLog).toHaveBeenCalledWith('✅ Wallet auto-connected:', '0x123456789')
  })

  it('should log wallet disconnection', () => {
    // Start connected, then disconnect
    mockWagmiUseAccount.mockReturnValueOnce({
      isConnected: true,
      address: '0x123456789',
      chainId: 137,
      isConnecting: false,
    })

    const { rerender } = renderHook(() => useWalletListener())

    // Now disconnect
    mockWagmiUseAccount.mockReturnValue({
      isConnected: false,
      address: undefined,
      chainId: undefined,
      isConnecting: false,
    })

    rerender({})

    expect(mockConsoleLog).toHaveBeenCalledWith('❌ Wallet disconnected - clearing auth state')
  })

  it('should handle connecting state', () => {
    mockWagmiUseAccount.mockReturnValue({
      isConnected: false,
      address: undefined,
      chainId: undefined,
      isConnecting: true,
    })

    const { result } = renderHook(() => useWalletListener())

    expect(result.current.isConnecting).toBe(true)
    expect(result.current.isConnected).toBe(false)
  })

  it('should not log when address is present but not connected', () => {
    mockWagmiUseAccount.mockReturnValue({
      isConnected: false,
      address: '0x123456789', // Address present but not connected
      chainId: undefined,
      isConnecting: false,
    })

    renderHook(() => useWalletListener())

    expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('auto-connected'))
  })
})
