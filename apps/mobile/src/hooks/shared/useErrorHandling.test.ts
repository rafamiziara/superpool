import { act, renderHook } from '@testing-library/react-native'
import { ErrorDetails, ErrorType } from '../../types/errors'
import { useErrorHandling } from './useErrorHandling'

describe('useErrorHandling', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should initialize with no error', () => {
    const { result } = renderHook(() => useErrorHandling())

    expect(result.current.lastError).toBe(null)
  })

  it('should format generic error correctly', () => {
    const { result } = renderHook(() => useErrorHandling())

    const testError = new Error('Test error message')
    let errorDetails: ErrorDetails
    act(() => {
      errorDetails = result.current.formatError(testError)
    })

    expect(errorDetails!.type).toBe(ErrorType.UNKNOWN_ERROR)
    expect(errorDetails!.message).toBe('An unexpected error occurred. Please try again.')
    expect(errorDetails!.originalError).toBe(testError)
    expect(errorDetails!.timestamp).toBeCloseTo(Date.now(), -2)
    expect(errorDetails!.context?.originalMessage).toBe('Test error message')
  })

  it('should detect signature rejection errors', () => {
    const { result } = renderHook(() => useErrorHandling())

    const signatureError = new Error('User rejected the request')
    let errorDetails: ErrorDetails
    act(() => {
      errorDetails = result.current.formatError(signatureError)
    })

    expect(errorDetails!.type).toBe(ErrorType.SIGNATURE_REJECTED)
    expect(errorDetails!.message).toBe('You rejected the signature request. Authentication cancelled.')
  })

  it('should detect network errors', () => {
    const { result } = renderHook(() => useErrorHandling())

    const networkError = new Error('Network request failed')
    let errorDetails: ErrorDetails
    act(() => {
      errorDetails = result.current.formatError(networkError)
    })

    expect(errorDetails!.type).toBe(ErrorType.NETWORK_ERROR)
    expect(errorDetails!.message).toBe('Network connection error. Please check your internet and try again.')
  })

  it('should detect Firebase auth errors', () => {
    const { result } = renderHook(() => useErrorHandling())

    const authError = new Error('Firebase auth failed')
    let errorDetails: ErrorDetails
    act(() => {
      errorDetails = result.current.formatError(authError)
    })

    expect(errorDetails!.type).toBe(ErrorType.FIREBASE_AUTH_FAILED)
    expect(errorDetails!.message).toBe('Authentication failed. Please try connecting your wallet again.')
  })

  it('should handle specific error types', () => {
    const { result } = renderHook(() => useErrorHandling())

    const testError = new Error('Wallet connection failed')
    let errorDetails: ErrorDetails
    act(() => {
      errorDetails = result.current.formatError(testError, ErrorType.WALLET_CONNECTION_FAILED, { walletType: 'MetaMask' })
    })

    expect(errorDetails!.type).toBe(ErrorType.WALLET_CONNECTION_FAILED)
    expect(errorDetails!.message).toBe('Failed to connect to your wallet. Please try again.')
    expect(errorDetails!.context).toMatchObject({
      walletType: 'MetaMask',
      originalMessage: 'Wallet connection failed',
    })
  })

  it('should extract error message from different types', () => {
    const { result } = renderHook(() => useErrorHandling())

    // Error object
    expect(result.current.getErrorMessage(new Error('Test error'))).toBe('Test error')

    // String error
    expect(result.current.getErrorMessage('String error')).toBe('String error')

    // Unknown error
    expect(result.current.getErrorMessage(123)).toBe('An unexpected error occurred')
    expect(result.current.getErrorMessage(null)).toBe('An unexpected error occurred')
  })

  it('should identify retryable errors correctly', () => {
    const { result } = renderHook(() => useErrorHandling())

    let retryableError: ErrorDetails, nonRetryableError: ErrorDetails
    act(() => {
      retryableError = result.current.formatError(new Error('Test'), ErrorType.NETWORK_ERROR)
      nonRetryableError = result.current.formatError(new Error('Test'), ErrorType.SIGNATURE_REJECTED)
    })

    expect(result.current.isRetryableError(retryableError!)).toBe(true)
    expect(result.current.isRetryableError(nonRetryableError!)).toBe(false)
  })

  it('should identify user-visible errors correctly', () => {
    const { result } = renderHook(() => useErrorHandling())

    let visibleError: ErrorDetails, internalError: ErrorDetails
    act(() => {
      visibleError = result.current.formatError(new Error('Test'), ErrorType.WALLET_CONNECTION_FAILED)
      internalError = result.current.formatError(new Error('Test'), ErrorType.MESSAGE_GENERATION_FAILED)
    })

    expect(result.current.shouldShowToUser(visibleError!)).toBe(true)
    expect(result.current.shouldShowToUser(internalError!)).toBe(false)
  })

  it('should track last error', () => {
    const { result } = renderHook(() => useErrorHandling())

    const testError = new Error('Test error')

    act(() => {
      result.current.formatError(testError, ErrorType.NETWORK_ERROR)
    })

    expect(result.current.lastError).not.toBe(null)
    expect(result.current.lastError?.type).toBe(ErrorType.NETWORK_ERROR)
  })

  it('should clear error', () => {
    const { result } = renderHook(() => useErrorHandling())

    const testError = new Error('Test error')

    act(() => {
      result.current.formatError(testError)
    })

    expect(result.current.lastError).not.toBe(null)

    act(() => {
      result.current.clearError()
    })

    expect(result.current.lastError).toBe(null)
  })

  it('should handle string errors', () => {
    const { result } = renderHook(() => useErrorHandling())

    const stringError = 'Something went wrong'
    let errorDetails: ErrorDetails
    act(() => {
      errorDetails = result.current.formatError(stringError)
    })

    expect(errorDetails!.type).toBe(ErrorType.UNKNOWN_ERROR)
    expect(errorDetails!.originalError).toBe(stringError)
  })

  it('should handle null/undefined errors', () => {
    const { result } = renderHook(() => useErrorHandling())

    let nullErrorDetails: ErrorDetails, undefinedErrorDetails: ErrorDetails
    act(() => {
      nullErrorDetails = result.current.formatError(null)
      undefinedErrorDetails = result.current.formatError(undefined)
    })

    expect(nullErrorDetails!.type).toBe(ErrorType.UNKNOWN_ERROR)
    expect(undefinedErrorDetails!.type).toBe(ErrorType.UNKNOWN_ERROR)
  })
})
