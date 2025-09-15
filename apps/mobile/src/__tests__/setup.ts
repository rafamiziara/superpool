import 'react-native-get-random-values'

import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock'

// Mock Expo modules
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
}))

jest.mock('@expo/vector-icons', () => ({ FontAwesome: 'FontAwesome' }))

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage)
