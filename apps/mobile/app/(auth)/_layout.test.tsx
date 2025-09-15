import { render } from '@testing-library/react-native'
import React from 'react'
import AuthLayout from './_layout'

// Mock useAutoAuth
jest.mock('../../src/hooks/auth/useAutoAuth')
import { useAutoAuth } from '../../src/hooks/auth/useAutoAuth'

const mockUseAutoAuth = useAutoAuth as jest.MockedFunction<typeof useAutoAuth>

// Mock Stack component
jest.mock('expo-router', () => {
  const MockStack = (_props: { children?: React.ReactNode; screenOptions?: Record<string, unknown> }) => null
  MockStack.Screen = (_props: { name: string }) => null

  return {
    Stack: MockStack,
  }
})

describe('AuthLayout', () => {
  const mockAutoAuthHook = {
    isConnected: false,
    address: null,
    user: null,
    isAuthenticating: false,
    error: null,
    progress: 0,
    isFullyAuthenticated: false,
    needsAuthentication: false,
    chainId: null,
    retryAuthentication: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()

    // Set up default mock return
    mockUseAutoAuth.mockReturnValue(mockAutoAuthHook)
  })

  it('should render Stack when fully authenticated', () => {
    mockUseAutoAuth.mockReturnValue({
      ...mockAutoAuthHook,
      isFullyAuthenticated: true,
    })

    const { UNSAFE_root } = render(<AuthLayout />)
    expect(UNSAFE_root).toBeTruthy()
  })

  it('should show redirect message when not authenticated', () => {
    mockUseAutoAuth.mockReturnValue({
      ...mockAutoAuthHook,
      isFullyAuthenticated: false,
    })

    const { getByText } = render(<AuthLayout />)
    expect(getByText('Redirecting to authentication...')).toBeTruthy()
  })

  it('should handle authentication states correctly', () => {
    // Test when user is connected but not fully authenticated
    mockUseAutoAuth.mockReturnValue({
      ...mockAutoAuthHook,
      isConnected: true,
      isFullyAuthenticated: false,
    })

    const { getByText } = render(<AuthLayout />)
    expect(getByText('Redirecting to authentication...')).toBeTruthy()
  })

  it('should use complete hook interface for type safety', () => {
    // Test that all required properties are provided
    mockUseAutoAuth.mockReturnValue({
      ...mockAutoAuthHook,
      isFullyAuthenticated: true,
      isConnected: true,
      user: {
        walletAddress: '0x123456789',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    })

    const { UNSAFE_root } = render(<AuthLayout />)
    expect(UNSAFE_root).toBeTruthy()
  })
})
