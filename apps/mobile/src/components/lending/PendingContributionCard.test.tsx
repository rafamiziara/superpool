import React from 'react'
import { makeContributeTransaction, TX_HASH } from '../../__tests__/fixtures/pendingTransaction'
import { fireEvent, render } from '../../__tests__/test-utils'
import type { ContributeTransaction } from '../../stores/PendingTransactionsStore'
import { PendingContributionCard } from './PendingContributionCard'

function renderCard(overrides: Partial<ContributeTransaction> = {}, props: { onPress?: () => void; onDismiss?: () => void } = {}) {
  return render(<PendingContributionCard transaction={makeContributeTransaction(overrides)} {...props} />)
}

describe('PendingContributionCard', () => {
  it('shows the submitted amount', () => {
    const { getByText } = renderCard()

    expect(getByText('5 POL')).toBeTruthy()
  })

  it('prefers the amount the chain recorded once confirmed', () => {
    const { getByText } = renderCard({ status: 'confirmed', result: { amount: '7000000000000000000' } })

    expect(getByText('7 POL')).toBeTruthy()
  })

  it.each([
    ['submitted', 'Pending', 'Waiting for the network to confirm'],
    ['confirmed', 'Syncing', 'Confirmed on chain — updating the balance'],
    ['failed', 'Failed', 'This deposit did not go through'],
  ] as const)('describes the %s state', (status, badge, note) => {
    const { getByText, getByTestId } = renderCard({ status })

    expect(getByText(badge)).toBeTruthy()
    expect(getByTestId(`pending-contribution-note-${TX_HASH}`).props.children).toBe(note)
  })

  it('opens the detail view when pressed', () => {
    const onPress = jest.fn()
    const { getByTestId } = renderCard({}, { onPress })

    fireEvent.press(getByTestId(`pending-contribution-card-${TX_HASH}`))

    expect(onPress).toHaveBeenCalled()
  })

  it('offers dismissal when one is supplied', () => {
    // Nothing else removes a failed record — indexing only drops the ones it
    // succeeds on — so without this the row would be permanent.
    const onDismiss = jest.fn()
    const { getByTestId } = renderCard({ status: 'failed' }, { onDismiss })

    fireEvent.press(getByTestId(`pending-contribution-dismiss-${TX_HASH}`))

    expect(onDismiss).toHaveBeenCalled()
  })

  it('shows the status badge when there is nothing to dismiss', () => {
    const { getByTestId, queryByTestId } = renderCard()

    expect(getByTestId('pending-contribution-badge-submitted')).toBeTruthy()
    expect(queryByTestId(`pending-contribution-dismiss-${TX_HASH}`)).toBeNull()
  })

  it('keeps the status badge alongside the dismiss button', () => {
    // Dismissal is offered on confirmed records now, and there the badge is the
    // only thing explaining why the row is still on screen.
    const { getByTestId } = renderCard({ status: 'confirmed' }, { onDismiss: jest.fn() })

    expect(getByTestId('pending-contribution-badge-confirmed')).toBeTruthy()
    expect(getByTestId(`pending-contribution-dismiss-${TX_HASH}`)).toBeTruthy()
  })
})
