import { act, renderHook } from '@testing-library/react-native'
import { mockWagmiUseSignMessage } from '../../__tests__/mocks'
import { useSignatureHandling } from './useSignatureHandling'

const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {})
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

describe('useSignatureHandling', () => {
  const mockSignMessageAsync = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockConsoleLog.mockClear()
    mockConsoleError.mockClear()

    mockWagmiUseSignMessage.mockReturnValue({
      signMessageAsync: mockSignMessageAsync,
      isPending: false,
    })
  })

  afterAll(() => {
    mockConsoleLog.mockRestore()
    mockConsoleError.mockRestore()
  })

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useSignatureHandling())

    expect(result.current.signature).toBe(null)
    expect(result.current.error).toBe(null)
    expect(result.current.isSigning).toBe(false)
    expect(typeof result.current.requestSignature).toBe('function')
    expect(typeof result.current.clearSignature).toBe('function')
  })

  it('should request signature successfully', async () => {
    const mockSignature = '0x1234567890abcdef1234567890abcdef12345678'
    const testMessage = 'Sign this message to authenticate'

    mockSignMessageAsync.mockResolvedValue(mockSignature)

    const { result } = renderHook(() => useSignatureHandling())

    let returnedSignature: string
    await act(async () => {
      returnedSignature = await result.current.requestSignature(testMessage)
    })

    expect(result.current.signature).toBe(mockSignature)
    expect(result.current.error).toBe(null)
    expect(result.current.isSigning).toBe(false)
    expect(returnedSignature!).toBe(mockSignature)

    expect(mockSignMessageAsync).toHaveBeenCalledWith({ message: testMessage })
    expect(mockConsoleLog).toHaveBeenCalledWith('✍️ Requesting wallet signature...')
    expect(mockConsoleLog).toHaveBeenCalledWith('✅ Signature obtained successfully')
  })

  it('should set loading state during signing', async () => {
    let resolveSignature: (value: string) => void
    const signaturePromise = new Promise<string>((resolve) => {
      resolveSignature = resolve
    })

    mockSignMessageAsync.mockReturnValue(signaturePromise)

    const { result } = renderHook(() => useSignatureHandling())

    act(() => {
      result.current.requestSignature('test message')
    })

    expect(result.current.isSigning).toBe(true)
    expect(result.current.error).toBe(null)

    await act(async () => {
      resolveSignature!('0x123signature')
    })

    expect(result.current.isSigning).toBe(false)
    expect(result.current.signature).toBe('0x123signature')
  })

  it('should reflect wagmi isPending state', () => {
    mockWagmiUseSignMessage.mockReturnValue({
      signMessageAsync: mockSignMessageAsync,
      isPending: true,
    })

    const { result } = renderHook(() => useSignatureHandling())

    expect(result.current.isSigning).toBe(true)
  })

  it('should clear signature state', async () => {
    const mockSignature = '0x123signature'
    mockSignMessageAsync.mockResolvedValue(mockSignature)

    const { result } = renderHook(() => useSignatureHandling())

    // First get a signature
    await act(async () => {
      await result.current.requestSignature('test message')
    })

    expect(result.current.signature).toBe(mockSignature)

    // Then clear it
    act(() => {
      result.current.clearSignature()
    })

    expect(result.current.signature).toBe(null)
    expect(result.current.error).toBe(null)
    expect(result.current.isSigning).toBe(false)
  })

  it('should handle multiple signature requests correctly', async () => {
    const firstSignature = '0x111'
    const secondSignature = '0x222'

    mockSignMessageAsync.mockResolvedValueOnce(firstSignature).mockResolvedValueOnce(secondSignature)

    const { result } = renderHook(() => useSignatureHandling())

    // First signature
    await act(async () => {
      await result.current.requestSignature('message 1')
    })
    expect(result.current.signature).toBe(firstSignature)

    // Second signature (should replace first)
    await act(async () => {
      await result.current.requestSignature('message 2')
    })
    expect(result.current.signature).toBe(secondSignature)

    expect(mockSignMessageAsync).toHaveBeenCalledTimes(2)
  })

  it('should handle rapid clear operations', () => {
    const { result } = renderHook(() => useSignatureHandling())

    // Multiple rapid clears should not cause issues
    act(() => {
      result.current.clearSignature()
      result.current.clearSignature()
      result.current.clearSignature()
    })

    expect(result.current.signature).toBe(null)
    expect(result.current.error).toBe(null)
    expect(result.current.isSigning).toBe(false)
  })

  it('should reject empty message', async () => {
    const { result } = renderHook(() => useSignatureHandling())

    await act(async () => {
      try {
        await result.current.requestSignature('')
      } catch (error) {
        expect((error as Error).message).toBe('Message is required for signature')
      }
    })

    expect(result.current.error).toBe('Message is required for signature')
    expect(mockSignMessageAsync).not.toHaveBeenCalled()
  })

  it('should handle empty signature response', async () => {
    mockSignMessageAsync.mockResolvedValue('')

    const { result } = renderHook(() => useSignatureHandling())

    await act(async () => {
      try {
        await result.current.requestSignature('test message')
      } catch (error) {
        expect((error as Error).message).toBe('Signature request returned empty result')
      }
    })

    expect(result.current.signature).toBe(null)
    expect(result.current.error).toBe('Signature request returned empty result')
  })

  it('should handle very long messages', async () => {
    const longMessage = 'a'.repeat(10000)
    const mockSignature = '0xlongsignature'

    mockSignMessageAsync.mockResolvedValue(mockSignature)

    const { result } = renderHook(() => useSignatureHandling())

    await act(async () => {
      const signature = await result.current.requestSignature(longMessage)
      expect(signature).toBe(mockSignature)
    })

    expect(mockSignMessageAsync).toHaveBeenCalledWith({ message: longMessage })
  })

  it('should handle special characters in message', async () => {
    const specialMessage = 'Message with 🚀 emojis and "quotes" and \n newlines'
    const mockSignature = '0xspecialsignature'

    mockSignMessageAsync.mockResolvedValue(mockSignature)

    const { result } = renderHook(() => useSignatureHandling())

    await act(async () => {
      const signature = await result.current.requestSignature(specialMessage)
      expect(signature).toBe(mockSignature)
    })

    expect(result.current.signature).toBe(mockSignature)
  })

  it('should handle user rejection gracefully', async () => {
    const rejectionError = new Error('User rejected the request')
    mockSignMessageAsync.mockRejectedValue(rejectionError)

    const { result } = renderHook(() => useSignatureHandling())

    await act(async () => {
      try {
        await result.current.requestSignature('test message')
      } catch (error) {
        expect((error as Error).message).toBe('User rejected the request')
      }
    })

    expect(result.current.signature).toBe(null)
    expect(result.current.error).toBe('User rejected the request')
    expect(result.current.isSigning).toBe(false)

    expect(mockConsoleError).toHaveBeenCalledWith('❌ Signature request failed:', 'User rejected the request')
  })

  it('should handle wallet not connected error', async () => {
    const walletError = new Error('Wallet not connected')
    mockSignMessageAsync.mockRejectedValue(walletError)

    const { result } = renderHook(() => useSignatureHandling())

    await act(async () => {
      try {
        await result.current.requestSignature('test message')
      } catch (error) {
        expect((error as Error).message).toBe('Wallet not connected')
      }
    })
  })

  it('should handle network errors', async () => {
    const networkError = new Error('Network request failed')
    mockSignMessageAsync.mockRejectedValue(networkError)

    const { result } = renderHook(() => useSignatureHandling())

    await act(async () => {
      try {
        await result.current.requestSignature('test message')
      } catch (error) {
        expect((error as Error).message).toBe('Network request failed')
      }
    })

    expect(result.current.signature).toBe(null)
    expect(result.current.error).toBe('Network request failed')
  })

  it('should handle unknown errors', async () => {
    mockSignMessageAsync.mockRejectedValue('Unknown error')

    const { result } = renderHook(() => useSignatureHandling())

    await act(async () => {
      try {
        await result.current.requestSignature('test message')
      } catch (error) {
        expect((error as Error).message).toBe('Signature request failed')
      }
    })

    expect(result.current.error).toBe('Signature request failed')
  })
})
