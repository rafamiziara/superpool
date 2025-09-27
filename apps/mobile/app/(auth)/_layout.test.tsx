import { render } from '../../src/__tests__/test-utils'
import React from 'react'
import { authStore } from '../../src/stores/AuthStore'
import AuthLayout from './_layout'

// Mock authStore
jest.mock('../../src/stores/AuthStore', () => ({
  authStore: {
    isWalletConnected: false,
    user: null,
  },
}))

// Mock Stack component
jest.mock('expo-router', () => {
  const MockStack = (_props: { children?: React.ReactNode; screenOptions?: Record<string, unknown> }) => null
  MockStack.Screen = (_props: { name: string }) => null

  return {
    Stack: MockStack,
  }
})

const mockAuthStore = authStore as jest.Mocked<typeof authStore>

describe('AuthLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    // Reset to default state
    mockAuthStore.isWalletConnected = false
    mockAuthStore.user = null
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
})
