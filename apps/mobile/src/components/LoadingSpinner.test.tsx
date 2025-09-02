import React from 'react'
import { render } from '@mocks/factories/testFactory'
import { LoadingSpinner } from './LoadingSpinner'

describe('LoadingSpinner', () => {
  it('should render with default props', () => {
    const { getByTestId } = render(<LoadingSpinner />)

    const activityIndicator = getByTestId('activity-indicator')
    expect(activityIndicator.props.size).toBe('large')
    expect(activityIndicator.props.color).toBe('#2563eb')
  })

  it('should render with custom props', () => {
    const customColor = '#ff0000'
    const customClassName = 'p-4'
    const { getByTestId } = render(<LoadingSpinner size="small" color={customColor} className={customClassName} />)

    const activityIndicator = getByTestId('activity-indicator')
    expect(activityIndicator.props.size).toBe('small')
    expect(activityIndicator.props.color).toBe(customColor)

    const container = getByTestId('loading-spinner-container')
    expect(container.props.className).toContain('items-center justify-center')
    expect(container.props.className).toContain(customClassName)
  })
})
