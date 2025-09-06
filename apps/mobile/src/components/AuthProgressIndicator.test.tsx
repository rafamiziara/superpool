import { createMockRootStore, renderWithStore, waitForMobX } from '@mocks/factories/testFactory'
import { AuthStep } from '@superpool/types'
import { act } from '@testing-library/react-native'
import { observable } from 'mobx'
import React from 'react'
import { AuthProgressIndicator } from './AuthProgressIndicator'

describe('AuthProgressIndicator', () => {
  describe('Basic Rendering', () => {
    it('should render with default store state', async () => {
      const { getByTestId } = renderWithStore(<AuthProgressIndicator />)

      const container = getByTestId('auth-progress-indicator')
      expect(container).toBeTruthy()

      const progressStats = getByTestId('progress-stats')
      expect(progressStats).toBeTruthy()
    })

    it('should render null when no steps are available', async () => {
      const mockStore = createMockRootStore()
      // Override the getAllSteps method to return an empty array
      mockStore.authenticationStore.getAllSteps = jest.fn().mockReturnValue([])

      const { queryByTestId } = renderWithStore(<AuthProgressIndicator />, { store: mockStore })

      const container = queryByTestId('auth-progress-indicator')
      expect(container).toBeNull()
    })
  })

  describe('MobX Store Integration', () => {
    it('should display current step information', async () => {
      const mockStore = createMockRootStore()
      // Set up the store to have a current step with info
      mockStore.authenticationStore.currentStep = 'generate-message'
      mockStore.authenticationStore.getStepInfo = jest.fn().mockImplementation((step: AuthStep) => {
        if (step === 'generate-message') {
          return {
            title: 'Generate Auth Message',
            description: 'Creating authentication challenge',
          }
        }
        return null
      })

      const { getByTestId } = renderWithStore(<AuthProgressIndicator />, { store: mockStore })

      await waitForMobX()

      const currentStepTitle = getByTestId('current-step-title')
      expect(currentStepTitle.props.children).toBe('Generate Auth Message')

      const currentStepDescription = getByTestId('current-step-description')
      expect(currentStepDescription.props.children).toBe('Creating authentication challenge')
    })

    it('should not display step info when no current step', async () => {
      const mockStore = createMockRootStore({
        auth: {
          getAllSteps: jest.fn().mockReturnValue(['connect-wallet']),
          getCurrentStepInfo: jest.fn().mockReturnValue(null),
          isProgressComplete: false,
          progressError: null,
          getCompletedStepsCount: jest.fn().mockReturnValue(0),
        },
      })

      const { queryByTestId } = renderWithStore(<AuthProgressIndicator />, { store: mockStore })

      await waitForMobX()

      const currentStepTitle = queryByTestId('current-step-title')
      expect(currentStepTitle).toBeNull()

      const currentStepDescription = queryByTestId('current-step-description')
      expect(currentStepDescription).toBeNull()
    })

    it('should display progress error when available', async () => {
      const errorMessage = 'Signature verification failed'
      const mockStore = createMockRootStore({
        auth: {
          getAllSteps: jest.fn().mockReturnValue(['connect-wallet', 'verify-signature']),
          getCurrentStepInfo: jest.fn().mockReturnValue(null),
          isProgressComplete: false,
          progressError: errorMessage,
          getCompletedStepsCount: jest.fn().mockReturnValue(1),
        },
      })

      const { getByTestId } = renderWithStore(<AuthProgressIndicator />, { store: mockStore })

      await waitForMobX()

      const progressError = getByTestId('progress-error')
      expect(progressError.props.children).toBe(errorMessage)
    })

    it('should not display error when no progress error', async () => {
      const mockStore = createMockRootStore({
        auth: {
          getAllSteps: jest.fn().mockReturnValue(['connect-wallet']),
          getCurrentStepInfo: jest.fn().mockReturnValue(null),
          isProgressComplete: false,
          progressError: null,
          getCompletedStepsCount: jest.fn().mockReturnValue(0),
        },
      })

      const { queryByTestId } = renderWithStore(<AuthProgressIndicator />, { store: mockStore })

      await waitForMobX()

      const progressError = queryByTestId('progress-error')
      expect(progressError).toBeNull()
    })
  })

  describe('Reactive Updates', () => {
    it('should update when store state changes', async () => {
      const mockStore = createMockRootStore()
      // Start with one completed step
      mockStore.authenticationStore.completedSteps = observable(new Set<AuthStep>(['connect-wallet']))
      mockStore.authenticationStore.currentStep = null

      mockStore.authenticationStore.getStepInfo = jest.fn().mockImplementation((step: AuthStep) => {
        if (step === 'generate-message') {
          return {
            title: 'Generate Auth Message',
            description: 'Creating authentication challenge',
          }
        }
        return null
      })

      const { getByTestId } = renderWithStore(<AuthProgressIndicator />, { store: mockStore })

      let progressStats = getByTestId('progress-stats')
      expect(progressStats.props.children).toEqual([1, ' of ', 5, ' completed'])

      // Update completed count and current step
      act(() => {
        mockStore.authenticationStore.completedSteps.add('generate-message')
        mockStore.authenticationStore.currentStep = 'generate-message'
      })

      await waitForMobX()

      const currentStepTitle = getByTestId('current-step-title')
      expect(currentStepTitle.props.children).toBe('Generate Auth Message')

      // Complete the step
      act(() => {
        mockStore.authenticationStore.completedSteps.add('request-signature')
        mockStore.authenticationStore.currentStep = null
      })

      await waitForMobX()

      progressStats = getByTestId('progress-stats')
      expect(progressStats.props.children).toEqual([3, ' of ', 5, ' completed'])
    })

    it('should update progress indicator when currentStep changes', async () => {
      const mockStore = createMockRootStore()
      mockStore.authenticationStore.currentStep = 'generate-message'
      mockStore.authenticationStore.getStepInfo = jest.fn().mockImplementation((step: AuthStep) => {
        if (step === 'generate-message') {
          return {
            title: 'Generate Auth Message',
            description: 'Creating authentication challenge',
          }
        }
        if (step === 'request-signature') {
          return {
            title: 'Request Signature',
            description: 'Requesting wallet signature',
          }
        }
        return null
      })

      const { getByTestId } = renderWithStore(<AuthProgressIndicator />, { store: mockStore })

      await waitForMobX()

      let currentStepTitle = getByTestId('current-step-title')
      expect(currentStepTitle.props.children).toBe('Generate Auth Message')

      // Move to next step
      act(() => {
        mockStore.authenticationStore.currentStep = 'request-signature'
      })

      await waitForMobX()

      currentStepTitle = getByTestId('current-step-title')
      expect(currentStepTitle.props.children).toBe('Request Signature')
    })

    it('should show completion status when progress is complete', async () => {
      const mockStore = createMockRootStore()
      mockStore.authenticationStore.getAllSteps = jest.fn().mockReturnValue([
        { step: 'connect-wallet', title: 'Connect Wallet', description: 'Connect your wallet to continue' },
        { step: 'generate-message', title: 'Generate Message', description: 'Generate authentication message' },
      ])
      mockStore.authenticationStore.completedSteps = observable(new Set<AuthStep>(['connect-wallet']))
      mockStore.authenticationStore.isProgressComplete = false
      mockStore.authenticationStore.currentStep = null

      const { getByTestId, queryByTestId } = renderWithStore(<AuthProgressIndicator />, { store: mockStore })

      await waitForMobX()

      // Initially not complete
      let progressComplete = queryByTestId('progress-complete')
      expect(progressComplete).toBeNull()

      // Complete all steps
      act(() => {
        mockStore.authenticationStore.isProgressComplete = true
        mockStore.authenticationStore.completedSteps.add('generate-message')
      })

      await waitForMobX()

      progressComplete = getByTestId('progress-complete')
      expect(progressComplete.props.children).toBe('✓ Complete')
    })
  })

  describe('Progress Statistics', () => {
    it('should display correct completed steps count', async () => {
      const mockStore = createMockRootStore()
      mockStore.authenticationStore.getAllSteps = jest.fn().mockReturnValue([
        { step: 'connect-wallet', title: 'Connect Wallet', description: 'Connect your wallet to continue' },
        { step: 'generate-message', title: 'Generate Message', description: 'Generate authentication message' },
        { step: 'request-signature', title: 'Request Signature', description: 'Sign message in your wallet app' },
        { step: 'verify-signature', title: 'Verify Signature', description: 'Verifying your signature' },
      ])
      mockStore.authenticationStore.completedSteps = observable(
        new Set<AuthStep>(['connect-wallet', 'generate-message', 'request-signature'])
      )
      mockStore.authenticationStore.currentStep = null

      const { getByTestId } = renderWithStore(<AuthProgressIndicator />, { store: mockStore })

      await waitForMobX()

      const progressStats = getByTestId('progress-stats')
      expect(progressStats.props.children).toEqual([3, ' of ', 4, ' completed'])
    })

    it('should handle edge case with all steps completed', async () => {
      const allSteps: AuthStep[] = [
        'connect-wallet',
        'acquire-lock',
        'generate-message',
        'request-signature',
        'verify-signature',
        'firebase-auth',
      ]

      const mockStore = createMockRootStore()
      mockStore.authenticationStore.getAllSteps = jest.fn().mockReturnValue(
        allSteps.map((step) => ({
          step,
          title: step.replace('-', ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
          description: `${step} description`,
        }))
      )
      mockStore.authenticationStore.completedSteps = observable(new Set(allSteps))
      mockStore.authenticationStore.isProgressComplete = true
      mockStore.authenticationStore.currentStep = null

      const { getByTestId } = renderWithStore(<AuthProgressIndicator />, { store: mockStore })

      await waitForMobX()

      const progressStats = getByTestId('progress-stats')
      expect(progressStats.props.children).toEqual([6, ' of ', 6, ' completed'])

      const progressComplete = getByTestId('progress-complete')
      expect(progressComplete).toBeTruthy()
    })
  })

  describe('Error Handling', () => {
    it('should handle store errors gracefully', async () => {
      const errorMessage = 'Network error occurred'
      const mockStore = createMockRootStore({
        auth: {
          getAllSteps: jest.fn().mockReturnValue(['connect-wallet', 'verify-signature']),
          getCurrentStepInfo: jest.fn().mockReturnValue(null),
          isProgressComplete: false,
          progressError: errorMessage,
          getCompletedStepsCount: jest.fn().mockReturnValue(1),
        },
      })

      const { getByTestId } = renderWithStore(<AuthProgressIndicator />, { store: mockStore })

      await waitForMobX()

      const progressError = getByTestId('progress-error')
      expect(progressError.props.children).toBe(errorMessage)

      // Should still show progress stats
      const progressStats = getByTestId('progress-stats')
      expect(progressStats).toBeTruthy()
    })

    it('should handle missing step info gracefully', async () => {
      const mockStore = createMockRootStore()
      mockStore.authenticationStore.currentStep = 'generate-message'
      mockStore.authenticationStore.getStepInfo = jest.fn().mockImplementation((step: AuthStep) => {
        if (step === 'generate-message') {
          return {
            title: undefined,
            description: undefined,
          }
        }
        return null
      })

      const { getByTestId } = renderWithStore(<AuthProgressIndicator />, { store: mockStore })

      await waitForMobX()

      // Should not crash, and display empty/undefined step info
      const currentStepTitle = getByTestId('current-step-title')
      expect(currentStepTitle.props.children).toBeUndefined()
    })
  })

  describe('Custom Styling', () => {
    it('should apply custom className', () => {
      const customClassName = 'p-4 bg-gray-100'
      const { getByTestId } = renderWithStore(<AuthProgressIndicator className={customClassName} />)

      const container = getByTestId('auth-progress-indicator')
      expect(container.props.className).toContain('space-y-4')
      expect(container.props.className).toContain(customClassName)
    })

    it('should render with default className when none provided', () => {
      const { getByTestId } = renderWithStore(<AuthProgressIndicator />)

      const container = getByTestId('auth-progress-indicator')
      expect(container.props.className).toBe('space-y-4 ')
    })
  })
})
