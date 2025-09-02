import { AuthStep } from '@superpool/types'
import { act } from '@testing-library/react-native'
import React from 'react'
import { createMockRootStore, renderWithStore, waitForMobX } from '@mocks/factories/testFactory'
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
      const mockStore = createMockRootStore({
        auth: {
          getAllSteps: jest.fn().mockReturnValue([]),
          getCurrentStepInfo: jest.fn().mockReturnValue(null),
          isProgressComplete: false,
          progressError: null,
          getCompletedStepsCount: jest.fn().mockReturnValue(0),
        },
      })

      const { queryByTestId } = renderWithStore(<AuthProgressIndicator />, { store: mockStore })

      const container = queryByTestId('auth-progress-indicator')
      expect(container).toBeNull()
    })
  })

  describe('MobX Store Integration', () => {
    it('should display current step information', async () => {
      const mockStore = createMockRootStore({
        auth: {
          getAllSteps: jest.fn().mockReturnValue(['connect-wallet', 'generate-message', 'request-signature']),
          getCurrentStepInfo: jest.fn().mockReturnValue({
            title: 'Generate Auth Message',
            description: 'Creating authentication challenge',
          }),
          isProgressComplete: false,
          progressError: null,
          getCompletedStepsCount: jest.fn().mockReturnValue(1),
        },
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
      let completedCount = 1
      const mockStore = createMockRootStore({
        auth: {
          getAllSteps: jest
            .fn()
            .mockReturnValue(['connect-wallet', 'generate-message', 'request-signature', 'verify-signature', 'firebase-auth']),
          getCurrentStepInfo: jest.fn().mockReturnValue(null),
          isProgressComplete: false,
          progressError: null,
          getCompletedStepsCount: jest.fn().mockImplementation(() => completedCount),
        },
      })

      const { getByTestId } = renderWithStore(<AuthProgressIndicator />, { store: mockStore })

      let progressStats = getByTestId('progress-stats')
      expect(progressStats.props.children).toEqual([1, ' of ', 5, ' completed'])

      // Update completed count and getCurrentStepInfo
      act(() => {
        completedCount = 2
        mockStore.auth.getCurrentStepInfo.mockReturnValue({
          title: 'Generate Auth Message',
          description: 'Creating authentication challenge',
        })
      })

      await waitForMobX()

      const currentStepTitle = getByTestId('current-step-title')
      expect(currentStepTitle.props.children).toBe('Generate Auth Message')

      // Complete the step
      act(() => {
        completedCount = 3
        mockStore.auth.getCurrentStepInfo.mockReturnValue(null)
      })

      await waitForMobX()

      progressStats = getByTestId('progress-stats')
      expect(progressStats.props.children).toEqual([3, ' of ', 5, ' completed'])
    })

    it('should update progress indicator when currentStep changes', async () => {
      const mockStore = createMockRootStore({
        auth: {
          getAllSteps: jest.fn().mockReturnValue(['connect-wallet', 'generate-message', 'request-signature']),
          getCurrentStepInfo: jest.fn().mockReturnValue({
            title: 'Generate Auth Message',
            description: 'Creating authentication challenge',
          }),
          isProgressComplete: false,
          progressError: null,
          getCompletedStepsCount: jest.fn().mockReturnValue(1),
        },
      })

      const { getByTestId } = renderWithStore(<AuthProgressIndicator />, { store: mockStore })

      await waitForMobX()

      let currentStepTitle = getByTestId('current-step-title')
      expect(currentStepTitle.props.children).toBe('Generate Auth Message')

      // Move to next step
      act(() => {
        mockStore.auth.getCurrentStepInfo.mockReturnValue({
          title: 'Request Signature',
          description: 'Requesting wallet signature',
        })
      })

      await waitForMobX()

      currentStepTitle = getByTestId('current-step-title')
      expect(currentStepTitle.props.children).toBe('Request Signature')
    })

    it('should show completion status when progress is complete', async () => {
      const mockStore = createMockRootStore({
        auth: {
          getAllSteps: jest.fn().mockReturnValue(['connect-wallet', 'generate-message']),
          getCurrentStepInfo: jest.fn().mockReturnValue(null),
          isProgressComplete: false,
          progressError: null,
          getCompletedStepsCount: jest.fn().mockReturnValue(1),
        },
      })

      const { getByTestId, queryByTestId } = renderWithStore(<AuthProgressIndicator />, { store: mockStore })

      await waitForMobX()

      // Initially not complete
      let progressComplete = queryByTestId('progress-complete')
      expect(progressComplete).toBeNull()

      // Complete all steps
      act(() => {
        mockStore.auth.isProgressComplete = true
        mockStore.auth.getCompletedStepsCount.mockReturnValue(2)
      })

      await waitForMobX()

      progressComplete = getByTestId('progress-complete')
      expect(progressComplete.props.children).toBe('✓ Complete')
    })
  })

  describe('Progress Statistics', () => {
    it('should display correct completed steps count', async () => {
      const mockStore = createMockRootStore({
        auth: {
          getAllSteps: jest.fn().mockReturnValue(['connect-wallet', 'generate-message', 'request-signature', 'verify-signature']),
          getCurrentStepInfo: jest.fn().mockReturnValue(null),
          isProgressComplete: false,
          progressError: null,
          getCompletedStepsCount: jest.fn().mockReturnValue(3),
        },
      })

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

      const mockStore = createMockRootStore({
        auth: {
          getAllSteps: jest.fn().mockReturnValue(allSteps),
          getCurrentStepInfo: jest.fn().mockReturnValue(null),
          isProgressComplete: true,
          progressError: null,
          getCompletedStepsCount: jest.fn().mockReturnValue(6),
        },
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
      const mockStore = createMockRootStore({
        auth: {
          getAllSteps: jest.fn().mockReturnValue(['connect-wallet', 'generate-message']),
          getCurrentStepInfo: jest.fn().mockReturnValue({
            title: undefined,
            description: undefined,
          }),
          isProgressComplete: false,
          progressError: null,
          getCompletedStepsCount: jest.fn().mockReturnValue(1),
        },
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
