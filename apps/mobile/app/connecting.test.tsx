import { act, render } from '@testing-library/react-native'
import React from 'react'
import ConnectingScreen from './connecting'

// Mock dependencies - only external ones with side effects
jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}))

// Mock AppKit to avoid ES module issues
jest.mock('@reown/appkit-wagmi-react-native', () => ({
  AppKitButton: () => null,
}))

// Mock useAutoAuth to prevent side effects (Firebase calls, wallet interactions)
jest.mock('../src/hooks/auth/useAutoAuth', () => ({
  useAutoAuth: jest.fn(),
}))

// Import real AuthStore - zero-mock approach
import { authStore } from '../src/stores/AuthStore'

describe('ConnectingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    // Reset AuthStore to default test state
    act(() => {
      authStore.reset()
      authStore.acquireAuthLock('0x1234567890abcdef')
      authStore.startStep('generate-message')
      authStore.completeStep('connect-wallet')
    })
  })

  afterEach(() => {
    // Clean up AuthStore after each test
    act(() => {
      authStore.reset()
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
    act(() => {
      authStore.reset()
      authStore.failStep('request-signature', 'User rejected signature')
    })

    const { getByTestId, getByText } = render(<ConnectingScreen />)

    expect(getByTestId('error-status')).toBeTruthy()
    expect(getByText('Authentication Failed')).toBeTruthy()
    expect(getByText('User rejected signature')).toBeTruthy()
  })

  it('should render all authentication steps', () => {
    const { getByTestId } = render(<ConnectingScreen />)

    expect(getByTestId('steps-container')).toBeTruthy()

    // Should have 6 steps
    for (let i = 0; i < 6; i++) {
      expect(getByTestId(`step-${i}-container`)).toBeTruthy()
      expect(getByTestId(`step-${i}-title`)).toBeTruthy()
      expect(getByTestId(`step-${i}-description`)).toBeTruthy()
    }
  })

  it('should show step titles correctly', () => {
    const { getByText } = render(<ConnectingScreen />)

    expect(getByText('Wallet Connection')).toBeTruthy()
    expect(getByText('Secure Process')).toBeTruthy()
    expect(getByText('Generate Message')).toBeTruthy()
    expect(getByText('Request Signature')).toBeTruthy()
    expect(getByText('Verify Signature')).toBeTruthy()
    expect(getByText('Complete Auth')).toBeTruthy()
  })

  it('should show correct step based on progress', () => {
    // Set up store with specific progress state
    act(() => {
      authStore.reset()
      authStore.acquireAuthLock('0x1234567890abcdef')
      authStore.completeStep('connect-wallet')
      authStore.startStep('generate-message')
    })

    const { getByTestId } = render(<ConnectingScreen />)

    // Step 2 should be current (loading) - generate-message
    expect(getByTestId('step-2-loading')).toBeTruthy()

    // Step 0 should be completed (success icon) - connect-wallet
    expect(getByTestId('step-0-success-icon')).toBeTruthy()

    // Steps 1, 3+ should be pending
    expect(getByTestId('step-1-pending-dot')).toBeTruthy()
    expect(getByTestId('step-3-pending-dot')).toBeTruthy()
  })

  it('should show error icon for failed step', () => {
    act(() => {
      authStore.reset()
      authStore.failStep('request-signature', 'Signature failed')
    })

    const { getByTestId } = render(<ConnectingScreen />)

    // When there's an error, the main error status should show
    expect(getByTestId('error-status')).toBeTruthy()
    expect(getByTestId('error-message')).toBeTruthy()
  })

  it('should show signature prompt at correct progress', () => {
    act(() => {
      authStore.reset()
      authStore.acquireAuthLock('0x1234567890abcdef')
      authStore.startStep('request-signature')
    })

    const { getByTestId, getByText } = render(<ConnectingScreen />)

    expect(getByTestId('signature-prompt')).toBeTruthy()
    expect(getByText('Please check your wallet app and sign the authentication message.')).toBeTruthy()
  })

  it('should show progress message during authentication', () => {
    act(() => {
      authStore.reset()
      authStore.acquireAuthLock('0x1234567890abcdef')
      authStore.completeStep('connect-wallet')
      authStore.startStep('generate-message')
    })

    const { getByTestId, getByText } = render(<ConnectingScreen />)

    expect(getByTestId('progress-message')).toBeTruthy()
    // Progress is computed based on completed steps, should be around 16% (1/6 steps)
    expect(getByText(/Authenticating your wallet connection\.\.\. \(\d+%\)/)).toBeTruthy()
  })

  it('should show empty status when not authenticating', () => {
    act(() => {
      authStore.reset() // This should put store in non-authenticating state
    })

    const { queryByTestId } = render(<ConnectingScreen />)

    // Should not show ready message or progress message when not authenticating
    expect(queryByTestId('ready-message')).toBeFalsy()
    expect(queryByTestId('progress-message')).toBeFalsy()
    expect(queryByTestId('signature-prompt')).toBeFalsy()
  })

  describe('Step Icons', () => {
    it('should show loading spinner for current step', () => {
      act(() => {
        authStore.reset()
        authStore.acquireAuthLock('0x1234567890abcdef')
        authStore.completeStep('connect-wallet')
        authStore.completeStep('acquire-lock')
        authStore.startStep('generate-message')
      })

      const { getByTestId } = render(<ConnectingScreen />)

      // Step 2 (generate-message) should show loading spinner
      expect(getByTestId('step-2-loading')).toBeTruthy()
    })

    it('should show success icon for completed steps', () => {
      act(() => {
        authStore.reset()
        authStore.acquireAuthLock('0x1234567890abcdef')
        authStore.completeStep('connect-wallet')
        authStore.completeStep('acquire-lock')
        authStore.completeStep('generate-message')
        authStore.startStep('request-signature')
      })

      const { getByTestId } = render(<ConnectingScreen />)

      // Steps 0, 1, 2 should be completed
      expect(getByTestId('step-0-success-icon')).toBeTruthy()
      expect(getByTestId('step-1-success-icon')).toBeTruthy()
      expect(getByTestId('step-2-success-icon')).toBeTruthy()
    })

    it('should show pending dots for future steps', () => {
      act(() => {
        authStore.reset()
        authStore.acquireAuthLock('0x1234567890abcdef')
        authStore.completeStep('connect-wallet')
        authStore.startStep('acquire-lock')
      })

      const { getByTestId } = render(<ConnectingScreen />)

      // Steps 2, 3, 4, 5 should be pending (future steps)
      expect(getByTestId('step-2-pending-dot')).toBeTruthy()
      expect(getByTestId('step-3-pending-dot')).toBeTruthy()
      expect(getByTestId('step-4-pending-dot')).toBeTruthy()
      expect(getByTestId('step-5-pending-dot')).toBeTruthy()
    })
  })

  describe('Progress Mapping', () => {
    it('should map progress 0% to step 0', () => {
      act(() => {
        authStore.reset()
        authStore.acquireAuthLock('0x1234567890abcdef')
        authStore.startStep('connect-wallet')
      })

      const { getByTestId } = render(<ConnectingScreen />)

      expect(getByTestId('step-0-loading')).toBeTruthy()
    })

    it('should map progress 100% to last step', () => {
      act(() => {
        authStore.reset()
        authStore.acquireAuthLock('0x1234567890abcdef')
        // Complete all steps except last
        authStore.completeStep('connect-wallet')
        authStore.completeStep('acquire-lock')
        authStore.completeStep('generate-message')
        authStore.completeStep('request-signature')
        authStore.completeStep('verify-signature')
        authStore.startStep('firebase-auth')
      })

      const { getByTestId } = render(<ConnectingScreen />)

      expect(getByTestId('step-5-loading')).toBeTruthy()
    })

    it('should handle intermediate progress values', () => {
      const testCases = [
        { stepName: 'connect-wallet', expectedStep: 0 },
        { stepName: 'acquire-lock', expectedStep: 1 },
        { stepName: 'generate-message', expectedStep: 2 },
        { stepName: 'request-signature', expectedStep: 3 },
        { stepName: 'verify-signature', expectedStep: 4 },
        { stepName: 'firebase-auth', expectedStep: 5 },
      ]

      testCases.forEach(({ stepName, expectedStep }) => {
        act(() => {
          authStore.reset()
          authStore.acquireAuthLock('0x1234567890abcdef')
          authStore.startStep(
            stepName as 'connect-wallet' | 'acquire-lock' | 'generate-message' | 'request-signature' | 'verify-signature' | 'firebase-auth'
          )
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

      // Should only have 6 steps (no 7th complete step)
      expect(getByTestId('step-5-container')).toBeTruthy()
      expect(() => getByTestId('step-6-container')).toThrow()
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
