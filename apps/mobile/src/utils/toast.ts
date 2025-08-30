// Step 4: Add the object exports to see if they cause the issue
import Toast from 'react-native-toast-message'
import { AppError, ErrorType } from './errorHandling'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

// Success toast for positive feedback
export function showSuccessToast(message: string, text2?: string, duration = 3000, position: 'top' | 'bottom' = 'bottom') {
  Toast.show({
    type: 'success',
    text1: message,
    text2,
    position,
    visibilityTime: duration,
  })
}

// Error toast for error feedback  
export function showErrorToast(message: string, text2?: string, duration = 4000, position: 'top' | 'bottom' = 'bottom') {
  Toast.show({
    type: 'error',
    text1: message,
    text2,
    position,
    visibilityTime: duration,
  })
}

// Info toast for general information
export function showInfoToast(message: string, text2?: string, duration = 3000, position: 'top' | 'bottom' = 'bottom') {
  Toast.show({
    type: 'info',
    text1: message,
    text2,
    position,
    visibilityTime: duration,
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
  })
}

export function showErrorFromAppError(error: AppError | null | undefined) {
  if (!error) {
    showErrorToast('Something Went Wrong', '', 4000)
    return
  }

  const title = getErrorTitle(error.type)
  const duration = getErrorDuration(error.type)
  showErrorToast(title, error.userFriendlyMessage || '', duration)
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
      return 'Connection Lost'
    case ErrorType.CHAIN_MISMATCH:
      return 'Wrong Network'
    case ErrorType.UNKNOWN_ERROR:
    default:
      return 'Something Went Wrong'
  }
}

// Get appropriate duration for error type
function getErrorDuration(errorType: ErrorType): number {
  switch (errorType) {
    case ErrorType.SIGNATURE_REJECTED:
    case ErrorType.TRANSACTION_REJECTED:
      return 3000 // Shorter for user-initiated actions
    case ErrorType.NETWORK_ERROR:
    case ErrorType.AUTHENTICATION_FAILED:
    case ErrorType.SESSION_CORRUPTION:
    case ErrorType.TIMEOUT_ERROR:
      return 5000 // Longer for technical issues
    case ErrorType.CHAIN_MISMATCH:
    case ErrorType.INSUFFICIENT_FUNDS:
      return 8000 // Persistent duration for critical errors
    default:
      return 4000 // Standard duration
  }
}

// Authentication-specific toast helpers 
export const authToasts = {
  walletConnected: (walletName?: string) =>
    showSuccessToast(
      'Wallet Connected',
      walletName ? `Successfully connected to ${walletName}` : 'Successfully connected to your wallet',
      3000
    ),

  authSuccess: () =>
    showSuccessToast('Authentication Successful', 'Welcome to SuperPool!', 3000),

  walletDisconnected: () =>
    showInfoToast('Wallet Disconnected', 'Your wallet has been safely disconnected', 3000),

  connectionFailed: (reason?: string) =>
    showErrorToast(
      'Connection Failed',
      reason || 'Failed to connect to wallet. Please try again.',
      4000
    ),

  signatureRejected: () =>
    showWarningToast('Signature Rejected', 'Please approve the signature to continue', 4000),

  networkMismatch: (networkName?: string) =>
    showWarningToast(
      'Wrong Network',
      networkName ? `Please switch to ${networkName} in your wallet` : 'Please switch to the correct network in your wallet',
      6000
    ),

  sessionRecovery: () =>
    showInfoToast('Recovering Session', 'Attempting to restore your connection...', 3000),

  sessionExpired: () =>
    showWarningToast('Session Expired', 'Please reconnect your wallet to continue', 5000),
}

// General app toast helpers
export const appToasts = {
  operationSuccess: (message: string) =>
    showSuccessToast('Success', message, 3000),

  operationFailed: (title: string, message?: string) =>
    showErrorToast(title, message || '', 4000),

  loading: (message: string) =>
    showInfoToast('Please Wait', message, 2000),

  dataSaved: (message: string) =>
    showSuccessToast('Saved', message, 2500),

  dataLoaded: (message: string) =>
    showInfoToast('Updated', message, 2000),

  validationError: (message: string) =>
    showWarningToast('Validation Error', message, 4000),

  permissionDenied: (message: string) =>
    showErrorToast('Permission Required', message, 5000),

  offline: () =>
    showWarningToast('No Internet', 'Some features may not work properly', 5000),

  online: () =>
    showSuccessToast('Connected', 'Internet connection restored', 2000),
}