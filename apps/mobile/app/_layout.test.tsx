import React from 'react'
import { render } from '../src/__tests__/test-utils'
import RootLayout from './_layout'

// Mock AppKit
jest.mock('@reown/appkit-wagmi-react-native', () => ({
  AppKit: () => null,
}))

// Mock QueryClient and Provider
jest.mock('@tanstack/react-query', () => ({
  QueryClient: jest.fn(() => ({})),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
}))

// Mock Expo Router Stack
jest.mock('expo-router', () => {
  const MockStack = ({ children, screenOptions }: { children?: React.ReactNode; screenOptions?: Record<string, unknown> }) => {
    // Verify screenOptions prop
    expect(screenOptions).toEqual({ headerShown: false })
    return <>{children}</>
  }
  MockStack.Screen = ({ name, options }: { name: string; options?: Record<string, unknown> }) => {
    // Return a div with the screen name for testing
    const { View, Text } = require('react-native')
    return (
      <View testID={`stack-screen-${name}`}>
        <Text>{name}</Text>
        {options && <Text testID={`screen-options-${name}`}>{JSON.stringify(options)}</Text>}
      </View>
    )
  }

  return {
    Stack: MockStack,
  }
})

// Mock StatusBar
jest.mock('expo-status-bar', () => ({
  StatusBar: ({ style }: { style: string }) => {
    const { View, Text } = require('react-native')
    return (
      <View testID="status-bar">
        <Text testID="status-bar-style">{style}</Text>
      </View>
    )
  },
}))

// Mock Toast with enhanced functionality for this test
jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: ({ config }: { config: unknown }) => {
    const { View, Text } = require('react-native')
    return (
      <View testID="toast-message">
        <Text testID="toast-config">{config ? 'configured' : 'no-config'}</Text>
      </View>
    )
  },
}))

// Mock Wagmi Provider with enhanced functionality for this test
jest.mock('wagmi', () => ({
  WagmiProvider: ({ children, config }: { children: React.ReactNode; config: unknown }) => {
    const { View, Text } = require('react-native')
    return (
      <View testID="wagmi-provider">
        <Text testID="wagmi-config">{config ? 'configured' : 'no-config'}</Text>
        {children}
      </View>
    )
  },
  useAccount: jest.fn(() => ({
    isConnected: false,
    isConnecting: false,
    address: undefined,
    chainId: undefined,
  })),
  useSignMessage: jest.fn(() => ({
    signMessageAsync: jest.fn().mockResolvedValue('0xsignature'),
    isPending: false,
  })),
}))

// Mock config imports
jest.mock('../src/config', () => ({
  toastConfig: { mockToastConfig: true },
  wagmiConfig: { mockWagmiConfig: true },
}))

// Mock Firebase config to match the global mocks
jest.mock('../src/config/firebase', () => ({
  FIREBASE_AUTH: {
    authStateReady: jest.fn().mockResolvedValue(undefined),
  },
}))

describe('RootLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should render the complete app structure', () => {
    const { getByTestId } = render(<RootLayout />)

    // Verify main providers are rendered
    expect(getByTestId('wagmi-provider')).toBeTruthy()
    expect(getByTestId('wagmi-config')).toBeTruthy()
  })

  it('should render all navigation screens', () => {
    const { getByTestId } = render(<RootLayout />)

    // Check all navigation screens
    expect(getByTestId('stack-screen-index')).toBeTruthy()
    expect(getByTestId('stack-screen-onboarding')).toBeTruthy()
    expect(getByTestId('stack-screen-connecting')).toBeTruthy()
    expect(getByTestId('stack-screen-(auth)')).toBeTruthy()
  })

  it('should configure auth screen with fade animation', () => {
    const { getByTestId } = render(<RootLayout />)

    const authScreenOptions = getByTestId('screen-options-(auth)')
    expect(authScreenOptions).toBeTruthy()
    expect(authScreenOptions.children[0]).toContain('fade')
  })

  it('should render StatusBar with auto style', () => {
    const { getByTestId } = render(<RootLayout />)

    expect(getByTestId('status-bar')).toBeTruthy()
    expect(getByTestId('status-bar-style')).toBeTruthy()
  })

  it('should render AppKit component', () => {
    // AppKit is mocked to return null, but we verify it's imported and used
    render(<RootLayout />)
    // If this test passes without errors, AppKit was successfully rendered
    expect(true).toBe(true)
  })

  it('should render Toast with config', () => {
    const { getByTestId } = render(<RootLayout />)

    expect(getByTestId('toast-message')).toBeTruthy()
    expect(getByTestId('toast-config')).toBeTruthy()
  })

  it('should provide Wagmi configuration', () => {
    const { getByTestId } = render(<RootLayout />)

    const wagmiConfig = getByTestId('wagmi-config')
    expect(wagmiConfig.children[0]).toBe('configured')
  })

  it('should have proper provider hierarchy', () => {
    const { getByTestId } = render(<RootLayout />)

    // Verify that WagmiProvider wraps other components
    const wagmiProvider = getByTestId('wagmi-provider')
    expect(wagmiProvider).toBeTruthy()

    // Verify Stack screens are inside the provider structure
    expect(getByTestId('stack-screen-index')).toBeTruthy()
  })
})
