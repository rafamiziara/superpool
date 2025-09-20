import { fireEvent, render } from '@testing-library/react-native'
import React from 'react'
import { Alert } from 'react-native'
import DashboardScreen from './dashboard'

// Mock dependencies
jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}))

jest.mock('@reown/appkit-wagmi-react-native', () => ({
  AppKitButton: 'AppKitButton',
}))

const mockUseAutoAuth = jest.fn()
jest.mock('../../src/hooks/auth/useAutoAuth', () => ({
  useAutoAuth: () => mockUseAutoAuth(),
}))

const mockShowToast = {
  info: jest.fn(),
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
}
jest.mock('../../src/config/toast', () => ({
  showToast: mockShowToast,
}))

// Mock Alert
jest.spyOn(Alert, 'alert').mockImplementation(jest.fn())

describe('DashboardScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    // Default mock state - fully authenticated user
    mockUseAutoAuth.mockReturnValue({
      address: '0x1234567890123456789012345678901234567890',
      chainId: 137,
      isConnected: true,
    })
  })

  it('should render dashboard screen', () => {
    const { getByTestId } = render(<DashboardScreen />)

    expect(getByTestId('dashboard-screen')).toBeTruthy()
    expect(getByTestId('dashboard-header')).toBeTruthy()
    expect(getByTestId('user-info-section')).toBeTruthy()
    expect(getByTestId('wallet-management-section')).toBeTruthy()
    expect(getByTestId('quick-actions-section')).toBeTruthy()
    expect(getByTestId('status-section')).toBeTruthy()
  })

  it('should display welcome message', () => {
    const { getByTestId, getByText } = render(<DashboardScreen />)

    expect(getByTestId('welcome-title')).toBeTruthy()
    expect(getByTestId('welcome-subtitle')).toBeTruthy()
    expect(getByText('Welcome to SUPERPOOL!')).toBeTruthy()
    expect(getByText('Your decentralized lending platform is ready')).toBeTruthy()
  })

  it('should display user information', () => {
    const { getByTestId, getByText } = render(<DashboardScreen />)

    expect(getByTestId('user-info-section')).toBeTruthy()
    expect(getByTestId('wallet-address-info')).toBeTruthy()
    expect(getByTestId('network-info')).toBeTruthy()

    expect(getByText('0x1234567890123456789012345678901234567890')).toBeTruthy()
    expect(getByText('Chain ID: 137')).toBeTruthy()
  })

  it('should show connection status correctly', () => {
    const { getByTestId } = render(<DashboardScreen />)

    const statusDot = getByTestId('connection-status-dot')
    expect(statusDot).toBeTruthy()
    // Should show green dot for connected state
  })

  it('should handle disconnected state', () => {
    mockUseAutoAuth.mockReturnValue({
      address: null,
      chainId: null,
      isConnected: false,
    })

    const { getAllByText } = render(<DashboardScreen />)

    expect(getAllByText('Not connected')).toHaveLength(2)
  })

  it('should render AppKit wallet button', () => {
    const { getByTestId } = render(<DashboardScreen />)

    // AppKitButton should be rendered within wallet management section
    expect(getByTestId('wallet-management-section')).toBeTruthy()
  })

  it('should render quick action cards', () => {
    const { getByTestId } = render(<DashboardScreen />)

    expect(getByTestId('create-pool-action')).toBeTruthy()
    expect(getByTestId('join-pool-action')).toBeTruthy()
    expect(getByTestId('portfolio-action')).toBeTruthy()
  })

  it('should show quick action content', () => {
    const { getByText } = render(<DashboardScreen />)

    expect(getByText('Create Lending Pool')).toBeTruthy()
    expect(getByText('Join Lending Pool')).toBeTruthy()
    expect(getByText('View Portfolio')).toBeTruthy()
  })

  it('should handle create pool action', () => {
    const { getByTestId } = render(<DashboardScreen />)

    const createButton = getByTestId('create-pool-button')
    fireEvent.press(createButton)

    expect(Alert.alert).toHaveBeenCalledWith('Pool Action', 'Create Pool functionality will be available in the next phase.', [
      { text: 'OK' },
    ])
  })

  it('should handle join pool action', () => {
    const { getByTestId } = render(<DashboardScreen />)

    const joinButton = getByTestId('join-pool-button')
    fireEvent.press(joinButton)

    expect(Alert.alert).toHaveBeenCalledWith('Pool Action', 'Join Pool functionality will be available in the next phase.', [
      { text: 'OK' },
    ])
  })

  it('should handle portfolio action', () => {
    const { getByTestId } = render(<DashboardScreen />)

    const portfolioButton = getByTestId('portfolio-button')
    fireEvent.press(portfolioButton)

    expect(Alert.alert).toHaveBeenCalledWith('Pool Action', 'View Portfolio functionality will be available in the next phase.', [
      { text: 'OK' },
    ])
  })

  it('should show success status', () => {
    const { getByText } = render(<DashboardScreen />)

    expect(getByText('Authentication Successful')).toBeTruthy()
    expect(getByText("Your wallet is connected and you're ready to use SUPERPOOL")).toBeTruthy()
  })

  describe('User data edge cases', () => {
    it('should handle partial connection data', () => {
      mockUseAutoAuth.mockReturnValue({
        address: '0x123',
        chainId: 137,
        isConnected: true,
      })

      const { getByText } = render(<DashboardScreen />)

      expect(getByText('0x123')).toBeTruthy()
    })

    it('should handle missing wallet address', () => {
      mockUseAutoAuth.mockReturnValue({
        address: null,
        chainId: 137,
        isConnected: false,
      })

      const { getByText } = render(<DashboardScreen />)

      expect(getByText('Not connected')).toBeTruthy()
      expect(getByText('Chain ID: 137')).toBeTruthy()
    })

    it('should handle missing chain ID', () => {
      mockUseAutoAuth.mockReturnValue({
        address: '0x123',
        chainId: null,
        isConnected: false,
      })

      const { getByText } = render(<DashboardScreen />)

      expect(getByText('0x123')).toBeTruthy()
      expect(getByText('Not connected')).toBeTruthy()
    })
  })

  describe('Accessibility', () => {
    it('should have proper accessibility labels', () => {
      const { getByTestId } = render(<DashboardScreen />)

      const welcomeTitle = getByTestId('welcome-title')
      expect(welcomeTitle.props.accessibilityRole).toBe('header')

      const userInfoTitle = getByTestId('user-info-title')
      expect(userInfoTitle.props.accessibilityRole).toBe('header')
    })

    it('should have accessible action buttons', () => {
      const { getByTestId } = render(<DashboardScreen />)

      const createPoolButton = getByTestId('create-pool-button')
      expect(createPoolButton.props.accessibilityRole).toBe('button')

      const joinPoolButton = getByTestId('join-pool-button')
      expect(joinPoolButton.props.accessibilityRole).toBe('button')

      const portfolioButton = getByTestId('portfolio-button')
      expect(portfolioButton.props.accessibilityRole).toBe('button')
    })
  })

  describe('Text selection', () => {
    it('should allow selecting wallet address', () => {
      const { getByTestId } = render(<DashboardScreen />)

      const walletAddressValue = getByTestId('wallet-address-value')
      expect(walletAddressValue.props.selectable).toBe(true)
    })
  })
})
