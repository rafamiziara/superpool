import React from 'react'
import { render } from '@mocks/factories/testFactory'
import { ProgressIndicator } from './ProgressIndicator'

describe('ProgressIndicator', () => {
  describe('Basic Rendering', () => {
    it('should render with correct number of steps', () => {
      const totalSteps = 5
      const { getAllByTestId } = render(<ProgressIndicator totalSteps={totalSteps} currentStep={2} />)

      const steps = getAllByTestId(/progress-step-\d+/)
      expect(steps).toHaveLength(totalSteps)
    })
  })

  describe('Step State Visualization', () => {
    it('should highlight current step and dim others', () => {
      const currentStep = 2
      const totalSteps = 5
      const { getByTestId } = render(<ProgressIndicator totalSteps={totalSteps} currentStep={currentStep} />)

      const currentStepElement = getByTestId(`progress-step-${currentStep}`)
      expect(currentStepElement.props.className).toContain('bg-primary')

      const inactiveStep = getByTestId(`progress-step-${currentStep + 1}`)
      expect(inactiveStep.props.className).toContain('bg-muted-foreground/30')
      expect(inactiveStep.props.className).not.toContain('bg-primary')
    })
  })

  describe('Edge Cases', () => {
    it('should handle zero steps gracefully', () => {
      const { queryAllByTestId } = render(<ProgressIndicator totalSteps={0} currentStep={0} />)

      const steps = queryAllByTestId(/progress-step-\d+/)
      expect(steps).toHaveLength(0)
    })

    it('should handle invalid currentStep gracefully', () => {
      const { getByTestId } = render(<ProgressIndicator totalSteps={3} currentStep={-1} />)

      // All steps should be inactive since currentStep is invalid
      for (let i = 0; i < 3; i++) {
        const step = getByTestId(`progress-step-${i}`)
        expect(step.props.className).toContain('bg-muted-foreground/30')
      }
    })
  })

  describe('Accessibility', () => {
    it('should provide proper accessibility labels', () => {
      const { getByTestId } = render(<ProgressIndicator totalSteps={4} currentStep={2} />)

      const currentStep = getByTestId('progress-step-2')
      expect(currentStep.props.accessibilityLabel).toBe('Step 3 of 4 (current)')

      const completedStep = getByTestId('progress-step-1')
      expect(completedStep.props.accessibilityLabel).toBe('Step 2 of 4 (completed)')

      const pendingStep = getByTestId('progress-step-3')
      expect(pendingStep.props.accessibilityLabel).toBe('Step 4 of 4 (pending)')
    })
  })

  describe('Dynamic Updates', () => {
    it('should update when props change', () => {
      const { getByTestId, rerender, getAllByTestId } = render(<ProgressIndicator totalSteps={3} currentStep={0} />)

      expect(getByTestId('progress-step-0').props.className).toContain('bg-primary')
      expect(getAllByTestId(/progress-step-\d+/)).toHaveLength(3)

      // Update both currentStep and totalSteps
      rerender(<ProgressIndicator totalSteps={4} currentStep={2} />)

      expect(getByTestId('progress-step-2').props.className).toContain('bg-primary')
      expect(getAllByTestId(/progress-step-\d+/)).toHaveLength(4)
    })
  })
})
