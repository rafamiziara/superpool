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
function showToast(type: ToastType, { title, message, duration = 4000, position = 'top' }: ToastOptions) {
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
export function showSuccessToast(options: ToastOptions) {
  showToast('success', options)
}

// Error toast for error feedback
export function showErrorToast(options: ToastOptions) {
  showToast('error', options)
}

// Info toast for general information
export function showInfoToast(options: ToastOptions) {
  showToast('info', options)
}

// Warning toast for warnings
export function showWarningToast(options: ToastOptions) {
  showToast('warning', options)
}

// Specialized function to show error from AppError
export function showErrorFromAppError(error: AppError) {
  const title = getErrorTitle(error.type)

  showErrorToast({
    title,
    message: error.userFriendlyMessage,
    duration: getErrorDuration(error.type),
  })
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
    case ErrorType.UNKNOWN_ERROR:
    default:
      return 'Error'
  }
}

// Get appropriate duration for error type
function getErrorDuration(errorType: ErrorType): number {
  switch (errorType) {
    case ErrorType.SIGNATURE_REJECTED:
      return 3000 // Shorter for user-initiated actions
    case ErrorType.NETWORK_ERROR:
    case ErrorType.BACKEND_ERROR:
      return 5000 // Longer for technical issues
    default:
      return 4000 // Standard duration
  }
}

// Authentication-specific toast helpers with extended durations for wallet app switching
export const authToasts = {
  connecting: () =>
    showInfoToast({
      title: 'Connecting',
      message: 'Please sign the message to authenticate...',
      duration: 12000, // Extended for wallet app switching
    }),

  success: () =>
    showSuccessToast({
      title: 'Welcome!',
      message: 'Successfully authenticated and signed in.',
      duration: 4000,
    }),

  signingMessage: () =>
    showInfoToast({
      title: 'Sign Message',
      message:
        "Check your wallet app to sign the authentication message. If you don't see a signature request, try switching back and forth between apps.",
      duration: 15000, // Extended for wallet app switching scenarios
    }),

  verifying: () =>
    showInfoToast({
      title: 'Verifying',
      message: 'Verifying your signature...',
      duration: 8000, // Extended for potential delays
    }),

  // New toast for wallet app guidance
  walletAppGuidance: () =>
    showInfoToast({
      title: 'Wallet App Required',
      message: 'Authentication requires your wallet app. You may need to switch between apps to complete the process.',
      duration: 10000,
    }),

  // Session error toast for WalletConnect issues
  sessionError: () =>
    showErrorToast({
      title: 'Connection Issue',
      message: 'Wallet session expired. Please reconnect your wallet to continue.',
      duration: 5000,
    }),
}

// General app toast helpers
export const appToasts = {
  walletConnected: (walletName?: string) =>
    showSuccessToast({
      title: 'Wallet Connected',
      message: walletName ? `Connected to ${walletName}` : 'Wallet connected successfully',
      duration: 3000,
    }),

  walletDisconnected: () =>
    showInfoToast({
      title: 'Wallet Disconnected',
      message: 'Your wallet has been disconnected.',
      duration: 3000,
    }),
}
