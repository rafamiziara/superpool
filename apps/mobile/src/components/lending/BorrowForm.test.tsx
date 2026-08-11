import React from 'react'
import { fireEvent, render } from '../../__tests__/test-utils'
import { BorrowForm } from './BorrowForm'

const POOL_NAME = 'Neighbourhood Fund'
const MAX_LOAN = 10_000_000_000_000_000_000n // 10 POL
const INTEREST_RATE = 500 // 5%
const DURATION = 2_592_000 // 30 days

function renderForm(props: Partial<React.ComponentProps<typeof BorrowForm>> = {}) {
  const onSubmit = jest.fn()
  const utils = render(
    <BorrowForm
      poolName={POOL_NAME}
      maxLoanAmount={MAX_LOAN}
      interestRate={INTEREST_RATE}
      loanDuration={DURATION}
      onSubmit={onSubmit}
      {...props}
    />
  )

  return { ...utils, onSubmit }
}

describe('BorrowForm', () => {
  it('names the pool and its terms', () => {
    const { getByText, getByTestId } = renderForm()

    expect(getByText(POOL_NAME)).toBeTruthy()
    expect(getByTestId('borrow-terms')).toBeTruthy()
  })

  it('submits the amount in wei', () => {
    // People type POL; the contract takes wei, and the conversion lives here.
    const { getByTestId, onSubmit } = renderForm()

    fireEvent.changeText(getByTestId('borrow-amount'), '2.5')
    fireEvent.press(getByTestId('borrow-submit'))

    expect(onSubmit).toHaveBeenCalledWith(2_500_000_000_000_000_000n)
  })

  it('shows what the loan will cost to repay', () => {
    // Fixed at creation, so a borrower who expects to save by repaying early
    // should learn otherwise before signing rather than after.
    const { getByTestId, getByText } = renderForm()

    fireEvent.changeText(getByTestId('borrow-amount'), '4')

    expect(getByTestId('borrow-repayment')).toBeTruthy()
    expect(getByText('4.2')).toBeTruthy()
  })

  it('blocks an amount above the pool’s per-loan cap', () => {
    // A contract rule, not a caution — `createLoan` reverts on it.
    const { getByTestId, onSubmit } = renderForm()

    fireEvent.changeText(getByTestId('borrow-amount'), '11')

    expect(getByTestId('borrow-exceeds-max')).toBeTruthy()
    fireEvent.press(getByTestId('borrow-submit'))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('blocks an amount above what the pool holds', () => {
    const { getByTestId, onSubmit } = renderForm({ available: 3_000_000_000_000_000_000n })

    fireEvent.changeText(getByTestId('borrow-amount'), '5')

    expect(getByTestId('borrow-exceeds-available')).toBeTruthy()
    fireEvent.press(getByTestId('borrow-submit'))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('reports the cap rather than the liquidity when both are exceeded', () => {
    // The cap is the more useful answer: waiting will not lift it.
    const { getByTestId, queryByTestId } = renderForm({ available: 3_000_000_000_000_000_000n })

    fireEvent.changeText(getByTestId('borrow-amount'), '50')

    expect(getByTestId('borrow-exceeds-max')).toBeTruthy()
    expect(queryByTestId('borrow-exceeds-available')).toBeNull()
  })

  it('shows the available liquidity when it is known', () => {
    const { getByTestId } = renderForm({ available: 7_000_000_000_000_000_000n })

    expect(getByTestId('borrow-available')).toBeTruthy()
  })

  it('holds back the field error until the field has been left', () => {
    // So the form does not scold someone mid-typing.
    const { getByTestId, queryByTestId } = renderForm()

    fireEvent.changeText(getByTestId('borrow-amount'), 'abc')
    expect(queryByTestId('borrow-amount-error')).toBeNull()

    fireEvent(getByTestId('borrow-amount'), 'blur')
    expect(getByTestId('borrow-amount-error')).toBeTruthy()
  })

  it('does not submit an unparseable amount', () => {
    const { getByTestId, onSubmit } = renderForm()

    fireEvent.changeText(getByTestId('borrow-amount'), 'abc')
    fireEvent.press(getByTestId('borrow-submit'))

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('does not submit while a previous attempt is in flight', () => {
    const { getByTestId, onSubmit } = renderForm({ isSubmitting: true })

    fireEvent.changeText(getByTestId('borrow-amount'), '1')
    fireEvent.press(getByTestId('borrow-submit'))

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows the flow error above the button', () => {
    const { getByTestId } = renderForm({ error: 'Contribute to this pool before borrowing from it' })

    expect(getByTestId('borrow-error')).toBeTruthy()
  })
})
