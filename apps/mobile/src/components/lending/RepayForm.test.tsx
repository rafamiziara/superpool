import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { parseEther } from 'viem'
import { RepayForm } from './RepayForm'

/** 4 POL borrowed, 0.2 POL of interest accrued against it so far. */
const BORROWED = parseEther('4')
const PRINCIPAL = parseEther('4')
const INTEREST = parseEther('0.2')
const OUTSTANDING = PRINCIPAL + INTEREST
/** What the screen would send to settle: the debt plus an hour of head-room. */
const QUOTE = OUTSTANDING + parseEther('0.001')

function renderForm(props: Partial<React.ComponentProps<typeof RepayForm>> = {}) {
  const onSubmit = jest.fn()

  render(
    <RepayForm
      poolName="Neighbourhood Fund"
      loanId={3}
      borrowed={BORROWED}
      principal={PRINCIPAL}
      interest={INTEREST}
      amountRepaid={0n}
      settlementQuote={QUOTE}
      onSubmit={onSubmit}
      {...props}
    />
  )

  return { onSubmit }
}

/** Types an amount and blurs, which is what reveals field errors. */
function enter(amount: string) {
  fireEvent.changeText(screen.getByTestId('repay-amount'), amount)
  fireEvent(screen.getByTestId('repay-amount'), 'blur')
}

describe('RepayForm', () => {
  it('names the pool and the loan', () => {
    renderForm()

    expect(screen.getByText('Neighbourhood Fund')).toBeTruthy()
    expect(screen.getByText(/loan #3/)).toBeTruthy()
  })

  /**
   * The split is the point of an accruing rate: one half stops growing when it
   * is paid, the other keeps growing until it is.
   */
  it('shows what the debt is made of', () => {
    renderForm()

    expect(screen.getByTestId('repay-breakdown')).toHaveTextContent(/4 POL borrowed back/)
    expect(screen.getByTestId('repay-breakdown')).toHaveTextContent(/0\.2 POL interest so far/)
  })

  it('starts filled with the whole outstanding balance', () => {
    renderForm()

    expect(screen.getByTestId('repay-submit')).toHaveTextContent(/Repay 4\.2 POL/)
  })

  /**
   * The one thing this form does that its numbers do not show.
   *
   * Interest grows while the wallet is being signed, so sending exactly the
   * balance lands a few seconds short and quietly leaves the loan open. The
   * excess is refunded, so the borrower is never out of pocket.
   */
  it('sends the buffered quote when settling, not the figure on screen', () => {
    const { onSubmit } = renderForm()

    fireEvent.press(screen.getByTestId('repay-submit'))

    expect(onSubmit).toHaveBeenCalledWith(QUOTE)
  })

  it('says so, rather than surprising the wallet', () => {
    renderForm()

    expect(screen.getByTestId('repay-settle-note')).toHaveTextContent(/comes straight back/)
  })

  it('sends exactly what was typed for a part payment', () => {
    const { onSubmit } = renderForm()

    enter('1.5')
    fireEvent.press(screen.getByTestId('repay-submit'))

    expect(onSubmit).toHaveBeenCalledWith(parseEther('1.5'))
    expect(screen.queryByTestId('repay-settle-note')).toBeNull()
  })

  it('converts POL to wei on submit', () => {
    const { onSubmit } = renderForm()

    enter('0.75')
    fireEvent.press(screen.getByTestId('repay-submit'))

    expect(onSubmit).toHaveBeenCalledWith(parseEther('0.75'))
  })

  it('reports what has been paid once something has', () => {
    renderForm({ amountRepaid: parseEther('1.2') })

    expect(screen.getByTestId('repay-progress')).toHaveTextContent(/1\.2 POL/)
  })

  it('says nothing about progress on an untouched loan', () => {
    renderForm()

    expect(screen.queryByTestId('repay-progress')).toBeNull()
  })

  /**
   * The borrower is choosing to stay in debt, and the three things that follow
   * — the loan stays open, their one slot stays taken, and the rest keeps
   * accruing — are worth saying before they sign rather than after.
   */
  it('warns that a part payment leaves the loan open and still building', () => {
    renderForm()

    enter('1.5')

    expect(screen.getByTestId('repay-partial-note')).toHaveTextContent(/2\.7 POL will still be owed/)
    expect(screen.getByTestId('repay-partial-note')).toHaveTextContent(/keep building interest/)
  })

  it('says nothing of the sort when the payment settles it', () => {
    renderForm()

    enter('4.2')

    expect(screen.queryByTestId('repay-partial-note')).toBeNull()
  })

  it('refuses more than is owed rather than relying on the refund', () => {
    const { onSubmit } = renderForm()

    enter('10')

    expect(screen.getByTestId('repay-exceeds-owed')).toBeTruthy()
    fireEvent.press(screen.getByTestId('repay-submit'))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('refuses zero, which the contract rejects as InvalidAmount', () => {
    const { onSubmit } = renderForm()

    enter('0')

    expect(screen.getByTestId('repay-amount-error')).toHaveTextContent(/greater than zero/)
    fireEvent.press(screen.getByTestId('repay-submit'))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('refuses something that is not a number', () => {
    const { onSubmit } = renderForm()

    enter('a lot')

    expect(screen.getByTestId('repay-amount-error')).toBeTruthy()
    fireEvent.press(screen.getByTestId('repay-submit'))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('restores the full balance from “Pay it off”', () => {
    const { onSubmit } = renderForm()

    enter('1')
    fireEvent.press(screen.getByTestId('repay-full'))
    fireEvent.press(screen.getByTestId('repay-submit'))

    expect(onSubmit).toHaveBeenCalledWith(QUOTE)
  })

  it('names the amount on the button', () => {
    renderForm()

    enter('1.5')

    expect(screen.getByTestId('repay-submit')).toHaveTextContent(/Repay 1\.5 POL/)
  })

  it('does not submit twice while one is in flight', () => {
    const { onSubmit } = renderForm({ isSubmitting: true })

    fireEvent.press(screen.getByTestId('repay-submit'))

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows the flow’s error above the button', () => {
    renderForm({ error: 'This loan belongs to another wallet' })

    expect(screen.getByTestId('repay-error')).toHaveTextContent('This loan belongs to another wallet')
  })
})
