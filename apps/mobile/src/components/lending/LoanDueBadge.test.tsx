import { type Loan, LoanStatus } from '@superpool/types'
import React from 'react'
import { render } from '../../__tests__/test-utils'
import { LoanDueBadge } from './LoanDueBadge'

const DAY = 24 * 60 * 60 * 1000

function loan(overrides: Partial<Loan> = {}, dueInMs = 10 * DAY): Loan {
  return {
    id: '31337-1-1',
    poolId: '1',
    borrower: '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc',
    amount: 5_000_000_000_000_000_000n,
    interestRate: 500,
    duration: 30 * 24 * 60 * 60,
    status: LoanStatus.DISBURSED,
    amountRepaid: 0n,
    interestAccrued: 0n,
    requestedAt: new Date(Date.now() - DAY),
    dueDate: new Date(Date.now() + dueInMs),
    ...overrides,
  } as Loan
}

describe('LoanDueBadge', () => {
  it('renders nothing for a loan with time left', () => {
    // A badge that always appears is one nobody reads. On time is the state a
    // borrower assumes from the absence of a warning.
    const { toJSON } = render(<LoanDueBadge loan={loan()} />)

    expect(toJSON()).toBeNull()
  })

  it('renders nothing for a settled loan', () => {
    const { toJSON } = render(<LoanDueBadge loan={loan({ status: LoanStatus.REPAID }, -DAY)} />)

    expect(toJSON()).toBeNull()
  })

  it('warns that a loan is due soon', () => {
    const { getByTestId, getByText } = render(<LoanDueBadge loan={loan({}, 2 * 60 * 60 * 1000)} />)

    expect(getByTestId('loan-due-badge-due-soon')).toBeTruthy()
    expect(getByText('Due soon')).toBeTruthy()
  })

  it('marks an overdue loan', () => {
    const { getByTestId, getByText } = render(<LoanDueBadge loan={loan({}, -DAY)} />)

    expect(getByTestId('loan-due-badge-overdue')).toBeTruthy()
    expect(getByText('Overdue')).toBeTruthy()
  })

  it('says "in default" rather than "defaulted"', () => {
    // The loan carries the mark, not the borrower — and the loan is still open.
    const { getByText } = render(<LoanDueBadge loan={loan({ status: LoanStatus.DEFAULTED }, -5 * DAY)} />)

    expect(getByText('In default')).toBeTruthy()
  })

  it('takes an explicit testID so two badges on one screen stay apart', () => {
    const { getByTestId } = render(<LoanDueBadge loan={loan({}, -DAY)} testID="row-badge" />)

    expect(getByTestId('row-badge-overdue')).toBeTruthy()
  })
})
