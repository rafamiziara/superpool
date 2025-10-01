import { render } from '@testing-library/react-native'
import React from 'react'
import { ProgressIndicator, ProgressIndicatorPresets } from './ProgressIndicator'

describe('ProgressIndicator', () => {
  it('should render correct number of steps', () => {
    const { getByTestId } = render(<ProgressIndicator totalSteps={4} currentStep={1} />)

    expect(getByTestId('progress-indicator-container')).toBeTruthy()
    expect(getByTestId('progress-indicator-step-0')).toBeTruthy()
    expect(getByTestId('progress-indicator-step-1')).toBeTruthy()
    expect(getByTestId('progress-indicator-step-2')).toBeTruthy()
    expect(getByTestId('progress-indicator-step-3')).toBeTruthy()
  })

  it('should show correct current step', () => {
    const { getByTestId } = render(<ProgressIndicator totalSteps={3} currentStep={1} />)

    const currentStepElement = getByTestId('progress-indicator-step-1')
    expect(currentStepElement).toBeTruthy()
  })

  it('should apply correct accessibility labels', () => {
    const { getByTestId } = render(<ProgressIndicator totalSteps={3} currentStep={1} />)

    const step0 = getByTestId('progress-indicator-step-0')
    const step1 = getByTestId('progress-indicator-step-1')
    const step2 = getByTestId('progress-indicator-step-2')

    expect(step0.props.accessibilityLabel).toBe('Step 1 of 3 (completed)')
    expect(step1.props.accessibilityLabel).toBe('Step 2 of 3 (current)')
    expect(step2.props.accessibilityLabel).toBe('Step 3 of 3 (pending)')
  })

  it('should apply correct accessibility role', () => {
    const { getByTestId } = render(<ProgressIndicator totalSteps={5} currentStep={2} />)

    const step = getByTestId('progress-indicator-step-0')
    expect(step.props.accessibilityRole).toBe('button')
  })

  it('should handle first step correctly', () => {
    const { getByTestId } = render(<ProgressIndicator totalSteps={3} currentStep={0} />)

    const step0 = getByTestId('progress-indicator-step-0')
    expect(step0.props.accessibilityLabel).toBe('Step 1 of 3 (current)')
  })

  it('should handle last step correctly', () => {
    const { getByTestId } = render(<ProgressIndicator totalSteps={3} currentStep={2} />)

    const step2 = getByTestId('progress-indicator-step-2')
    expect(step2.props.accessibilityLabel).toBe('Step 3 of 3 (current)')
  })

  it('should apply custom className', () => {
    const { getByTestId } = render(<ProgressIndicator totalSteps={3} currentStep={1} className="custom-class" />)

    const container = getByTestId('progress-indicator-container')
    expect(container).toBeTruthy()
  })

  it('should use custom testID', () => {
    const { getByTestId } = render(<ProgressIndicator totalSteps={3} currentStep={1} testID="custom-progress" />)

    expect(getByTestId('custom-progress-container')).toBeTruthy()
    expect(getByTestId('custom-progress-step-0')).toBeTruthy()
  })

  describe('Size variants', () => {
    it('should render small size', () => {
      const { getByTestId } = render(<ProgressIndicator totalSteps={3} currentStep={1} size="small" />)

      expect(getByTestId('progress-indicator-container')).toBeTruthy()
    })

    it('should render medium size (default)', () => {
      const { getByTestId } = render(<ProgressIndicator totalSteps={3} currentStep={1} size="medium" />)

      expect(getByTestId('progress-indicator-container')).toBeTruthy()
    })

    it('should render large size', () => {
      const { getByTestId } = render(<ProgressIndicator totalSteps={3} currentStep={1} size="large" />)

      expect(getByTestId('progress-indicator-container')).toBeTruthy()
    })
  })

  describe('ProgressIndicatorPresets', () => {
    it('should render onboarding preset', () => {
      const { getByTestId } = render(ProgressIndicatorPresets.onboarding(1))

      expect(getByTestId('onboarding-progress-container')).toBeTruthy()
      expect(getByTestId('onboarding-progress-step-0')).toBeTruthy()
      expect(getByTestId('onboarding-progress-step-1')).toBeTruthy()
      expect(getByTestId('onboarding-progress-step-2')).toBeTruthy()
      expect(getByTestId('onboarding-progress-step-3')).toBeTruthy()
    })

    it('should render authentication preset', () => {
      const { getByTestId } = render(ProgressIndicatorPresets.authentication(2))

      expect(getByTestId('auth-progress-container')).toBeTruthy()
      // Should have 5 steps for authentication
      expect(getByTestId('auth-progress-step-0')).toBeTruthy()
      expect(getByTestId('auth-progress-step-4')).toBeTruthy()
    })

    it('should render steps preset with custom values', () => {
      const { getByTestId } = render(ProgressIndicatorPresets.steps(6, 3))

      expect(getByTestId('steps-progress-container')).toBeTruthy()
      expect(getByTestId('steps-progress-step-0')).toBeTruthy()
      expect(getByTestId('steps-progress-step-5')).toBeTruthy()
    })
  })

  describe('Edge cases', () => {
    it('should handle single step', () => {
      const { getByTestId } = render(<ProgressIndicator totalSteps={1} currentStep={0} />)

      expect(getByTestId('progress-indicator-step-0')).toBeTruthy()
      expect(() => getByTestId('progress-indicator-step-1')).toThrow()
    })

    it('should handle zero current step', () => {
      const { getByTestId } = render(<ProgressIndicator totalSteps={3} currentStep={0} />)

      const step0 = getByTestId('progress-indicator-step-0')
      expect(step0.props.accessibilityLabel).toBe('Step 1 of 3 (current)')
    })

    it('should handle current step beyond total steps', () => {
      // This shouldn't happen in normal usage but test defensive behavior
      const { getByTestId } = render(<ProgressIndicator totalSteps={3} currentStep={5} />)

      const step0 = getByTestId('progress-indicator-step-0')
      const step2 = getByTestId('progress-indicator-step-2')

      expect(step0.props.accessibilityLabel).toBe('Step 1 of 3 (completed)')
      expect(step2.props.accessibilityLabel).toBe('Step 3 of 3 (completed)')
    })
  })
})
