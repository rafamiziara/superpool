import React from 'react'
import { render } from '../test-utils'
import { ProgressIndicator } from './ProgressIndicator'

describe('ProgressIndicator', () => {
  describe('Basic Rendering', () => {
    it('should render with required props', () => {
      const { getByTestId } = render(<ProgressIndicator totalSteps={3} currentStep={1} />)

      const container = getByTestId('progress-indicator-container')
      expect(container).toBeTruthy()
    })

    it('should render correct number of steps', () => {
      const totalSteps = 5
      const { getAllByTestId } = render(<ProgressIndicator totalSteps={totalSteps} currentStep={2} />)

      const steps = getAllByTestId(/progress-step-\d+/)
      expect(steps).toHaveLength(totalSteps)
    })

    it('should render all step elements with correct testIDs', () => {
      const totalSteps = 4
      const { getByTestId } = render(<ProgressIndicator totalSteps={totalSteps} currentStep={1} />)

      for (let i = 0; i < totalSteps; i++) {
        const step = getByTestId(`progress-step-${i}`)
        expect(step).toBeTruthy()
      }
    })
  })

  describe('Step State Visualization', () => {
    it('should highlight current step correctly', () => {
      const currentStep = 2
      const { getByTestId } = render(<ProgressIndicator totalSteps={5} currentStep={currentStep} />)

      const currentStepElement = getByTestId(`progress-step-${currentStep}`)
      expect(currentStepElement.props.className).toContain('bg-primary')
    })

    it('should style non-current steps correctly', () => {
      const currentStep = 2
      const totalSteps = 5
      const { getByTestId } = render(<ProgressIndicator totalSteps={totalSteps} currentStep={currentStep} />)

      for (let i = 0; i < totalSteps; i++) {
        const stepElement = getByTestId(`progress-step-${i}`)
        if (i !== currentStep) {
          expect(stepElement.props.className).toContain('bg-muted-foreground/30')
          expect(stepElement.props.className).not.toContain('bg-primary')
        }
      }
    })

    it('should handle first step as current', () => {
      const { getByTestId } = render(<ProgressIndicator totalSteps={3} currentStep={0} />)

      const firstStep = getByTestId('progress-step-0')
      expect(firstStep.props.className).toContain('bg-primary')

      const secondStep = getByTestId('progress-step-1')
      expect(secondStep.props.className).toContain('bg-muted-foreground/30')
    })

    it('should handle last step as current', () => {
      const totalSteps = 4
      const lastStep = totalSteps - 1
      const { getByTestId } = render(<ProgressIndicator totalSteps={totalSteps} currentStep={lastStep} />)

      const lastStepElement = getByTestId(`progress-step-${lastStep}`)
      expect(lastStepElement.props.className).toContain('bg-primary')

      const previousStep = getByTestId(`progress-step-${lastStep - 1}`)
      expect(previousStep.props.className).toContain('bg-muted-foreground/30')
    })
  })

  describe('Edge Cases', () => {
    it('should handle single step', () => {
      const { getByTestId, getAllByTestId } = render(<ProgressIndicator totalSteps={1} currentStep={0} />)

      const steps = getAllByTestId(/progress-step-\d+/)
      expect(steps).toHaveLength(1)

      const singleStep = getByTestId('progress-step-0')
      expect(singleStep.props.className).toContain('bg-primary')
    })

    it('should handle zero steps gracefully', () => {
      const { queryAllByTestId } = render(<ProgressIndicator totalSteps={0} currentStep={0} />)

      const steps = queryAllByTestId(/progress-step-\d+/)
      expect(steps).toHaveLength(0)
    })

    it('should handle currentStep out of range', () => {
      const { getByTestId } = render(<ProgressIndicator totalSteps={3} currentStep={5} />)

      // All steps should be inactive since currentStep is out of range
      for (let i = 0; i < 3; i++) {
        const step = getByTestId(`progress-step-${i}`)
        expect(step.props.className).toContain('bg-muted-foreground/30')
      }
    })

    it('should handle negative currentStep', () => {
      const { getByTestId } = render(<ProgressIndicator totalSteps={3} currentStep={-1} />)

      // All steps should be inactive since currentStep is negative
      for (let i = 0; i < 3; i++) {
        const step = getByTestId(`progress-step-${i}`)
        expect(step.props.className).toContain('bg-muted-foreground/30')
      }
    })
  })

  describe('Styling and Layout', () => {
    it('should apply default className', () => {
      const { getByTestId } = render(<ProgressIndicator totalSteps={3} currentStep={1} />)

      const container = getByTestId('progress-indicator-container')
      expect(container.props.className).toContain('flex-row justify-center items-center gap-2')
    })

    it('should apply custom className', () => {
      const customClassName = 'my-custom-class p-4'
      const { getByTestId } = render(<ProgressIndicator totalSteps={3} currentStep={1} className={customClassName} />)

      const container = getByTestId('progress-indicator-container')
      expect(container.props.className).toContain('flex-row justify-center items-center gap-2')
      expect(container.props.className).toContain(customClassName)
    })

    it('should apply correct step styles', () => {
      const { getByTestId } = render(<ProgressIndicator totalSteps={3} currentStep={1} />)

      for (let i = 0; i < 3; i++) {
        const step = getByTestId(`progress-step-${i}`)
        expect(step.props.className).toContain('w-2 h-2 rounded-full')
      }
    })
  })

  describe('Accessibility', () => {
    it('should have proper accessibility labels for current step', () => {
      const { getByTestId } = render(<ProgressIndicator totalSteps={4} currentStep={2} />)

      const currentStep = getByTestId('progress-step-2')
      expect(currentStep.props.accessibilityLabel).toBe('Step 3 of 4 (current)')
    })

    it('should have proper accessibility labels for completed steps', () => {
      const { getByTestId } = render(<ProgressIndicator totalSteps={5} currentStep={3} />)

      const completedStep = getByTestId('progress-step-1')
      expect(completedStep.props.accessibilityLabel).toBe('Step 2 of 5 (completed)')
    })

    it('should have proper accessibility labels for pending steps', () => {
      const { getByTestId } = render(<ProgressIndicator totalSteps={4} currentStep={1} />)

      const pendingStep = getByTestId('progress-step-3')
      expect(pendingStep.props.accessibilityLabel).toBe('Step 4 of 4 (pending)')
    })

    it('should provide accessibility labels for all steps', () => {
      const totalSteps = 3
      const currentStep = 1
      const { getByTestId } = render(<ProgressIndicator totalSteps={totalSteps} currentStep={currentStep} />)

      for (let i = 0; i < totalSteps; i++) {
        const step = getByTestId(`progress-step-${i}`)
        expect(step.props.accessibilityLabel).toBeTruthy()
        expect(step.props.accessibilityLabel).toContain(`Step ${i + 1} of ${totalSteps}`)
      }
    })
  })

  describe('Dynamic Behavior', () => {
    it('should update when currentStep changes', () => {
      const { getByTestId, rerender } = render(<ProgressIndicator totalSteps={3} currentStep={0} />)

      // Initially first step is active
      expect(getByTestId('progress-step-0').props.className).toContain('bg-primary')
      expect(getByTestId('progress-step-1').props.className).toContain('bg-muted-foreground/30')

      // Rerender with different currentStep
      rerender(<ProgressIndicator totalSteps={3} currentStep={1} />)

      // Now second step should be active
      expect(getByTestId('progress-step-0').props.className).toContain('bg-muted-foreground/30')
      expect(getByTestId('progress-step-1').props.className).toContain('bg-primary')
    })

    it('should update when totalSteps changes', () => {
      const { getAllByTestId, rerender } = render(<ProgressIndicator totalSteps={3} currentStep={1} />)

      expect(getAllByTestId(/progress-step-\d+/)).toHaveLength(3)

      // Rerender with more steps
      rerender(<ProgressIndicator totalSteps={5} currentStep={1} />)

      expect(getAllByTestId(/progress-step-\d+/)).toHaveLength(5)
    })
  })

  describe('Snapshot Testing', () => {
    it('should match snapshot with basic props', () => {
      const component = render(<ProgressIndicator totalSteps={3} currentStep={1} />)
      expect(component.toJSON()).toMatchSnapshot()
    })

    it('should match snapshot with custom className', () => {
      const component = render(<ProgressIndicator totalSteps={5} currentStep={2} className="p-4 bg-gray-100" />)
      expect(component.toJSON()).toMatchSnapshot()
    })

    it('should match snapshot with edge cases', () => {
      const component = render(<ProgressIndicator totalSteps={1} currentStep={0} />)
      expect(component.toJSON()).toMatchSnapshot()
    })
  })
})
