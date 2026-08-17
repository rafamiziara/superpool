import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { parseEther } from 'viem'
import { RepayForm } from './RepayForm'

/** 4 POL at 500bp: 4.2 to settle. */
const PRINCIPAL = parseEther('4')
const TOTAL_OWED = parseEther('4.2')

function renderForm(props: Partial<React.ComponentProps<typeof RepayForm>> = {}) {
  const onSubmit = jest.fn()

  render(
    <RepayForm
      poolName="Neighbourhood Fund"
      loanId={3}
      principal={PRINCIPAL}
      totalOwed={TOTAL_OWED}
      amountRepaid={0n}
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
   * Settling is what a borrower opening this screen usually means to do, and
   * it was the only thing they could do before instalments existed. Paying in
   * full stays one tap; paying part of it is an edit.
   */
  it('starts filled with the whole outstanding balance', () => {
    const { onSubmit } = renderForm()

    fireEvent.press(screen.getByTestId('repay-submit'))

    expect(onSubmit).toHaveBeenCalledWith(TOTAL_OWED)
  })

  it('starts filled with what is left when part is already paid', () => {
    const { onSubmit } = renderForm({ amountRepaid: parseEther('1.2') })

    fireEvent.press(screen.getByTestId('repay-submit'))

    expect(onSubmit).toHaveBeenCalledWith(parseEther('3'))
  })

  it('converts POL to wei on submit', () => {
    const { onSubmit } = renderForm()

    enter('1.5')
    fireEvent.press(screen.getByTestId('repay-submit'))

    expect(onSubmit).toHaveBeenCalledWith(parseEther('1.5'))
  })

  it('reports progress once something has been paid', () => {
    renderForm({ amountRepaid: parseEther('1.2') })

    expect(screen.getByTestId('repay-progress')).toHaveTextContent(/1\.2 of 4\.2/)
  })

  it('says nothing about progress on an untouched loan', () => {
    renderForm()

    expect(screen.queryByTestId('repay-progress')).toBeNull()
  })

  /**
   * The borrower is choosing to stay in debt, and the two things that follow —
   * the loan stays open, and their one slot in this pool stays taken — are
   * worth saying before they sign rather than after.
   */
  it('warns that a part payment leaves the loan open', () => {
    renderForm()

    enter('1.5')

    expect(screen.getByTestId('repay-partial-note')).toHaveTextContent(/2\.7 POL will still be owed/)
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

  it('restores the full balance from “Pay in full”', () => {
    const { onSubmit } = renderForm()

    enter('1')
    fireEvent.press(screen.getByTestId('repay-full'))
    fireEvent.press(screen.getByTestId('repay-submit'))

    expect(onSubmit).toHaveBeenCalledWith(TOTAL_OWED)
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
