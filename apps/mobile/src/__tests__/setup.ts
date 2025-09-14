import 'react-native-get-random-values'

// Mock Expo modules
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
}))

jest.mock('@expo/vector-icons', () => ({
  FontAwesome: 'FontAwesome',
}))
