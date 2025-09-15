import 'react-native-get-random-values'

import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock'

// Export router mock functions for tests that need to access them
export const mockRouterReplace = jest.fn()
export const mockRouterPush = jest.fn()
export const mockRouterBack = jest.fn()

// Mock Expo modules
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: mockRouterReplace,
    back: mockRouterBack,
  }),
}))

jest.mock('@expo/vector-icons', () => ({ FontAwesome: 'FontAwesome' }))

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage)

// Import global mocks to ensure they are registered
import './mocks'
