import { act, render } from '../../src/__tests__/test-utils'
import { runInAction } from 'mobx'
import React from 'react'
import { authStore } from '../../src/stores/AuthStore'
import { poolStore } from '../../src/stores/PoolStore'
import AuthLayout from './_layout'

// The header constants pull in AppKit, whose ES modules do not survive Jest.
jest.mock('@reown/appkit-wagmi-react-native', () => ({
  AppKitButton: () => null,
}))

/**
 * Observable rather than a plain object, because `observer` wraps the layout in
 * `React.memo`: with no props to change, a re-render only happens when MobX
 * says something it read has changed. A plain mock cannot say that, and the
 * network-switch test below would pass against either version of the effect.
 */
jest.mock('../../src/stores/AuthStore', () => {
  const { observable } = jest.requireActual('mobx')

  return {
    authStore: observable({
      isWalletConnected: false,
      user: null,
      chainId: null,
    }),
  }
})

jest.mock('../../src/stores/PoolStore', () => ({
  poolStore: {
    fetchPools: jest.fn(),
  },
}))

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

const mockAuthStore = authStore as jest.Mocked<typeof authStore>
const mockFetchPools = poolStore.fetchPools as jest.Mock

/** Signed in, on one chain. */
function authenticateOn(chainId: number) {
  runInAction(() => {
    mockAuthStore.isWalletConnected = true
    mockAuthStore.chainId = chainId
    mockAuthStore.user = {
      walletAddress: '0x123456789',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
  })
}

describe('AuthLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    // Reset to default state
    runInAction(() => {
      mockAuthStore.isWalletConnected = false
      mockAuthStore.user = null
      mockAuthStore.chainId = null
    })
  })

  it('should render Stack when fully authenticated', () => {
    mockAuthStore.isWalletConnected = true
    mockAuthStore.user = {
      walletAddress: '0x123456789',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    const { UNSAFE_root } = render(<AuthLayout />)
    expect(UNSAFE_root).toBeTruthy()
  })

  it('should show redirect message when not authenticated', () => {
    mockAuthStore.isWalletConnected = false
    mockAuthStore.user = null

    const { getByText } = render(<AuthLayout />)
    expect(getByText('Redirecting to authentication...')).toBeTruthy()
  })

  it('should show redirect message when wallet connected but no user', () => {
    mockAuthStore.isWalletConnected = true
    mockAuthStore.user = null

    const { getByText } = render(<AuthLayout />)
    expect(getByText('Redirecting to authentication...')).toBeTruthy()
  })

  it('should show redirect message when user exists but wallet not connected', () => {
    mockAuthStore.isWalletConnected = false
    mockAuthStore.user = {
      walletAddress: '0x123456789',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

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
        runInAction(() => {
          mockAuthStore.chainId = 80002
        })
      })

      expect(mockFetchPools).toHaveBeenCalledTimes(2)
    })

    it('does not reload when the wallet reports the same network again', () => {
      authenticateOn(31337)
      render(<AuthLayout />)

      act(() => {
        runInAction(() => {
          mockAuthStore.chainId = 31337
        })
      })

      expect(mockFetchPools).toHaveBeenCalledTimes(1)
    })
  })
})
