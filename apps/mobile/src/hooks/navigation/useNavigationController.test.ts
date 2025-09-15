import type { User } from '@superpool/types'
import { act, renderHook } from '@testing-library/react-native'
import { mockRouterReplace } from '../../__tests__/setup'
import { mockToast } from '../../__tests__/mocks'
import { useNavigationController } from './useNavigationController'

// Mock useAutoAuth
jest.mock('../auth/useAutoAuth')
import { useAutoAuth } from '../auth/useAutoAuth'

const mockUseAutoAuth = useAutoAuth as jest.MockedFunction<typeof useAutoAuth>

const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {})

describe('useNavigationController', () => {
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
    mockRouterReplace.mockClear()
    mockToast.show.mockClear()
    mockConsoleLog.mockClear()

    // Set up default mock return
    mockUseAutoAuth.mockReturnValue(mockAutoAuthHook)
  })

  afterAll(() => {
    mockConsoleLog.mockRestore()
  })

  it('should initialize with navigation loading state', () => {
    const { result } = renderHook(() => useNavigationController())

    expect(result.current.isNavigating).toBe(true)
    expect(result.current.isConnected).toBe(false)
    expect(result.current.user).toBe(null)
  })

  it('should navigate to onboarding when not connected', async () => {
    const { result, rerender } = renderHook(() => useNavigationController())

    // Trigger navigation after initialization
    await act(async () => {
      rerender({})
    })

    expect(result.current.isNavigating).toBe(false)
    expect(mockRouterReplace).toHaveBeenCalledWith('/onboarding')
    expect(mockConsoleLog).toHaveBeenCalledWith('📱 Navigating to onboarding - wallet not connected')
  })

  it('should navigate to connecting when wallet connected but not authenticated', async () => {
    mockUseAutoAuth.mockReturnValue({
      ...mockAutoAuthHook,
      isConnected: true,
      user: null,
    })

    const { rerender } = renderHook(() => useNavigationController())

    await act(async () => {
      rerender({})
    })

    expect(mockRouterReplace).toHaveBeenCalledWith('/connecting')
    expect(mockConsoleLog).toHaveBeenCalledWith('🔐 Navigating to connecting - wallet connected')
  })

  it('should navigate to dashboard when fully authenticated', async () => {
    const mockUser: User = {
      walletAddress: '0x123456789',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    mockUseAutoAuth.mockReturnValue({
      ...mockAutoAuthHook,
      isConnected: true,
      user: mockUser,
    })

    const { rerender } = renderHook(() => useNavigationController())

    await act(async () => {
      rerender({})
    })

    expect(mockRouterReplace).toHaveBeenCalledWith('/(auth)/dashboard')
    expect(mockConsoleLog).toHaveBeenCalledWith('✅ Navigating to dashboard - user authenticated')
  })

  it('should show wallet connected toast on connection', async () => {
    const { rerender } = renderHook(() => useNavigationController())

    // Simulate wallet connection
    await act(async () => {
      mockUseAutoAuth.mockReturnValue({
        ...mockAutoAuthHook,
        isConnected: true,
        user: null,
      })
      rerender({})
    })

    expect(mockToast.show).toHaveBeenCalledWith({
      type: 'success',
      text1: 'Wallet Connected!',
      text2: 'Starting authentication...',
      position: 'top',
      visibilityTime: 3000,
      topOffset: 60,
    })

    expect(mockConsoleLog).toHaveBeenCalledWith('🎉 Showing wallet connected toast')
  })

  it('should show authentication success toast when user authenticated', async () => {
    const { rerender } = renderHook(() => useNavigationController())

    // Start with wallet connected
    await act(async () => {
      mockUseAutoAuth.mockReturnValue({
        ...mockAutoAuthHook,
        isConnected: true,
        user: null,
      })
      rerender({})
    })

    // Then authenticate
    const mockUser: User = {
      walletAddress: '0x123456789',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    await act(async () => {
      mockUseAutoAuth.mockReturnValue({
        ...mockAutoAuthHook,
        isConnected: true,
        user: mockUser,
      })
      rerender({})
    })

    expect(mockToast.show).toHaveBeenCalledWith({
      type: 'success',
      text1: 'Authentication Successful!',
      text2: 'Welcome to SuperPool',
      position: 'top',
      visibilityTime: 3000,
      topOffset: 60,
    })
  })

  it('should show wallet disconnected toast on disconnection', async () => {
    const { rerender } = renderHook(() => useNavigationController())

    const mockUser: User = {
      walletAddress: '0x123456789',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    // Start authenticated
    await act(async () => {
      mockUseAutoAuth.mockReturnValue({
        ...mockAutoAuthHook,
        isConnected: true,
        user: mockUser,
      })
      rerender({})
    })

    // Then disconnect
    await act(async () => {
      mockUseAutoAuth.mockReturnValue({
        ...mockAutoAuthHook,
        isConnected: false,
        user: null,
      })
      rerender({})
    })

    expect(mockToast.show).toHaveBeenCalledWith({
      type: 'info',
      text1: 'Wallet Disconnected',
      text2: 'You have been logged out',
      position: 'top',
      visibilityTime: 3000,
      topOffset: 60,
    })
  })

  it('should not show toasts on initial render', () => {
    const mockUser: User = {
      walletAddress: '0x123456789',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    mockUseAutoAuth.mockReturnValue({
      ...mockAutoAuthHook,
      isConnected: true,
      user: mockUser,
    })

    renderHook(() => useNavigationController())

    expect(mockToast.show).not.toHaveBeenCalled()
  })

  it('should handle rapid state changes gracefully', async () => {
    const { rerender } = renderHook(() => useNavigationController())

    const mockUser: User = {
      walletAddress: '0x123456789',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    // Rapid changes: disconnected → connected → authenticated
    await act(async () => {
      mockUseAutoAuth.mockReturnValue({
        ...mockAutoAuthHook,
        isConnected: true,
        user: null,
      })
      rerender({})
    })

    await act(async () => {
      mockUseAutoAuth.mockReturnValue({
        ...mockAutoAuthHook,
        isConnected: true,
        user: mockUser,
      })
      rerender({})
    })

    // Should handle both toasts
    expect(mockToast.show).toHaveBeenCalledTimes(2)
  })
})
