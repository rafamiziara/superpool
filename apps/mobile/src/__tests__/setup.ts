import 'react-native-get-random-values'

import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock'

// Export router mock functions for tests that need to access them
export const mockRouterReplace = jest.fn()
export const mockRouterPush = jest.fn()
export const mockRouterBack = jest.fn()

/** Route params for screens under `app/**\/[param].tsx`. Set per test. */
export const mockLocalSearchParams = jest.fn<Record<string, string>, []>(() => ({}))

// Mock Expo modules
jest.mock('expo-router', () => {
  // `Stack.Screen` is declarative config, not UI — render nothing.
  const Stack = () => null
  Stack.Screen = () => null

  return {
    Stack,
    useRouter: () => ({
      push: mockRouterPush,
      replace: mockRouterReplace,
      back: mockRouterBack,
    }),
    router: {
      push: mockRouterPush,
      replace: mockRouterReplace,
      back: mockRouterBack,
    },
    usePathname: () => '/dashboard',
    useLocalSearchParams: () => mockLocalSearchParams(),
  }
})

// Mock uniwind (styles are compiled by Metro, not available in jest)
jest.mock('uniwind', () => ({
  Uniwind: {
    updateInsets: jest.fn(),
    setTheme: jest.fn(),
    getCSSVariable: jest.fn(),
    updateCSSVariables: jest.fn(),
    currentTheme: 'dark',
    hasAdaptiveThemes: true,
  },
  useUniwind: () => ({ theme: 'dark', hasAdaptiveThemes: true }),
  useResolveClassNames: () => ({}),
  useCSSVariable: jest.fn(),
  withUniwind: (component: unknown) => component,
}))

// Mock safe-area-context (the official jest mock ships untransformed TSX)
jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual<typeof import('react')>('react')
  const { View } = jest.requireActual<typeof import('react-native')>('react-native')
  const inset = { top: 0, right: 0, bottom: 0, left: 0 }
  const frame = { x: 0, y: 0, width: 0, height: 0 }
  return {
    SafeAreaProvider: ({ children }: { children?: React.ReactNode }) => children,
    SafeAreaListener: ({ children }: { children?: React.ReactNode }) => children,
    SafeAreaView: ({ children, ...props }: { children?: React.ReactNode }) => React.createElement(View, props, children),
    SafeAreaInsetsContext: React.createContext(inset),
    SafeAreaFrameContext: React.createContext(frame),
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => frame,
    initialWindowMetrics: { insets: inset, frame },
  }
})

jest.mock('@expo/vector-icons', () => ({ FontAwesome: 'FontAwesome' }))

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage)

// Import global mocks to ensure they are registered
import './mocks'
