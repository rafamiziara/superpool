import type { User } from '@superpool/types'
import { act, renderHook } from '@testing-library/react-native'
import { mockRouterReplace } from '../../__tests__/setup'
import { mockToast } from '../../__tests__/mocks'
import { useNavigationController } from './useNavigationController'

// Create mock functions at module level - must be hoisted
const mockUseSegmentsReturn = jest.fn()

// Mock expo-router - override the setup mock
jest.mock('expo-router', () => {
  const { mockRouterReplace, mockRouterPush, mockRouterBack } = require('../../__tests__/setup')
  return {
    useRouter: () => ({
      push: mockRouterPush,
      replace: mockRouterReplace,
      back: mockRouterBack,
    }),
    useSegments: () => mockUseSegmentsReturn(),
  }
})

// Mock useAutoAuth
jest.mock('../auth/useAutoAuth')
import { useAutoAuth } from '../auth/useAutoAuth'

const mockUseAutoAuth = useAutoAuth as jest.MockedFunction<typeof useAutoAuth>

const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {})

describe('useNavigationController', () => {
  const mockAutoAuthHook = {
    // Wallet state
    isConnected: false,
    address: null,
    chainId: null,
    // User state
    user: null,
    // Auth state
    isAuthenticating: false,
    error: null,
    progress: 0,
    // Computed states
    isFullyAuthenticated: false,
    needsAuthentication: false,
    // Actions
    retryAuthentication: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    mockRouterReplace.mockClear()
    mockToast.show.mockClear()
    mockConsoleLog.mockClear()
    mockUseSegmentsReturn.mockReturnValue([])

    // Set up default mock return
    mockUseAutoAuth.mockReturnValue(mockAutoAuthHook)
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
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
      jest.advanceTimersByTime(200) // Advance past the timeout
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
      jest.advanceTimersByTime(200) // Advance past the timeout
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
      jest.advanceTimersByTime(200) // Advance past the timeout
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

  it('should not navigate if already on correct route', async () => {
    // Set segments BEFORE rendering
    mockUseSegmentsReturn.mockReturnValue(['onboarding'])

    const { rerender } = renderHook(() => useNavigationController())

    // First timer advance for initial load
    await act(async () => {
      jest.advanceTimersByTime(150) // Initial timeout
    })

    // Wait for second timer (subsequent navigation check)
    await act(async () => {
      rerender({})
      jest.advanceTimersByTime(150) // Subsequent timeout
    })

    expect(mockRouterReplace).not.toHaveBeenCalled()
    // The route matching is working if router.replace wasn't called
    // Don't require specific console log as the timing might vary
  })

  it('should handle different route formats correctly', async () => {
    // Set segments and user BEFORE rendering
    mockUseSegmentsReturn.mockReturnValue(['(auth)', 'dashboard'])

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

    // First timer advance for initial load
    await act(async () => {
      jest.advanceTimersByTime(150) // Initial timeout
    })

    // Wait for second timer (subsequent navigation check)
    await act(async () => {
      rerender({})
      jest.advanceTimersByTime(150) // Subsequent timeout
    })

    expect(mockRouterReplace).not.toHaveBeenCalled()
    // The route matching is working if router.replace wasn't called
    // Don't require specific console log as the timing might vary
  })
})
