import type { LoanInfo } from '@superpool/types'
import React from 'react'
import { render } from '../../__tests__/test-utils'
import { LoanDueNotice } from './LoanDueNotice'

const DAY = 24 * 60 * 60 * 1000
const TERM_SECONDS = 30 * 24 * 60 * 60

/** An indexed record whose term ends `dueInMs` from now. */
function record(overrides: Partial<LoanInfo> = {}, dueInMs = 10 * DAY): LoanInfo {
  return {
    id: '31337-1-1',
    loanId: 1,
    poolId: 1,
    poolAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    borrower: '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc',
    amount: '5000000000000000000',
    interestRate: 500,
    duration: TERM_SECONDS,
    startedAt: new Date(Date.now() + dueInMs - TERM_SECONDS * 1000).toISOString(),
    isRepaid: false,
    amountRepaid: '0',
    principalOutstanding: '5000000000000000000',
    interestOutstanding: '0',
    status: 'disbursed',
    chainId: 31337,
    transactionHash: `0x${'a'.repeat(64)}`,
    blockNumber: 120,
    ...overrides,
  }
}

describe('LoanDueNotice', () => {
  it('says nothing about a loan comfortably inside its term', () => {
    const { toJSON } = render(<LoanDueNotice loan={record()} />)

    expect(toJSON()).toBeNull()
  })

  it('names the date when the term is nearly up', () => {
    const { getByTestId } = render(<LoanDueNotice loan={record({}, 2 * 60 * 60 * 1000)} />)

    expect(getByTestId('loan-due-notice-due-soon')).toBeTruthy()
  })

  it('leads with the cost of waiting rather than the label', () => {
    // "Overdue" reads as a status. That interest keeps accruing at the same
    // rate, uncapped, is the part a borrower is most likely not to know — and
    // it is the reason to act today rather than next week.
    const { getByTestId } = render(<LoanDueNotice loan={record({}, -DAY)} />)

    expect(getByTestId('loan-due-notice-overdue')).toHaveTextContent(/Interest keeps adding up/)
    expect(getByTestId('loan-due-notice-overdue')).toHaveTextContent(/no penalty on top, and no cap/)
  })

  it('tells a declared borrower that paying still closes the debt', () => {
    // The declaration is not a write-off and not the end of the loan. A
    // borrower who reads it as either has no reason to pay.
    const { getByTestId } = render(<LoanDueNotice loan={record({ status: 'defaulted' }, -5 * DAY)} />)

    expect(getByTestId('loan-due-notice-defaulted')).toHaveTextContent(/marked it in default/)
    expect(getByTestId('loan-due-notice-defaulted')).toHaveTextContent(/Paying it off closes the debt/)
  })

  it('says nothing once the debt is settled', () => {
    const { toJSON } = render(<LoanDueNotice loan={record({ status: 'defaulted', isRepaid: true }, -5 * DAY)} />)

    expect(toJSON()).toBeNull()
  })
})
