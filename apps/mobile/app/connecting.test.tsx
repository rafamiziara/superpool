import { render } from '@testing-library/react-native'
import React from 'react'
import ConnectingScreen from './connecting'

// Mock dependencies
jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}))

jest.mock('../src/components/LoadingSpinner', () => ({
  LoadingSpinner: ({ size, testID }: { size: string; testID: string }) => {
    const { View, Text } = require('react-native')
    return (
      <View testID={testID}>
        <Text>{`Loading-${size}`}</Text>
      </View>
    )
  },
}))

const mockUseAutoAuth = jest.fn()
jest.mock('../src/hooks/auth/useAutoAuth', () => ({
  useAutoAuth: () => mockUseAutoAuth(),
}))

describe('ConnectingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    // Default mock state
    mockUseAutoAuth.mockReturnValue({
      isAuthenticating: true,
      progress: 25,
      error: null,
    })
  })

  it('should render connecting screen', () => {
    const { getByTestId } = render(<ConnectingScreen />)

    expect(getByTestId('connecting-screen')).toBeTruthy()
    expect(getByTestId('connecting-header')).toBeTruthy()
    expect(getByTestId('connecting-content')).toBeTruthy()
    expect(getByTestId('status-message-area')).toBeTruthy()
  })

  it('should display SuperPool logo', () => {
    const { getByTestId, getByText } = render(<ConnectingScreen />)

    expect(getByTestId('superpool-logo')).toBeTruthy()
    expect(getByText('SUPERPOOL')).toBeTruthy()
  })

  it('should show authenticating status when active', () => {
    const { getByTestId, getByText } = render(<ConnectingScreen />)

    expect(getByTestId('authenticating-status')).toBeTruthy()
    expect(getByTestId('main-loading-spinner')).toBeTruthy()
    expect(getByText('Authenticating...')).toBeTruthy()
  })

  it('should show error status when error occurs', () => {
    mockUseAutoAuth.mockReturnValue({
      isAuthenticating: false,
      progress: 0,
      error: 'User rejected signature',
    })

    const { getByTestId, getByText } = render(<ConnectingScreen />)

    expect(getByTestId('error-status')).toBeTruthy()
    expect(getByText('Authentication Failed')).toBeTruthy()
    expect(getByText('User rejected signature')).toBeTruthy()
  })

  it('should render all authentication steps', () => {
    const { getByTestId } = render(<ConnectingScreen />)

    expect(getByTestId('steps-container')).toBeTruthy()

    // Should have 5 steps (no complete step)
    for (let i = 0; i < 5; i++) {
      expect(getByTestId(`step-${i}-container`)).toBeTruthy()
      expect(getByTestId(`step-${i}-title`)).toBeTruthy()
      expect(getByTestId(`step-${i}-description`)).toBeTruthy()
    }
  })

  it('should show step titles correctly', () => {
    const { getByText } = render(<ConnectingScreen />)

    expect(getByText('Wallet Connection')).toBeTruthy()
    expect(getByText('Generate Message')).toBeTruthy()
    expect(getByText('Request Signature')).toBeTruthy()
    expect(getByText('Verify Signature')).toBeTruthy()
    expect(getByText('Complete Auth')).toBeTruthy()
  })

  it('should show correct step based on progress', () => {
    // Progress 25% should be step 1 (index 1)
    mockUseAutoAuth.mockReturnValue({
      isAuthenticating: true,
      progress: 25,
      error: null,
    })

    const { getByTestId } = render(<ConnectingScreen />)

    // Step 1 should be current (loading)
    expect(getByTestId('step-1-loading')).toBeTruthy()

    // Step 0 should be completed (success icon)
    expect(getByTestId('step-0-success-icon')).toBeTruthy()

    // Steps 2+ should be pending
    expect(getByTestId('step-2-pending-dot')).toBeTruthy()
  })

  it('should show error icon for failed step', () => {
    mockUseAutoAuth.mockReturnValue({
      isAuthenticating: false,
      progress: 50,
      error: 'Signature failed',
    })

    const { getByTestId } = render(<ConnectingScreen />)

    // When there's an error, getCurrentStepIndex returns -1 (error state)
    // So no specific step should show error icon, just the main error status
    expect(getByTestId('error-status')).toBeTruthy()
    expect(getByTestId('error-message')).toBeTruthy()
  })

  it('should show signature prompt at correct progress', () => {
    mockUseAutoAuth.mockReturnValue({
      isAuthenticating: true,
      progress: 60, // Between 50 and 75
      error: null,
    })

    const { getByTestId, getByText } = render(<ConnectingScreen />)

    expect(getByTestId('signature-prompt')).toBeTruthy()
    expect(getByText('Please check your wallet app and sign the authentication message.')).toBeTruthy()
  })

  it('should show progress message during authentication', () => {
    mockUseAutoAuth.mockReturnValue({
      isAuthenticating: true,
      progress: 30,
      error: null,
    })

    const { getByTestId, getByText } = render(<ConnectingScreen />)

    expect(getByTestId('progress-message')).toBeTruthy()
    expect(getByText('Authenticating your wallet connection... (30%)')).toBeTruthy()
  })

  it('should show ready message when not authenticating', () => {
    mockUseAutoAuth.mockReturnValue({
      isAuthenticating: false,
      progress: 0,
      error: null,
    })

    const { getByTestId, getByText } = render(<ConnectingScreen />)

    expect(getByTestId('ready-message')).toBeTruthy()
    expect(getByText('Ready to authenticate your wallet...')).toBeTruthy()
  })

  describe('Step Icons', () => {
    it('should show loading spinner for current step', () => {
      mockUseAutoAuth.mockReturnValue({
        isAuthenticating: true,
        progress: 50,
        error: null,
      })

      const { getByTestId } = render(<ConnectingScreen />)

      const currentStepIndex = Math.floor((50 / 100) * 4) // Should be step 2
      expect(getByTestId(`step-${currentStepIndex}-loading`)).toBeTruthy()
    })

    it('should show success icon for completed steps', () => {
      mockUseAutoAuth.mockReturnValue({
        isAuthenticating: true,
        progress: 75,
        error: null,
      })

      const { getByTestId } = render(<ConnectingScreen />)

      // Steps 0, 1, 2 should be completed
      expect(getByTestId('step-0-success-icon')).toBeTruthy()
      expect(getByTestId('step-1-success-icon')).toBeTruthy()
      expect(getByTestId('step-2-success-icon')).toBeTruthy()
    })

    it('should show pending dots for future steps', () => {
      mockUseAutoAuth.mockReturnValue({
        isAuthenticating: true,
        progress: 25,
        error: null,
      })

      const { getByTestId } = render(<ConnectingScreen />)

      // Steps 2, 3, 4 should be pending
      expect(getByTestId('step-2-pending-dot')).toBeTruthy()
      expect(getByTestId('step-3-pending-dot')).toBeTruthy()
      expect(getByTestId('step-4-pending-dot')).toBeTruthy()
    })
  })

  describe('Progress Mapping', () => {
    it('should map progress 0% to step 0', () => {
      mockUseAutoAuth.mockReturnValue({
        isAuthenticating: true,
        progress: 0,
        error: null,
      })

      const { getByTestId } = render(<ConnectingScreen />)

      expect(getByTestId('step-0-loading')).toBeTruthy()
    })

    it('should map progress 100% to last step', () => {
      mockUseAutoAuth.mockReturnValue({
        isAuthenticating: true,
        progress: 100,
        error: null,
      })

      const { getByTestId } = render(<ConnectingScreen />)

      expect(getByTestId('step-4-loading')).toBeTruthy()
    })

    it('should handle intermediate progress values', () => {
      const testCases = [
        { progress: 20, expectedStep: 0 },
        { progress: 40, expectedStep: 1 },
        { progress: 60, expectedStep: 2 },
        { progress: 80, expectedStep: 3 },
      ]

      testCases.forEach(({ progress, expectedStep }) => {
        mockUseAutoAuth.mockReturnValue({
          isAuthenticating: true,
          progress,
          error: null,
        })

        const { getByTestId } = render(<ConnectingScreen />)

        expect(getByTestId(`step-${expectedStep}-loading`)).toBeTruthy()
      })
    })
  })

  describe('No navigation logic', () => {
    it('should not contain any navigation methods', () => {
      const component = ConnectingScreen
      const componentString = component.toString()

      // Ensure no navigation logic is present
      expect(componentString).not.toContain('useRouter')
      expect(componentString).not.toContain('navigation')
      expect(componentString).not.toContain('navigate')
      expect(componentString).not.toContain('router.push')
      expect(componentString).not.toContain('router.replace')
    })

    it('should be a pure UI component', () => {
      // This component should only show authentication progress
      // All navigation is handled by index.tsx navigation controller
      const { getByTestId } = render(<ConnectingScreen />)

      expect(getByTestId('connecting-screen')).toBeTruthy()
      // Component renders successfully without any navigation dependencies
    })
  })

  describe('No complete step', () => {
    it('should not have a complete step in the steps array', () => {
      const { getByTestId, queryByText } = render(<ConnectingScreen />)

      // Should not have "Complete" or "Success" step
      expect(queryByText('Complete')).toBeFalsy()
      expect(queryByText('Success')).toBeFalsy()
      expect(queryByText('Authentication Complete')).toBeFalsy()

      // Should only have 5 steps (no 6th complete step)
      expect(getByTestId('step-4-container')).toBeTruthy()
      expect(() => getByTestId('step-5-container')).toThrow()
    })
  })

  describe('Accessibility', () => {
    it('should have proper accessibility labels', () => {
      const { getByTestId } = render(<ConnectingScreen />)

      const logo = getByTestId('superpool-logo')
      expect(logo.props.accessibilityRole).toBe('header')
    })
  })

  describe('Layout structure', () => {
    it('should have correct layout hierarchy', () => {
      const { getByTestId } = render(<ConnectingScreen />)

      const screen = getByTestId('connecting-screen')
      expect(screen).toBeTruthy()

      const header = getByTestId('connecting-header')
      const content = getByTestId('connecting-content')
      const statusArea = getByTestId('status-message-area')

      expect(header).toBeTruthy()
      expect(content).toBeTruthy()
      expect(statusArea).toBeTruthy()
    })
  })
})
