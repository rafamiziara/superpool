import 'react-native-get-random-values'

// Screens are exercised against the mock pool data by default; the tests that
// cover the live `listPools` path opt out per case.
process.env.EXPO_PUBLIC_USE_MOCK_POOLS = 'true'

import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock'

// Export router mock functions for tests that need to access them
export const mockRouterReplace = jest.fn()
export const mockRouterPush = jest.fn()
export const mockRouterBack = jest.fn()
/** Pops back to an existing screen instead of stacking a duplicate. */
export const mockRouterDismissTo = jest.fn()

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
      dismissTo: mockRouterDismissTo,
    }),
    router: {
      push: mockRouterPush,
      replace: mockRouterReplace,
      back: mockRouterBack,
      dismissTo: mockRouterDismissTo,
    },
    usePathname: () => '/dashboard',
    useLocalSearchParams: () => mockLocalSearchParams(),
  }
})

/**
 * Push notifications.
 *
 * Denied by default, which is what an unprompted install actually is — so a
 * screen that asks for permission takes the "no" branch unless a test opts in.
 * That keeps every other suite from wandering into token registration.
 *
 * Exported so the notification tests can drive the answers and assert on the
 * listeners; `addNotification*Listener` returns a subscription because the
 * component calls `.remove()` on unmount.
 */
export const mockGetPermissions = jest.fn(async () => ({ status: 'denied', canAskAgain: true }))
export const mockRequestPermissions = jest.fn(async () => ({ status: 'denied', canAskAgain: true }))
export const mockGetExpoPushToken = jest.fn(async () => ({ data: 'ExponentPushToken[test-token]' }))
export const mockAddNotificationReceivedListener = jest.fn(() => ({ remove: jest.fn() }))
export const mockAddNotificationResponseReceivedListener = jest.fn(() => ({ remove: jest.fn() }))
export const mockSetNotificationChannel = jest.fn(async () => undefined)

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissions(...(args as [])),
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissions(...(args as [])),
  getExpoPushTokenAsync: (...args: unknown[]) => mockGetExpoPushToken(...(args as [])),
  setNotificationChannelAsync: (...args: unknown[]) => mockSetNotificationChannel(...(args as [])),
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: (...args: unknown[]) => mockAddNotificationReceivedListener(...(args as [])),
  addNotificationResponseReceivedListener: (...args: unknown[]) => mockAddNotificationResponseReceivedListener(...(args as [])),
  AndroidImportance: { DEFAULT: 3 },
}))

// A physical device by default: `registerForPushNotifications` bails out early
// otherwise, which would make every registration test pass for the wrong reason.
jest.mock('expo-device', () => ({ isDevice: true }))

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
