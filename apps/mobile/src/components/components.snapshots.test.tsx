import React from 'react'
import { mockStorePresets, render, renderWithStore } from '../test-utils'
import { AuthProgressIndicator } from './AuthProgressIndicator'
import { LoadingSpinner } from './LoadingSpinner'
import { ProgressIndicator } from './ProgressIndicator'

describe('Component Snapshots', () => {
  describe('LoadingSpinner Snapshots', () => {
    it('should match snapshot with default props', () => {
      const component = render(<LoadingSpinner />)
      expect(component.toJSON()).toMatchSnapshot('LoadingSpinner-default')
    })

    it('should match snapshot with small size', () => {
      const component = render(<LoadingSpinner size="small" />)
      expect(component.toJSON()).toMatchSnapshot('LoadingSpinner-small')
    })

    it('should match snapshot with custom color and className', () => {
      const component = render(<LoadingSpinner size="large" color="#ff6b6b" className="p-8 bg-gray-50" />)
      expect(component.toJSON()).toMatchSnapshot('LoadingSpinner-custom')
    })
  })

  describe('ProgressIndicator Snapshots', () => {
    it('should match snapshot with basic progress', () => {
      const component = render(<ProgressIndicator totalSteps={5} currentStep={2} />)
      expect(component.toJSON()).toMatchSnapshot('ProgressIndicator-basic')
    })

    it('should match snapshot with first step active', () => {
      const component = render(<ProgressIndicator totalSteps={4} currentStep={0} />)
      expect(component.toJSON()).toMatchSnapshot('ProgressIndicator-first-step')
    })

    it('should match snapshot with last step active', () => {
      const component = render(<ProgressIndicator totalSteps={3} currentStep={2} />)
      expect(component.toJSON()).toMatchSnapshot('ProgressIndicator-last-step')
    })

    it('should match snapshot with single step', () => {
      const component = render(<ProgressIndicator totalSteps={1} currentStep={0} />)
      expect(component.toJSON()).toMatchSnapshot('ProgressIndicator-single-step')
    })

    it('should match snapshot with custom className', () => {
      const component = render(<ProgressIndicator totalSteps={4} currentStep={1} className="p-4 m-2 bg-white rounded-lg" />)
      expect(component.toJSON()).toMatchSnapshot('ProgressIndicator-custom-className')
    })

    it('should match snapshot with out-of-range currentStep', () => {
      const component = render(<ProgressIndicator totalSteps={3} currentStep={5} />)
      expect(component.toJSON()).toMatchSnapshot('ProgressIndicator-out-of-range')
    })
  })

  describe('AuthProgressIndicator Snapshots', () => {
    it('should match snapshot with default state', async () => {
      const component = renderWithStore(<AuthProgressIndicator />)
      expect(component.toJSON()).toMatchSnapshot('AuthProgressIndicator-default')
    })

    it('should match snapshot with active authentication step', async () => {
      const mockStore = mockStorePresets.authenticating()
      mockStore.authenticationStore.startStep('generate-message')

      const component = renderWithStore(<AuthProgressIndicator />, { store: mockStore })
      expect(component.toJSON()).toMatchSnapshot('AuthProgressIndicator-active-step')
    })

    it('should match snapshot with completed authentication', async () => {
      const mockStore = mockStorePresets.authenticating()
      mockStore.authenticationStore.completeStep('firebase-auth') // Triggers completion

      const component = renderWithStore(<AuthProgressIndicator />, { store: mockStore })
      expect(component.toJSON()).toMatchSnapshot('AuthProgressIndicator-completed')
    })

    it('should match snapshot with error state', async () => {
      const mockStore = mockStorePresets.authenticationError()
      mockStore.authenticationStore.startStep('verify-signature')
      mockStore.authenticationStore.failStep('verify-signature', 'Network connection failed')

      const component = renderWithStore(<AuthProgressIndicator />, { store: mockStore })
      expect(component.toJSON()).toMatchSnapshot('AuthProgressIndicator-error-state')
    })

    it('should match snapshot with custom className', async () => {
      const mockStore = mockStorePresets.authenticating()
      mockStore.authenticationStore.startStep('request-signature')

      const component = renderWithStore(<AuthProgressIndicator className="p-6 bg-blue-50 rounded-xl" />, { store: mockStore })
      expect(component.toJSON()).toMatchSnapshot('AuthProgressIndicator-custom-className')
    })

    it('should match snapshot with multiple completed steps', async () => {
      const mockStore = mockStorePresets.authenticating()
      mockStore.authenticationStore.completeStep('generate-message')
      mockStore.authenticationStore.completeStep('request-signature')
      mockStore.authenticationStore.startStep('verify-signature')

      const component = renderWithStore(<AuthProgressIndicator />, { store: mockStore })
      expect(component.toJSON()).toMatchSnapshot('AuthProgressIndicator-multiple-completed')
    })
  })

  describe('Component Integration Snapshots', () => {
    it('should match snapshot of components used together', () => {
      const component = render(
        <>
          <LoadingSpinner size="small" className="mb-4" />
          <ProgressIndicator totalSteps={4} currentStep={1} className="mb-6" />
        </>
      )
      expect(component.toJSON()).toMatchSnapshot('Components-integration')
    })

    it('should match snapshot with various component states', () => {
      const component = render(
        <>
          <LoadingSpinner size="large" color="#2563eb" />
          <ProgressIndicator totalSteps={6} currentStep={3} />
          <LoadingSpinner size="small" color="#10b981" />
        </>
      )
      expect(component.toJSON()).toMatchSnapshot('Components-various-states')
    })
  })

  describe('Responsive Design Snapshots', () => {
    it('should match snapshot with different screen sizes simulation', () => {
      const component = render(<ProgressIndicator totalSteps={8} currentStep={4} className="w-full max-w-sm mx-auto" />)
      expect(component.toJSON()).toMatchSnapshot('ProgressIndicator-responsive')
    })

    it('should match snapshot with loading spinner in different containers', () => {
      const component = render(
        <>
          <LoadingSpinner className="w-10 h-10" />
          <LoadingSpinner className="w-16 h-16" />
          <LoadingSpinner className="w-24 h-24" />
        </>
      )
      expect(component.toJSON()).toMatchSnapshot('LoadingSpinner-different-sizes')
    })
  })

  describe('Accessibility Snapshots', () => {
    it('should match snapshot with accessibility labels', () => {
      const component = render(<ProgressIndicator totalSteps={5} currentStep={2} className="accessible-progress" />)
      expect(component.toJSON()).toMatchSnapshot('ProgressIndicator-accessibility')
    })
  })

  describe('Edge Cases Snapshots', () => {
    it('should match snapshot with zero steps', () => {
      const component = render(<ProgressIndicator totalSteps={0} currentStep={0} />)
      expect(component.toJSON()).toMatchSnapshot('ProgressIndicator-zero-steps')
    })

    it('should match snapshot with negative current step', () => {
      const component = render(<ProgressIndicator totalSteps={3} currentStep={-1} />)
      expect(component.toJSON()).toMatchSnapshot('ProgressIndicator-negative-step')
    })

    it('should match snapshot with empty store state', async () => {
      const mockStore = mockStorePresets.unauthenticated()
      // Mock empty steps
      mockStore.authenticationStore.getAllSteps = () => []

      const component = renderWithStore(<AuthProgressIndicator />, { store: mockStore })
      expect(component.toJSON()).toMatchSnapshot('AuthProgressIndicator-empty-state')
    })
  })
})
