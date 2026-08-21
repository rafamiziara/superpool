import type { AssessmentInfo } from '@superpool/types'
import React from 'react'
import { NATIVE } from '../../__tests__/fixtures/denomination'
import { fireEvent, render } from '../../__tests__/test-utils'
import { AssessmentPanel } from './AssessmentPanel'

const HISTORY = { total: 4, repaid: 3, onTime: 3, late: 0, undated: 0, outstanding: 1, overdue: 0, defaulted: 0, isNew: false }

function makeAssessment(overrides: Partial<AssessmentInfo> = {}): AssessmentInfo {
  return {
    id: '31337-1-7',
    chainId: 31337,
    poolId: 1,
    loanId: 7,
    risk: 'low',
    summary: 'A modest ask against a clean record.',
    observations: ['An eighth of what the pool can lend.'],
    questions: ['What is the money for?'],
    limitations: ['No purpose was stated.'],
    inputs: { amount: 10, liquidity: 80, symbol: 'POL', hadPurpose: false, borrower: HISTORY },
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function renderPanel(props: Partial<React.ComponentProps<typeof AssessmentPanel>> = {}) {
  return render(<AssessmentPanel assessment={makeAssessment()} denomination={NATIVE} {...props} />)
}

describe('AssessmentPanel', () => {
  // An unattributed paragraph in a decision surface reads as something the app
  // knows. Naming the source is what keeps it advice.
  it('names itself as a reading before it says anything', () => {
    const { getByText } = renderPanel()

    expect(getByText('Assistant’s reading')).toBeTruthy()
  })

  // A reading is about a moment, and the owner is the one deciding.
  it('dates itself and says plainly that it can be wrong', () => {
    const { getByTestId } = renderPanel()

    expect(getByTestId('assessment-footer')).toHaveTextContent(/can be wrong — you decide/)
  })

  it('shows what it made of the request', () => {
    const { getByTestId } = renderPanel()

    expect(getByTestId('assessment-summary')).toHaveTextContent(/modest ask/)
    expect(getByTestId('assessment-observations')).toBeTruthy()
    expect(getByTestId('assessment-limitations')).toBeTruthy()
  })

  // Three bands and no number: a percentage would invite arithmetic nobody
  // validated and would read as a credit rating.
  it.each([
    ['low', 'Low risk'],
    ['medium', 'Worth a look'],
    ['high', 'Worth care'],
  ])('shows %s as a band rather than a score', (risk, label) => {
    const { getByTestId } = renderPanel({ assessment: makeAssessment({ risk: risk as AssessmentInfo['risk'] }) })

    expect(getByTestId('assessment-band')).toHaveTextContent(label)
  })

  it('carries no percentage anywhere in its own chrome', () => {
    const { queryByText } = renderPanel({ assessment: makeAssessment({ risk: 'high' }) })

    expect(queryByText(/\d+\s*%/)).toBeNull()
  })

  // The exchange this feature wants to cause: the owner asks the borrower.
  // There is deliberately no chat with the assistant.
  it('points the questions at the borrower', () => {
    const { getByText } = renderPanel()

    expect(getByText('Worth asking them')).toBeTruthy()
  })

  it('says nothing about questions when there are none', () => {
    const { queryByTestId } = renderPanel({ assessment: makeAssessment({ questions: [] }) })

    expect(queryByTestId('assessment-questions')).toBeNull()
  })

  describe('while it is being read', () => {
    it('says so', () => {
      const { getByTestId } = renderPanel({ assessment: undefined, isLoading: true })

      expect(getByTestId('assessment-loading')).toBeTruthy()
    })

    it('keeps the previous reading on screen while it is redone', () => {
      const { getByTestId, queryByTestId } = renderPanel({ isLoading: true })

      expect(queryByTestId('assessment-loading')).toBeNull()
      expect(getByTestId('assessment-summary')).toBeTruthy()
    })
  })

  describe('when there is none', () => {
    // The owner did not ask for this by name, and a notice about missing help
    // is worse than the absence it describes.
    it('renders nothing at all rather than apologising', () => {
      const { queryByTestId } = renderPanel({ assessment: undefined })

      expect(queryByTestId('assessment')).toBeNull()
      expect(queryByTestId('assessment-unavailable')).toBeNull()
    })

    it('stays silent when no agent is configured, which is ordinary', () => {
      const { queryByTestId } = renderPanel({ assessment: undefined, unavailable: 'not-configured' })

      expect(queryByTestId('assessment-unavailable')).toBeNull()
    })

    // Something being wrong is worth one quiet line, because the owner may be
    // waiting for it.
    it('says so when the assistant could not be reached', () => {
      const { getByTestId } = renderPanel({ assessment: undefined, unavailable: 'unreachable' })

      expect(getByTestId('assessment-unavailable')).toHaveTextContent(/could not be reached/)
    })

    // Nobody's fault and nothing broken — but the one an owner would otherwise
    // keep tapping at, so it says plainly that today is spent.
    it('says today is spent when the daily cap is reached', () => {
      const { getByTestId } = renderPanel({ assessment: undefined, unavailable: 'quota-reached' })

      expect(getByTestId('assessment-unavailable')).toHaveTextContent(/today’s readings/)
    })

    // The card already reports an unreadable pool; a second notice repeats it.
    it('stays silent for a pool whose figures cannot be printed', () => {
      const { queryByTestId } = renderPanel({ assessment: undefined, unavailable: 'unsupported-denomination' })

      expect(queryByTestId('assessment-unavailable')).toBeNull()
    })
  })

  describe('staleness', () => {
    // `approveLoan` checks liquidity at approval rather than at request time,
    // so a reading taken when the pool held 80 is describing a pool that no
    // longer exists once it holds 5.
    it('flags a reading made against a pool that has since emptied', () => {
      const { getByTestId } = renderPanel({ available: 5_000_000_000_000_000_000n })

      expect(getByTestId('assessment-stale')).toBeTruthy()
    })

    it('stays quiet while the pool holds roughly what it did', () => {
      const { queryByTestId } = renderPanel({ available: 75_000_000_000_000_000_000n })

      expect(queryByTestId('assessment-stale')).toBeNull()
    })

    it('says nothing about staleness when the balance is unknown', () => {
      const { queryByTestId } = renderPanel({ available: undefined })

      expect(queryByTestId('assessment-stale')).toBeNull()
    })
  })

  describe('reading it again', () => {
    it('offers it, because it costs a model call and is the owner’s call', () => {
      const onRefresh = jest.fn()
      const { getByTestId } = renderPanel({ onRefresh })

      fireEvent.press(getByTestId('assessment-refresh'))

      expect(onRefresh).toHaveBeenCalled()
    })

    it('does not offer it where the screen has nothing to refresh with', () => {
      const { queryByTestId } = renderPanel()

      expect(queryByTestId('assessment-refresh')).toBeNull()
    })
  })
})
