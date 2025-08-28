import { AuthStep } from '@superpool/types'
import { act } from '@testing-library/react-native'
import React from 'react'
import { mockStorePresets, renderWithStore, waitForMobX } from '../test-utils'
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
      const mockStore = mockStorePresets.unauthenticated()
      // Mock empty steps array
      mockStore.authenticationStore.getAllSteps = () => []

      const { queryByTestId } = renderWithStore(<AuthProgressIndicator />, { store: mockStore })

      const container = queryByTestId('auth-progress-indicator')
      expect(container).toBeNull()
    })
  })

  describe('MobX Store Integration', () => {
    it('should display current step information', async () => {
      const mockStore = mockStorePresets.authenticating()
      mockStore.authenticationStore.startStep('generate-message')

      const { getByTestId } = renderWithStore(<AuthProgressIndicator />, { store: mockStore })

      await waitForMobX()

      const currentStepTitle = getByTestId('current-step-title')
      expect(currentStepTitle.props.children).toBe('Generate Auth Message')

      const currentStepDescription = getByTestId('current-step-description')
      expect(currentStepDescription.props.children).toBe('Creating authentication challenge')
    })

    it('should not display step info when no current step', async () => {
      const mockStore = mockStorePresets.unauthenticated()

      const { queryByTestId } = renderWithStore(<AuthProgressIndicator />, { store: mockStore })

      await waitForMobX()

      const currentStepTitle = queryByTestId('current-step-title')
      expect(currentStepTitle).toBeNull()

      const currentStepDescription = queryByTestId('current-step-description')
      expect(currentStepDescription).toBeNull()
    })

    it('should display progress error when available', async () => {
      const mockStore = mockStorePresets.authenticationError()
      mockStore.authenticationStore.failStep('verify-signature', 'Signature verification failed')

      const { getByTestId } = renderWithStore(<AuthProgressIndicator />, { store: mockStore })

      await waitForMobX()

      const progressError = getByTestId('progress-error')
      expect(progressError.props.children).toBe('Signature verification failed')
    })

    it('should not display error when no progress error', async () => {
      const mockStore = mockStorePresets.unauthenticated()

      const { queryByTestId } = renderWithStore(<AuthProgressIndicator />, { store: mockStore })

      await waitForMobX()

      const progressError = queryByTestId('progress-error')
      expect(progressError).toBeNull()
    })
  })

  describe('Reactive Updates', () => {
    it('should update when store state changes', async () => {
      const mockStore = mockStorePresets.authenticating()

      const { getByTestId } = renderWithStore(<AuthProgressIndicator />, { store: mockStore })

      // Initially no current step
      let progressStats = getByTestId('progress-stats')
      expect(progressStats.props.children).toEqual([0, ' of ', 6, ' completed']) // No steps completed initially

      // Start a step
      act(() => {
        mockStore.authenticationStore.startStep('generate-message')
      })

      await waitForMobX()

      const currentStepTitle = getByTestId('current-step-title')
      expect(currentStepTitle.props.children).toBe('Generate Auth Message')

      // Complete the step
      act(() => {
        mockStore.authenticationStore.completeStep('generate-message')
      })

      await waitForMobX()

      progressStats = getByTestId('progress-stats')
      expect(progressStats.props.children).toEqual([1, ' of ', 6, ' completed']) // generate-message completed
    })

    it('should update progress indicator when currentStep changes', async () => {
      const mockStore = mockStorePresets.authenticating()

      const { getByTestId } = renderWithStore(<AuthProgressIndicator />, { store: mockStore })

      await waitForMobX()

      // Start first step
      act(() => {
        mockStore.authenticationStore.startStep('generate-message')
      })

      await waitForMobX()

      let currentStepTitle = getByTestId('current-step-title')
      expect(currentStepTitle.props.children).toBe('Generate Auth Message')

      // Move to next step
      act(() => {
        mockStore.authenticationStore.completeStep('generate-message')
        mockStore.authenticationStore.startStep('request-signature')
      })

      await waitForMobX()

      currentStepTitle = getByTestId('current-step-title')
      expect(currentStepTitle.props.children).toBe('Request Signature')
    })

    it('should show completion status when progress is complete', async () => {
      const mockStore = mockStorePresets.authenticating()

      const { getByTestId, queryByTestId } = renderWithStore(<AuthProgressIndicator />, { store: mockStore })

      await waitForMobX()

      // Initially not complete
      let progressComplete = queryByTestId('progress-complete')
      expect(progressComplete).toBeNull()

      // Complete all steps
      act(() => {
        mockStore.authenticationStore.completeStep('firebase-auth') // This triggers isProgressComplete
      })

      await waitForMobX()

      progressComplete = getByTestId('progress-complete')
      expect(progressComplete.props.children).toBe('✓ Complete')
    })
  })

  describe('Progress Statistics', () => {
    it('should display correct completed steps count', async () => {
      const mockStore = mockStorePresets.authenticating()

      // Complete multiple steps
      act(() => {
        mockStore.authenticationStore.completeStep('generate-message')
        mockStore.authenticationStore.completeStep('request-signature')
      })

      const { getByTestId } = renderWithStore(<AuthProgressIndicator />, { store: mockStore })

      await waitForMobX()

      const progressStats = getByTestId('progress-stats')
      expect(progressStats.props.children).toEqual([2, ' of ', 6, ' completed']) // 2 steps completed
    })

    it('should handle edge case with all steps completed', async () => {
      const mockStore = mockStorePresets.authenticating()

      // Complete all steps
      const allSteps: AuthStep[] = [
        'connect-wallet',
        'acquire-lock',
        'generate-message',
        'request-signature',
        'verify-signature',
        'firebase-auth',
      ]
      act(() => {
        allSteps.forEach((step) => mockStore.authenticationStore.completeStep(step))
      })

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
      const mockStore = mockStorePresets.authenticationError()

      // Mock a step failure
      act(() => {
        mockStore.authenticationStore.startStep('verify-signature')
        mockStore.authenticationStore.failStep('verify-signature', 'Network error occurred')
      })

      const { getByTestId } = renderWithStore(<AuthProgressIndicator />, { store: mockStore })

      await waitForMobX()

      const progressError = getByTestId('progress-error')
      expect(progressError.props.children).toBe('Network error occurred')

      // Should still show progress stats
      const progressStats = getByTestId('progress-stats')
      expect(progressStats).toBeTruthy()
    })

    it('should handle missing step info gracefully', async () => {
      const mockStore = mockStorePresets.authenticating()

      // Mock invalid current step
      act(() => {
        // @ts-expect-error - Testing invalid step name
        mockStore.authenticationStore.currentStep = 'invalid-step'
      })

      const { getByTestId } = renderWithStore(<AuthProgressIndicator />, { store: mockStore })

      await waitForMobX()

      // Should not crash, and display empty/undefined step info
      const currentStepTitle = getByTestId('current-step-title')
      expect(currentStepTitle.props.children).toBeUndefined() // getStepInfo returns undefined for invalid step
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

  describe('Snapshot Testing', () => {
    it('should match snapshot with default state', async () => {
      const component = renderWithStore(<AuthProgressIndicator />)
      await waitForMobX()
      expect(component.toJSON()).toMatchSnapshot()
    })

    it('should match snapshot with active step', async () => {
      const mockStore = mockStorePresets.authenticating()
      act(() => {
        mockStore.authenticationStore.startStep('generate-message')
      })

      const component = renderWithStore(<AuthProgressIndicator />, { store: mockStore })
      await waitForMobX()
      expect(component.toJSON()).toMatchSnapshot()
    })

    it('should match snapshot with error state', async () => {
      const mockStore = mockStorePresets.authenticationError()
      act(() => {
        mockStore.authenticationStore.failStep('verify-signature', 'Authentication failed')
      })

      const component = renderWithStore(<AuthProgressIndicator />, { store: mockStore })
      await waitForMobX()
      expect(component.toJSON()).toMatchSnapshot()
    })

    it('should match snapshot with completed state', async () => {
      const mockStore = mockStorePresets.authenticating()
      act(() => {
        mockStore.authenticationStore.completeStep('firebase-auth') // Triggers completion
      })

      const component = renderWithStore(<AuthProgressIndicator />, { store: mockStore })
      await waitForMobX()
      expect(component.toJSON()).toMatchSnapshot()
    })
  })
})
