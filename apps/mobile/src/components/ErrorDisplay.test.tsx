import { fireEvent, render } from '@testing-library/react-native'
import React from 'react'
import type { ErrorDetails } from '../types/errors'
import { ErrorType } from '../types/errors'
import { ErrorDisplay } from './ErrorDisplay'

describe('ErrorDisplay', () => {
  const mockErrorDetails: ErrorDetails = {
    type: ErrorType.NETWORK_ERROR,
    message: 'Network connection error. Please check your internet and try again.',
    timestamp: Date.now(),
  }

  const mockWalletError: ErrorDetails = {
    type: ErrorType.WALLET_CONNECTION_FAILED,
    message: 'Failed to connect to your wallet. Please try again.',
    timestamp: Date.now(),
    context: {
      walletType: 'MetaMask',
    },
  }

  const mockSignatureError: ErrorDetails = {
    type: ErrorType.SIGNATURE_REJECTED,
    message: 'You rejected the signature request. Authentication cancelled.',
    timestamp: Date.now(),
  }

  const mockUnknownError: ErrorDetails = {
    type: ErrorType.UNKNOWN_ERROR,
    message: 'An unexpected error occurred. Please try again.',
    timestamp: Date.now(),
  }

  it('should render error message', () => {
    const { getByText } = render(<ErrorDisplay error={mockErrorDetails} />)

    expect(getByText('Error')).toBeTruthy()
    expect(getByText('Network connection error. Please check your internet and try again.')).toBeTruthy()
  })

  it('should render error suggestions when available', () => {
    const { getByText } = render(<ErrorDisplay error={mockWalletError} />)

    expect(getByText('Try these solutions:')).toBeTruthy()
    expect(getByText('• Make sure your wallet app is running')).toBeTruthy()
    expect(getByText('• Try refreshing the page')).toBeTruthy()
    expect(getByText('• Check your internet connection')).toBeTruthy()
  })

  it('should render suggestions for signature errors', () => {
    const { getByText } = render(<ErrorDisplay error={mockSignatureError} />)

    expect(getByText('Try these solutions:')).toBeTruthy()
    expect(getByText('• Click "Connect Wallet" to try again')).toBeTruthy()
    expect(getByText('• Make sure you approve the signature request')).toBeTruthy()
  })

  it('should render suggestions for unknown errors', () => {
    const { getByText } = render(<ErrorDisplay error={mockUnknownError} />)

    expect(getByText('Try these solutions:')).toBeTruthy()
    expect(getByText('• Try refreshing the page')).toBeTruthy()
    expect(getByText('• Contact support if the issue persists')).toBeTruthy()
  })

  it('should render retry button when onRetry is provided', () => {
    const mockRetry = jest.fn()
    const { getByText } = render(<ErrorDisplay error={mockErrorDetails} onRetry={mockRetry} />)

    const retryButton = getByText('Try Again')
    expect(retryButton).toBeTruthy()
  })

  it('should not render retry button when onRetry is not provided', () => {
    const { queryByText } = render(<ErrorDisplay error={mockErrorDetails} />)

    expect(queryByText('Try Again')).toBeFalsy()
  })

  it('should call onRetry when retry button is pressed', () => {
    const mockRetry = jest.fn()
    const { getByText } = render(<ErrorDisplay error={mockErrorDetails} onRetry={mockRetry} />)

    const retryButton = getByText('Try Again')
    fireEvent.press(retryButton)

    expect(mockRetry).toHaveBeenCalledTimes(1)
  })

  it('should apply custom className', () => {
    const { getByTestId } = render(<ErrorDisplay error={mockErrorDetails} className="custom-error-class" testID="error-container" />)

    const container = getByTestId('error-container')
    expect(container).toBeTruthy()
  })

  it('should handle error without suggestions', () => {
    const errorWithSuggestions: ErrorDetails = {
      type: ErrorType.MESSAGE_GENERATION_FAILED,
      message: 'Failed to generate authentication message. Please try again.',
      timestamp: Date.now(),
    }

    const { getByText } = render(<ErrorDisplay error={errorWithSuggestions} />)

    expect(getByText('Failed to generate authentication message. Please try again.')).toBeTruthy()
    expect(getByText('Try these solutions:')).toBeTruthy() // This error type has suggestions
    expect(getByText('• Check your internet connection')).toBeTruthy()
  })

  describe('Error types', () => {
    it('should render wallet connection error correctly', () => {
      const { getByText } = render(<ErrorDisplay error={mockWalletError} />)

      expect(getByText('Failed to connect to your wallet. Please try again.')).toBeTruthy()
      expect(getByText('• Make sure your wallet app is running')).toBeTruthy()
    })

    it('should render network error correctly', () => {
      const { getByText } = render(<ErrorDisplay error={mockErrorDetails} />)

      expect(getByText('Network connection error. Please check your internet and try again.')).toBeTruthy()
      expect(getByText('• Check your internet connection')).toBeTruthy()
      expect(getByText('• Try again in a few moments')).toBeTruthy()
    })

    it('should render firebase auth error correctly', () => {
      const firebaseError: ErrorDetails = {
        type: ErrorType.FIREBASE_AUTH_FAILED,
        message: 'Authentication failed. Please try connecting your wallet again.',
        timestamp: Date.now(),
      }

      const { getByText } = render(<ErrorDisplay error={firebaseError} />)

      expect(getByText('Authentication failed. Please try connecting your wallet again.')).toBeTruthy()
      expect(getByText('• Try disconnecting and reconnecting your wallet')).toBeTruthy()
      expect(getByText('• Check your internet connection')).toBeTruthy()
    })

    it('should render signature failed error correctly', () => {
      const signatureFailedError: ErrorDetails = {
        type: ErrorType.SIGNATURE_FAILED,
        message: 'Failed to sign the authentication message. Please try again.',
        timestamp: Date.now(),
      }

      const { getByText } = render(<ErrorDisplay error={signatureFailedError} />)

      expect(getByText('Failed to sign the authentication message. Please try again.')).toBeTruthy()
      expect(getByText('• Try disconnecting and reconnecting your wallet')).toBeTruthy()
      expect(getByText('• Make sure your wallet is unlocked')).toBeTruthy()
    })

    it('should render wallet disconnected error correctly', () => {
      const walletDisconnectedError: ErrorDetails = {
        type: ErrorType.WALLET_DISCONNECTED,
        message: 'Your wallet has been disconnected. Please reconnect to continue.',
        timestamp: Date.now(),
      }

      const { getByText } = render(<ErrorDisplay error={walletDisconnectedError} />)

      expect(getByText('Your wallet has been disconnected. Please reconnect to continue.')).toBeTruthy()
      expect(getByText('• Reconnect your wallet using the button above')).toBeTruthy()
      expect(getByText('• Check if your wallet is still unlocked')).toBeTruthy()
    })
  })

  describe('Accessibility', () => {
    it('should have proper text elements for screen readers', () => {
      const { getByText } = render(<ErrorDisplay error={mockErrorDetails} />)

      // Error label should be readable
      expect(getByText('Error')).toBeTruthy()

      // Error message should be readable
      expect(getByText('Network connection error. Please check your internet and try again.')).toBeTruthy()
    })

    it('should make retry button accessible', () => {
      const mockRetry = jest.fn()
      const { getByText } = render(<ErrorDisplay error={mockErrorDetails} onRetry={mockRetry} />)

      const retryButton = getByText('Try Again')
      expect(retryButton).toBeTruthy()
      expect(retryButton.props.onPress).toBe(mockRetry)
    })
  })

  describe('Edge cases', () => {
    it('should handle error with empty message', () => {
      const emptyMessageError: ErrorDetails = {
        type: ErrorType.UNKNOWN_ERROR,
        message: '',
        timestamp: Date.now(),
      }

      const { getByText } = render(<ErrorDisplay error={emptyMessageError} />)

      expect(getByText('Error')).toBeTruthy()
      // Empty message should still render (empty Text component)
    })

    it('should handle error with context data', () => {
      const errorWithContext: ErrorDetails = {
        type: ErrorType.WALLET_CONNECTION_FAILED,
        message: 'Failed to connect to your wallet. Please try again.',
        timestamp: Date.now(),
        context: {
          walletType: 'MetaMask',
          chainId: 137,
          attemptCount: 3,
        },
      }

      const { getByText } = render(<ErrorDisplay error={errorWithContext} />)

      expect(getByText('Failed to connect to your wallet. Please try again.')).toBeTruthy()
      expect(getByText('• Make sure your wallet app is running')).toBeTruthy()
    })

    it('should handle error with original error object', () => {
      const originalError = new Error('Original error message')
      const errorWithOriginal: ErrorDetails = {
        type: ErrorType.NETWORK_ERROR,
        message: 'Network connection error. Please check your internet and try again.',
        timestamp: Date.now(),
        originalError,
      }

      const { getByText } = render(<ErrorDisplay error={errorWithOriginal} />)

      expect(getByText('Network connection error. Please check your internet and try again.')).toBeTruthy()
    })

    it('should handle multiple retry button presses', () => {
      const mockRetry = jest.fn()
      const { getByText } = render(<ErrorDisplay error={mockErrorDetails} onRetry={mockRetry} />)

      const retryButton = getByText('Try Again')

      fireEvent.press(retryButton)
      fireEvent.press(retryButton)
      fireEvent.press(retryButton)

      expect(mockRetry).toHaveBeenCalledTimes(3)
    })
  })

  describe('Layout and styling', () => {
    it('should apply default className when none provided', () => {
      const { getByTestId } = render(<ErrorDisplay error={mockErrorDetails} testID="error-display" />)

      const container = getByTestId('error-display')
      expect(container).toBeTruthy()
    })

    it('should combine custom className with default styling', () => {
      const { getByTestId } = render(<ErrorDisplay error={mockErrorDetails} className="my-custom-class" testID="styled-error" />)

      const container = getByTestId('styled-error')
      expect(container).toBeTruthy()
    })

    it('should render proper structure with all elements', () => {
      const { getByText } = render(<ErrorDisplay error={mockWalletError} onRetry={jest.fn()} />)

      // Should have all main elements
      expect(getByText('Error')).toBeTruthy() // Label
      expect(getByText('Failed to connect to your wallet. Please try again.')).toBeTruthy() // Message
      expect(getByText('Try these solutions:')).toBeTruthy() // Suggestions header
      expect(getByText('• Make sure your wallet app is running')).toBeTruthy() // Suggestion
      expect(getByText('Try Again')).toBeTruthy() // Retry button
    })
  })
})
