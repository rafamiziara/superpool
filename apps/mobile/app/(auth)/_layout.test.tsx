import type React from 'react'
import { act, render } from '../../src/__tests__/test-utils'
import { authStore } from '../../src/stores/AuthStore'
import { poolStore } from '../../src/stores/PoolStore'
import AuthLayout from './_layout'

// The header constants pull in AppKit, whose ES modules do not survive Jest.
jest.mock('@reown/appkit-wagmi-react-native', () => ({
  AppKitButton: () => null,
}))

/*
  The real store, not a stand-in.

  This used to be an observable mock, because `observer` wrapped the layout in
  `React.memo` and only MobX could say something it read had changed. Zustand's
  store notifies its subscribers itself, so the real one is both simpler and
  stricter: the network-switch test below fails against an effect that drops
  `chainId`, which is the regression it exists to catch.
*/

// Mock Stack component
jest.mock('expo-router', () => {
  const MockStack = (_props: { children?: React.ReactNode; screenOptions?: Record<string, unknown> }) => null
  MockStack.Screen = (_props: { name: string }) => null

  return {
    Stack: MockStack,
    // The shared header constants build the app's navigation theme from this.
    DarkTheme: { dark: true, colors: {}, fonts: {} },
  }
})

// Spied on the real store — see usePoolIndexing's test for why that is possible now.
const mockFetchPools = jest.spyOn(poolStore.getState(), 'fetchPools').mockResolvedValue(undefined)

const TEST_USER = {
  walletAddress: '0x123456789',
  createdAt: Date.now(),
  updatedAt: Date.now(),
}

/** Signed in, on one chain. */
function authenticateOn(chainId: number) {
  authStore.setState({ isWalletConnected: true, chainId, user: TEST_USER })
}

describe('AuthLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    // Reset to default state
    authStore.setState({ isWalletConnected: false, user: null, chainId: null })
  })

  it('should render Stack when fully authenticated', () => {
    authStore.setState({ isWalletConnected: true, user: TEST_USER })

    const { UNSAFE_root } = render(<AuthLayout />)
    expect(UNSAFE_root).toBeTruthy()
  })

  it('should show redirect message when not authenticated', () => {
    authStore.setState({ isWalletConnected: false, user: null })

    const { getByText } = render(<AuthLayout />)
    expect(getByText('Redirecting to authentication...')).toBeTruthy()
  })

  it('should show redirect message when wallet connected but no user', () => {
    authStore.setState({ isWalletConnected: true, user: null })

    const { getByText } = render(<AuthLayout />)
    expect(getByText('Redirecting to authentication...')).toBeTruthy()
  })

  it('should show redirect message when user exists but wallet not connected', () => {
    authStore.setState({ isWalletConnected: false, user: TEST_USER })

    const { getByText } = render(<AuthLayout />)
    expect(getByText('Redirecting to authentication...')).toBeTruthy()
  })

  // -------------------------------------------------------------------------
  // Which chain's pools are loaded.
  //
  // Every list in the app is one chain's, so the connected chain decides which
  // pools exist — not merely how they are fetched.
  // -------------------------------------------------------------------------

  describe('loading pools', () => {
    it('loads pools once signed in', () => {
      authenticateOn(31337)

      render(<AuthLayout />)

      expect(mockFetchPools).toHaveBeenCalledTimes(1)
    })

    it('loads nothing while signed out', () => {
      render(<AuthLayout />)

      expect(mockFetchPools).not.toHaveBeenCalled()
    })

    it('reloads when the wallet switches network', () => {
      // The regression: the effect depended on authentication alone, so after
      // a switch the store kept serving the previous chain's pools.
      authenticateOn(31337)
      render(<AuthLayout />)

      act(() => {
        authStore.setState({ chainId: 80002 })
      })

      expect(mockFetchPools).toHaveBeenCalledTimes(2)
    })

    it('does not reload when the wallet reports the same network again', () => {
      authenticateOn(31337)
      render(<AuthLayout />)

      act(() => {
        authStore.setState({ chainId: 31337 })
      })

      expect(mockFetchPools).toHaveBeenCalledTimes(1)
    })
  })
})
