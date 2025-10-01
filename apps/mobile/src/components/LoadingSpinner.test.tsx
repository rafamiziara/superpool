import { render } from '@testing-library/react-native'
import React from 'react'
import { LoadingSpinner, LoadingSpinnerVariants } from './LoadingSpinner'

describe('LoadingSpinner', () => {
  it('should render with default props', () => {
    const { getByTestId } = render(<LoadingSpinner />)

    expect(getByTestId('loading-spinner')).toBeTruthy()
    expect(getByTestId('loading-spinner-indicator')).toBeTruthy()
  })

  it('should render small size variant', () => {
    const { getByTestId } = render(<LoadingSpinner size="small" />)

    const container = getByTestId('loading-spinner')
    expect(container).toBeTruthy()
  })

  it('should render large size variant', () => {
    const { getByTestId } = render(<LoadingSpinner size="large" />)

    const container = getByTestId('loading-spinner')
    expect(container).toBeTruthy()
  })

  it('should show text when showText is true', () => {
    const { getByTestId, getByText } = render(<LoadingSpinner showText text="Loading data..." />)

    expect(getByTestId('loading-spinner-text')).toBeTruthy()
    expect(getByText('Loading data...')).toBeTruthy()
  })

  it('should not show text when showText is false', () => {
    const { queryByTestId } = render(<LoadingSpinner showText={false} />)

    expect(queryByTestId('loading-spinner-text')).toBeFalsy()
  })

  it('should use default text when none provided', () => {
    const { getByText } = render(<LoadingSpinner showText />)

    expect(getByText('Loading...')).toBeTruthy()
  })

  it('should apply custom className', () => {
    const { getByTestId } = render(<LoadingSpinner className="custom-class" />)

    const container = getByTestId('loading-spinner')
    expect(container).toBeTruthy()
  })

  it('should use custom color', () => {
    const { getByTestId } = render(<LoadingSpinner color="#ff0000" />)

    const indicator = getByTestId('loading-spinner-indicator')
    expect(indicator.props.color).toBe('#ff0000')
  })

  it('should use custom testID', () => {
    const { getByTestId } = render(<LoadingSpinner testID="custom-spinner" />)

    expect(getByTestId('custom-spinner')).toBeTruthy()
    expect(getByTestId('custom-spinner-indicator')).toBeTruthy()
  })

  describe('LoadingSpinnerVariants', () => {
    it('should render small variant', () => {
      const { getByTestId } = render(LoadingSpinnerVariants.small())
      expect(getByTestId('loading-spinner')).toBeTruthy()
    })

    it('should render large variant', () => {
      const { getByTestId } = render(LoadingSpinnerVariants.large())
      expect(getByTestId('loading-spinner')).toBeTruthy()
    })

    it('should render withText variant', () => {
      const { getByText } = render(LoadingSpinnerVariants.withText('Custom text'))
      expect(getByText('Custom text')).toBeTruthy()
    })

    it('should render primary variant', () => {
      const { getByTestId } = render(LoadingSpinnerVariants.primary())
      const indicator = getByTestId('loading-spinner-indicator')
      expect(indicator.props.color).toBe('#2563eb')
    })

    it('should render muted variant', () => {
      const { getByTestId } = render(LoadingSpinnerVariants.muted())
      const indicator = getByTestId('loading-spinner-indicator')
      expect(indicator.props.color).toBe('#64748b')
    })

    it('should accept additional props', () => {
      const { getByTestId } = render(LoadingSpinnerVariants.small({ testID: 'variant-test' }))
      expect(getByTestId('variant-test')).toBeTruthy()
    })
  })
})
