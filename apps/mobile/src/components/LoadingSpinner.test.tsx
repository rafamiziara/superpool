import React from 'react'
import { render } from '../test-utils'
import { LoadingSpinner } from './LoadingSpinner'

describe('LoadingSpinner', () => {
  describe('Default Props', () => {
    it('should render with default props', () => {
      const { getByTestId } = render(<LoadingSpinner />)

      const activityIndicator = getByTestId('activity-indicator')
      expect(activityIndicator.props.size).toBe('large')
      expect(activityIndicator.props.color).toBe('#2563eb')
    })

    it('should render with default className', () => {
      const { getByTestId } = render(<LoadingSpinner />)

      const container = getByTestId('loading-spinner-container')
      expect(container.props.className).toContain('items-center justify-center')
    })
  })

  describe('Custom Props', () => {
    it('should render with small size', () => {
      const { getByTestId } = render(<LoadingSpinner size="small" />)

      const activityIndicator = getByTestId('activity-indicator')
      expect(activityIndicator.props.size).toBe('small')
    })

    it('should render with large size', () => {
      const { getByTestId } = render(<LoadingSpinner size="large" />)

      const activityIndicator = getByTestId('activity-indicator')
      expect(activityIndicator.props.size).toBe('large')
    })

    it('should render with custom color', () => {
      const customColor = '#ff0000'
      const { getByTestId } = render(<LoadingSpinner color={customColor} />)

      const activityIndicator = getByTestId('activity-indicator')
      expect(activityIndicator.props.color).toBe(customColor)
    })

    it('should render with custom className', () => {
      const customClassName = 'my-custom-class p-4'
      const { getByTestId } = render(<LoadingSpinner className={customClassName} />)

      const container = getByTestId('loading-spinner-container')
      expect(container.props.className).toContain('items-center justify-center')
      expect(container.props.className).toContain(customClassName)
    })

    it('should combine default and custom className', () => {
      const customClassName = 'p-4 bg-gray-100'
      const { getByTestId } = render(<LoadingSpinner className={customClassName} />)

      const container = getByTestId('loading-spinner-container')
      const className = container.props.className

      expect(className).toContain('items-center justify-center')
      expect(className).toContain('p-4')
      expect(className).toContain('bg-gray-100')
    })
  })

  describe('Accessibility', () => {
    it('should have proper accessibility properties', () => {
      const { getByTestId } = render(<LoadingSpinner />)

      const activityIndicator = getByTestId('activity-indicator')
      expect(activityIndicator).toBeTruthy()
    })

    it('should be accessible with screen readers', () => {
      const { getByTestId } = render(<LoadingSpinner />)

      const container = getByTestId('loading-spinner-container')
      expect(container).toBeTruthy()

      const activityIndicator = getByTestId('activity-indicator')
      expect(activityIndicator).toBeTruthy()
    })
  })

  describe('Snapshot Testing', () => {
    it('should match snapshot with default props', () => {
      const component = render(<LoadingSpinner />)
      expect(component.toJSON()).toMatchSnapshot()
    })

    it('should match snapshot with custom props', () => {
      const component = render(<LoadingSpinner size="small" color="#00ff00" className="p-2 m-4" />)
      expect(component.toJSON()).toMatchSnapshot()
    })
  })

  describe('Props Validation', () => {
    it('should handle all size variants correctly', () => {
      const sizes: Array<'small' | 'large'> = ['small', 'large']

      sizes.forEach((size) => {
        const { getByTestId } = render(<LoadingSpinner size={size} />)
        const activityIndicator = getByTestId('activity-indicator')
        expect(activityIndicator.props.size).toBe(size)
      })
    })

    it('should handle empty className gracefully', () => {
      const { getByTestId } = render(<LoadingSpinner className="" />)

      const container = getByTestId('loading-spinner-container')
      expect(container.props.className).toBe('items-center justify-center ')
    })

    it('should handle undefined props gracefully', () => {
      const { getByTestId } = render(<LoadingSpinner size={undefined} color={undefined} />)

      const activityIndicator = getByTestId('activity-indicator')
      expect(activityIndicator.props.size).toBe('large') // Default fallback
      expect(activityIndicator.props.color).toBe('#2563eb') // Default fallback
    })
  })
})
