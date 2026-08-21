import React from 'react'
import { fireEvent, render } from '../../__tests__/test-utils'
import { OverdueLink } from './OverdueLink'

describe('OverdueLink', () => {
  it('counts one late loan in the singular', () => {
    const { getByText } = render(<OverdueLink count={1} onPress={jest.fn()} />)

    expect(getByText('1 late loan')).toBeTruthy()
  })

  it('counts several in the plural', () => {
    const { getByText } = render(<OverdueLink count={4} onPress={jest.fn()} />)

    expect(getByText('4 late loans')).toBeTruthy()
  })

  it('never says "default"', () => {
    // Every loan behind this link is overdue, which is arithmetic. Whether any
    // of them is in default is the owner's judgement, made on the next screen.
    const { queryByText } = render(<OverdueLink count={2} onPress={jest.fn()} />)

    expect(queryByText(/default/i)).toBeNull()
  })

  it('names the pool when several compete for attention', () => {
    const { getByText } = render(<OverdueLink count={2} poolName="Neighbourhood Circle" onPress={jest.fn()} />)

    expect(getByText(/Neighbourhood Circle/)).toBeTruthy()
  })

  it('leaves the pool unnamed on the pool’s own page', () => {
    const { getByText } = render(<OverdueLink count={2} onPress={jest.fn()} />)

    expect(getByText('Past the due date')).toBeTruthy()
  })

  it('opens the list', () => {
    const onPress = jest.fn()
    const { getByTestId } = render(<OverdueLink count={1} onPress={onPress} />)

    fireEvent.press(getByTestId('overdue-link'))

    expect(onPress).toHaveBeenCalled()
  })
})
