import { AuthMessage } from '@superpool/types'
import { act, renderHook } from '@testing-library/react-native'
import { mockFirebaseCallable } from '../../__tests__/mocks'
import { useMessageGeneration } from './useMessageGeneration'

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {})
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

describe('useMessageGeneration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockConsoleLog.mockClear()
    mockConsoleError.mockClear()
  })

  afterAll(() => {
    mockConsoleLog.mockRestore()
    mockConsoleError.mockRestore()
  })

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useMessageGeneration())

    expect(result.current.message).toBe(null)
    expect(result.current.nonce).toBe(null)
    expect(result.current.timestamp).toBe(null)
    expect(result.current.isGenerating).toBe(false)
    expect(result.current.error).toBe(null)
    expect(typeof result.current.generateMessage).toBe('function')
    expect(typeof result.current.clearState).toBe('function')
  })

  it('should generate message successfully', async () => {
    const mockResponse = {
      message: 'Sign this message to authenticate',
      nonce: 'abc123',
      timestamp: Date.now(),
    }

    const mockCallable = jest.fn().mockResolvedValue({ data: mockResponse })
    mockFirebaseCallable.mockReturnValue(mockCallable)

    const { result } = renderHook(() => useMessageGeneration())

    let authMessage: AuthMessage

    await act(async () => {
      authMessage = await result.current.generateMessage('0x123456789')
    })

    expect(result.current.isGenerating).toBe(false)
    expect(result.current.message).toBe(mockResponse.message)
    expect(result.current.nonce).toBe(mockResponse.nonce)
    expect(result.current.timestamp).toBe(mockResponse.timestamp)
    expect(result.current.error).toBe(null)
    expect(authMessage!).toEqual(mockResponse)

    expect(mockConsoleLog).toHaveBeenCalledWith('🔄 Generating auth message for:', '0x123456789')
    expect(mockConsoleLog).toHaveBeenCalledWith('✅ Auth message generated successfully')
  })

  it('should call Firebase function with correct parameters', async () => {
    const mockCallable = jest.fn().mockResolvedValue({ data: {} })
    mockFirebaseCallable.mockReturnValue(mockCallable)

    const { result } = renderHook(() => useMessageGeneration())

    await act(async () => {
      try {
        await result.current.generateMessage('0x123456789')
      } catch {
        // Expected to fail due to empty response
      }
    })

    expect(mockFirebaseCallable).toHaveBeenCalledWith(
      expect.any(Object), // FIREBASE_FUNCTIONS
      'generateAuthMessage'
    )
    expect(mockCallable).toHaveBeenCalledWith({ walletAddress: '0x123456789' })
  })

  it('should set loading state during generation', async () => {
    const mockCallable = jest.fn().mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ data: {} }), 100)))
    mockFirebaseCallable.mockReturnValue(mockCallable)

    const { result } = renderHook(() => useMessageGeneration())

    act(() => {
      result.current.generateMessage('0x123456789')
    })

    expect(result.current.isGenerating).toBe(true)
    expect(result.current.error).toBe(null)
  })

  it('should clear state when clearState is called', async () => {
    // First generate a message
    const mockResponse = {
      message: 'Sign this message',
      nonce: 'abc123',
      timestamp: Date.now(),
    }

    const mockCallable = jest.fn().mockResolvedValue({ data: mockResponse })
    mockFirebaseCallable.mockReturnValue(mockCallable)

    const { result } = renderHook(() => useMessageGeneration())

    await act(async () => {
      await result.current.generateMessage('0x123456789')
    })

    expect(result.current.message).toBe(mockResponse.message)

    // Then clear state
    act(() => {
      result.current.clearState()
    })

    expect(result.current.message).toBe(null)
    expect(result.current.nonce).toBe(null)
    expect(result.current.timestamp).toBe(null)
    expect(result.current.isGenerating).toBe(false)
    expect(result.current.error).toBe(null)
  })

  it('should reject empty wallet address', async () => {
    const { result } = renderHook(() => useMessageGeneration())

    await act(async () => {
      try {
        await result.current.generateMessage('')
      } catch (error) {
        expect((error as Error).message).toBe('Wallet address is required')
      }
    })

    expect(result.current.error).toBe('Wallet address is required')
  })

  it('should handle invalid response data', async () => {
    const mockCallable = jest.fn().mockResolvedValue({ data: null })
    mockFirebaseCallable.mockReturnValue(mockCallable)

    const { result } = renderHook(() => useMessageGeneration())

    await act(async () => {
      try {
        await result.current.generateMessage('0x123456789')
      } catch (error) {
        expect((error as Error).message).toBe('Invalid response from generateAuthMessage function')
      }
    })
  })

  it('should handle incomplete auth message data', async () => {
    const mockCallable = jest.fn().mockResolvedValue({
      data: { message: 'test', nonce: 'abc' }, // Missing timestamp
    })
    mockFirebaseCallable.mockReturnValue(mockCallable)

    const { result } = renderHook(() => useMessageGeneration())

    await act(async () => {
      try {
        await result.current.generateMessage('0x123456789')
      } catch (error) {
        expect((error as Error).message).toBe('Incomplete auth message data received')
      }
    })
  })

  it('should handle Firebase function errors', async () => {
    const mockError = new Error('Firebase function failed')
    const mockCallable = jest.fn().mockRejectedValue(mockError)
    mockFirebaseCallable.mockReturnValue(mockCallable)

    const { result } = renderHook(() => useMessageGeneration())

    await act(async () => {
      try {
        await result.current.generateMessage('0x123456789')
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toBe('Firebase function failed')
      }
    })

    expect(result.current.isGenerating).toBe(false)
    expect(result.current.error).toBe('Firebase function failed')
    expect(result.current.message).toBe(null)

    expect(mockConsoleError).toHaveBeenCalledWith('❌ Message generation failed:', 'Firebase function failed')
  })

  it('should handle unknown errors gracefully', async () => {
    const mockCallable = jest.fn().mockRejectedValue('Unknown error')
    mockFirebaseCallable.mockReturnValue(mockCallable)

    const { result } = renderHook(() => useMessageGeneration())

    await act(async () => {
      try {
        await result.current.generateMessage('0x123456789')
      } catch (error) {
        expect((error as Error).message).toBe('Failed to generate message')
      }
    })

    expect(result.current.error).toBe('Failed to generate message')
  })
})
