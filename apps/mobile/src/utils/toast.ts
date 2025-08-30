import Toast from 'react-native-toast-message'
import { AppError, ErrorType } from './errorHandling'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

interface ToastOptions {
  title?: string
  message: string
  duration?: number
  position?: 'top' | 'bottom'
}

// Base toast function with custom styling  
function _showToast(type: ToastType, { title, message, duration = 4000, position = 'top' }: ToastOptions) {
  Toast.show({
    type,
    text1: title,
    text2: message,
    position,
    visibilityTime: duration,
    autoHide: true,
    topOffset: 60,
    bottomOffset: 60,
  })
}

// Success toast for positive feedback
export function showSuccessToast(message: string, text2?: string, duration = 3000, position: 'top' | 'bottom' = 'bottom') {
  Toast.show({
    type: 'success',
    text1: message,
    text2,
    position,
    visibilityTime: duration,
    autoHide: true,
    topOffset: 60,
    bottomOffset: 60,
  })
}

// Error toast for error feedback
export function showErrorToast(message: string, text2?: string, duration = 5000, position: 'top' | 'bottom' = 'bottom') {
  Toast.show({
    type: 'error',
    text1: message,
    text2,
    position,
    visibilityTime: duration,
    autoHide: true,
    topOffset: 60,
    bottomOffset: 60,
  })
}

// Info toast for general information
export function showInfoToast(message: string, text2?: string, duration = 4000, position: 'top' | 'bottom' = 'bottom') {
  Toast.show({
    type: 'info',
    text1: message,
    text2,
    position,
    visibilityTime: duration,
    autoHide: true,
    topOffset: 60,
    bottomOffset: 60,
  })
}

// Warning toast for warnings
export function showWarningToast(message: string, text2?: string, duration = 4000, position: 'top' | 'bottom' = 'bottom') {
  Toast.show({
    type: 'warning',
    text1: message,
    text2,
    position,
    visibilityTime: duration,
    autoHide: true,
    topOffset: 60,
    bottomOffset: 60,
  })
}

// Specialized function to show error from AppError
export function showErrorFromAppError(error: AppError) {
  const title = getErrorTitle(error.type)

  showErrorToast(title, error.userFriendlyMessage, getErrorDuration(error.type))
}

// Get appropriate title for error type
function getErrorTitle(errorType: ErrorType): string {
  switch (errorType) {
    case ErrorType.WALLET_CONNECTION:
      return 'Connection Failed'
    case ErrorType.SIGNATURE_REJECTED:
      return 'Signature Rejected'
    case ErrorType.NETWORK_ERROR:
      return 'Network Error'
    case ErrorType.AUTHENTICATION_FAILED:
      return 'Authentication Failed'
    case ErrorType.BACKEND_ERROR:
      return 'Server Error'
    case ErrorType.TIMEOUT_ERROR:
      return 'Request Timeout'
    case ErrorType.TRANSACTION_REJECTED:
      return 'Transaction Rejected'
    case ErrorType.INSUFFICIENT_FUNDS:
      return 'Insufficient Funds'
    case ErrorType.SESSION_CORRUPTION:
      return 'Session Error'
    case ErrorType.CHAIN_MISMATCH:
      return 'Wrong Network'
    case ErrorType.UNKNOWN_ERROR:
    default:
      return 'Error'
  }
}

// Get appropriate duration for error type
function getErrorDuration(errorType: ErrorType): number {
  switch (errorType) {
    case ErrorType.SIGNATURE_REJECTED:
    case ErrorType.TRANSACTION_REJECTED:
      return 3000 // Shorter for user-initiated actions
    case ErrorType.NETWORK_ERROR:
    case ErrorType.BACKEND_ERROR:
    case ErrorType.TIMEOUT_ERROR:
      return 5000 // Longer for technical issues
    case ErrorType.INSUFFICIENT_FUNDS:
    case ErrorType.SESSION_CORRUPTION:
    case ErrorType.CHAIN_MISMATCH:
      return 6000 // Persistent duration for critical errors
    default:
      return 4000 // Standard duration
  }
}

// Authentication-specific toast helpers with extended durations for wallet app switching
export const authToasts = {
  connecting: () =>
    showInfoToast('Connecting', 'Please sign the message to authenticate...', 12000), // Extended for wallet app switching

  success: () =>
    showSuccessToast('Welcome!', 'Successfully authenticated and signed in.', 4000),

  signingMessage: () =>
    showInfoToast(
      'Sign Message',
      "Check your wallet app to sign the authentication message. If you don't see a signature request, try switching back and forth between apps.",
      15000 // Extended for wallet app switching scenarios
    ),

  verifying: () =>
    showInfoToast('Verifying', 'Verifying your signature...', 8000), // Extended for potential delays

  // New toast for wallet app guidance
  walletAppGuidance: () =>
    showInfoToast(
      'Wallet App Required',
      'Authentication requires your wallet app. You may need to switch between apps to complete the process.',
      10000
    ),

  // Session error toast for WalletConnect issues
  sessionError: () =>
    showErrorToast('Connection Issue', 'Wallet session expired. Please reconnect your wallet to continue.', 5000),
}

// General app toast helpers
export const appToasts = {
  walletConnected: (walletName?: string) =>
    showSuccessToast(
      'Wallet Connected',
      walletName ? `Connected to ${walletName}` : 'Wallet connected successfully',
      3000
    ),

  walletDisconnected: () =>
    showInfoToast('Wallet Disconnected', 'Your wallet has been disconnected.', 3000),
}
