/**
 * AsyncStorage Mock Setup Utility
 *
 * Centralized utility for setting up AsyncStorage mock responses
 * in sessionManager tests. This reduces repetitive setup code.
 */

const AsyncStorage = require('@react-native-async-storage/async-storage')

/**
 * Standard AsyncStorage mock setup for successful operations
 */
export const setupAsyncStorageSuccess = (
  overrides: {
    getAllKeys?: string[]
    getItem?: string | null
    multiGetResults?: Array<[string, string | null]>
  } = {}
) => {
  AsyncStorage.getAllKeys.mockResolvedValue(overrides.getAllKeys || [])
  AsyncStorage.multiGet.mockResolvedValue(overrides.multiGetResults || [])
  AsyncStorage.multiRemove.mockResolvedValue()
  AsyncStorage.getItem.mockResolvedValue(overrides.getItem || null)
  AsyncStorage.removeItem.mockResolvedValue()
  AsyncStorage.setItem.mockResolvedValue()
}

/**
 * Setup AsyncStorage mocks to simulate errors
 */
export const setupAsyncStorageError = (errorMessage: string = 'Storage error') => {
  const error = new Error(errorMessage)
  AsyncStorage.getAllKeys.mockRejectedValue(error)
  AsyncStorage.multiGet.mockRejectedValue(error)
  AsyncStorage.multiRemove.mockRejectedValue(error)
  AsyncStorage.getItem.mockRejectedValue(error)
  AsyncStorage.removeItem.mockRejectedValue(error)
  AsyncStorage.setItem.mockRejectedValue(error)
}

/**
 * Common session-related key patterns for testing
 */
export const SESSION_KEY_PATTERNS = {
  walletConnect: (sessionId: string) => `wc@2:session_topic:${sessionId}`,
  pairing: (sessionId: string) => `wc@2:pairing_topic:${sessionId}`,
  sessionData: (sessionId: string) => `session_data_${sessionId}`,
  coreExpirer: (identifier: string) => `wc@2:core:0.3//expirer:${identifier}`,
  coreMessages: (identifier: string) => `wc@2:core:0.3//messages:${identifier}`,
  queryCache: (identifier: string) => `react-query-${identifier}`,
} as const

/**
 * Generate test session IDs of various lengths
 */
export const generateSessionId = (length: number = 64): string => {
  return 'a'.repeat(Math.min(length, 64)).padEnd(64, '0').substring(0, length)
}
