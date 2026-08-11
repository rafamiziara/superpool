import React from 'react'
import { fireEvent, render } from '../../__tests__/test-utils'
import { ApprovalsLink } from './ApprovalsLink'

describe('ApprovalsLink', () => {
  it('counts one request in the singular', () => {
    const { getByText } = render(<ApprovalsLink count={1} onPress={jest.fn()} />)

    expect(getByText('1 loan request')).toBeTruthy()
  })

  it('counts several in the plural', () => {
    const { getByText } = render(<ApprovalsLink count={3} onPress={jest.fn()} />)

    expect(getByText('3 loan requests')).toBeTruthy()
  })

  it('names the pool when several compete for attention', () => {
    // On the dashboard the same card appears per pool, so it has to say which.
    const { getByText } = render(<ApprovalsLink count={2} poolName="Neighbourhood Circle" onPress={jest.fn()} />)

    expect(getByText(/Neighbourhood Circle/)).toBeTruthy()
  })

  it('leaves the pool unnamed on the pool’s own page', () => {
    const { getByText } = render(<ApprovalsLink count={2} onPress={jest.fn()} />)

    expect(getByText('Waiting on your decision')).toBeTruthy()
  })

  it('opens the queue', () => {
    const onPress = jest.fn()
    const { getByTestId } = render(<ApprovalsLink count={1} onPress={onPress} />)

    fireEvent.press(getByTestId('approvals-link'))

    expect(onPress).toHaveBeenCalled()
  })

  it('takes an explicit testID, since a pool name may contain anything', () => {
    const { getByTestId } = render(<ApprovalsLink count={1} onPress={jest.fn()} testID="dashboard-approvals-11" />)

    expect(getByTestId('dashboard-approvals-11')).toBeTruthy()
  })
})
