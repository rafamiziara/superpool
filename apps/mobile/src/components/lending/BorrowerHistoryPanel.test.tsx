import type { BorrowerHistory } from '@superpool/types'
import React from 'react'
import { render } from '../../__tests__/test-utils'
import { BorrowerHistoryPanel } from './BorrowerHistoryPanel'

function makeHistory(overrides: Partial<BorrowerHistory> = {}): BorrowerHistory {
  return { total: 0, repaid: 0, onTime: 0, late: 0, undated: 0, outstanding: 0, overdue: 0, defaulted: 0, isNew: true, ...overrides }
}

function renderPanel(history: Partial<BorrowerHistory> = {}, voice: 'owner' | 'self' = 'owner') {
  return render(<BorrowerHistoryPanel history={makeHistory(history)} voice={voice} />)
}

describe('BorrowerHistoryPanel', () => {
  it('tells a first-time borrower apart from a bad one', () => {
    // The failure mode this panel exists to avoid: a row of zeroes reads as the
    // worst possible record, and a lending product that shows that to every new
    // member is unusable for the people it is for.
    const { getByTestId, queryByTestId } = renderPanel()

    expect(getByTestId('borrower-history-new')).toBeTruthy()
    expect(queryByTestId('borrower-history-stats')).toBeNull()
  })

  it('counts what was borrowed and what came back', () => {
    const { getByTestId } = renderPanel({ total: 4, repaid: 3, onTime: 3, outstanding: 1, isNew: false })

    expect(getByTestId('borrower-history-total')).toHaveTextContent('4')
    expect(getByTestId('borrower-history-repaid')).toHaveTextContent('3')
    expect(getByTestId('borrower-history-on-time')).toHaveTextContent('3')
    expect(getByTestId('borrower-history-outstanding')).toHaveTextContent('1')
  })

  it('names lateness when there is any', () => {
    const { getByTestId } = renderPanel({ total: 2, repaid: 2, onTime: 1, late: 1, isNew: false })

    expect(getByTestId('borrower-history-late')).toHaveTextContent('1')
  })

  it('leaves out the counts that would only ever read zero', () => {
    // A borrower whose single loan is still outstanding has nothing on time and
    // nothing late; printing both as zero implies a judgement nobody has made.
    const { queryByTestId } = renderPanel({ total: 1, outstanding: 1, isNew: false })

    expect(queryByTestId('borrower-history-on-time')).toBeNull()
    expect(queryByTestId('borrower-history-late')).toBeNull()
  })

  it('warns about a loan that is overdue right now', () => {
    // The single fact an owner would most regret not having seen.
    const { getByTestId } = renderPanel({ total: 1, outstanding: 1, overdue: 1, isNew: false })

    expect(getByTestId('borrower-history-overdue')).toHaveTextContent(/past its due date/)
  })

  it('admits when a repayment has no date rather than calling it on time', () => {
    const { getByTestId } = renderPanel({ total: 1, repaid: 1, undated: 1, isNew: false })

    expect(getByTestId('borrower-history-undated')).toHaveTextContent(/not known/)
  })

  it('addresses the borrower directly when it is their own record', () => {
    const { getByText } = renderPanel({ total: 1, outstanding: 1, overdue: 1, isNew: false }, 'self')

    expect(getByText(/^You have a loan that is past its due date/)).toBeTruthy()
  })

  it('speaks about the borrower in an owner’s queue', () => {
    const { getByText } = renderPanel({ total: 1, outstanding: 1, overdue: 1, isNew: false }, 'owner')

    expect(getByText(/^They have a loan that is past its due date/)).toBeTruthy()
  })
})
