import { ErrorType } from '../types/errors'

export const ERROR_MESSAGES: Record<ErrorType, string> = {
  [ErrorType.WALLET_CONNECTION_FAILED]: 'Failed to connect to your wallet. Please try again.',
  [ErrorType.WALLET_DISCONNECTED]: 'Your wallet has been disconnected. Please reconnect to continue.',
  [ErrorType.MESSAGE_GENERATION_FAILED]: 'Failed to generate authentication message. Please try again.',
  [ErrorType.SIGNATURE_REJECTED]: 'You rejected the signature request. Authentication cancelled.',
  [ErrorType.SIGNATURE_FAILED]: 'Failed to sign the authentication message. Please try again.',
  [ErrorType.FIREBASE_AUTH_FAILED]: 'Authentication failed. Please try connecting your wallet again.',
  [ErrorType.NETWORK_ERROR]: 'Network connection error. Please check your internet and try again.',
  [ErrorType.UNKNOWN_ERROR]: 'An unexpected error occurred. Please try again.',
}

export const ERROR_SUGGESTIONS: Record<ErrorType, string[]> = {
  [ErrorType.WALLET_CONNECTION_FAILED]: [
    'Make sure your wallet app is running',
    'Try refreshing the page',
    'Check your internet connection',
  ],
  [ErrorType.WALLET_DISCONNECTED]: ['Reconnect your wallet using the button above', 'Check if your wallet is still unlocked'],
  [ErrorType.MESSAGE_GENERATION_FAILED]: ['Check your internet connection', 'Try again in a few moments'],
  [ErrorType.SIGNATURE_REJECTED]: ['Click "Connect Wallet" to try again', 'Make sure you approve the signature request'],
  [ErrorType.SIGNATURE_FAILED]: ['Try disconnecting and reconnecting your wallet', 'Make sure your wallet is unlocked'],
  [ErrorType.FIREBASE_AUTH_FAILED]: ['Try disconnecting and reconnecting your wallet', 'Check your internet connection'],
  [ErrorType.NETWORK_ERROR]: ['Check your internet connection', 'Try again in a few moments'],
  [ErrorType.UNKNOWN_ERROR]: ['Try refreshing the page', 'Contact support if the issue persists'],
}
