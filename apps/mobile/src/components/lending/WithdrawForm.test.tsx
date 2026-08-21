import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { parseEther } from 'viem'
import { WithdrawForm } from './WithdrawForm'
import { NATIVE } from '../../__tests__/fixtures/denomination'

const POSITION = parseEther('10')

function renderForm(props: Partial<React.ComponentProps<typeof WithdrawForm>> = {}) {
  const onSubmit = jest.fn()

  render(
    <WithdrawForm
      poolName="Neighbourhood Fund"
      denomination={NATIVE}
      position={POSITION}
      withdrawable={POSITION}
      onSubmit={onSubmit}
      {...props}
    />
  )

  return { onSubmit }
}

/** Types an amount and blurs, which is what reveals field errors. */
function enter(amount: string) {
  fireEvent.changeText(screen.getByTestId('withdraw-amount'), amount)
  fireEvent(screen.getByTestId('withdraw-amount'), 'blur')
}

describe('WithdrawForm', () => {
  it('names the pool and the position', () => {
    renderForm()

    expect(screen.getByText('Neighbourhood Fund')).toBeTruthy()
    expect(screen.getByTestId('withdraw-position')).toHaveTextContent(/10 POL/)
  })

  it('converts POL to wei on submit', () => {
    // People think in POL, the contract takes wei — and the screen must not
    // convert a second time.
    const { onSubmit } = renderForm()

    enter('2.5')
    fireEvent.press(screen.getByTestId('withdraw-submit'))

    expect(onSubmit).toHaveBeenCalledWith(parseEther('2.5'))
  })

  it('fills the maximum from the chain value', () => {
    const { onSubmit } = renderForm({ withdrawable: parseEther('3.25') })

    fireEvent.press(screen.getByTestId('withdraw-max'))
    fireEvent.press(screen.getByTestId('withdraw-submit'))

    // Round-trips exactly: the filled string has to reparse to the same wei.
    expect(onSubmit).toHaveBeenCalledWith(parseEther('3.25'))
  })

  it('offers no max button when there is nothing to withdraw', () => {
    renderForm({ withdrawable: 0n })

    expect(screen.queryByTestId('withdraw-max')).toBeNull()
  })

  it.each([
    ['an empty amount', ''],
    ['a non-numeric amount', 'abc'],
    ['more than 18 decimals', '1.0000000000000000001'],
    ['zero', '0'],
  ])('refuses to submit %s', (_label, amount) => {
    const { onSubmit } = renderForm()

    enter(amount)
    fireEvent.press(screen.getByTestId('withdraw-submit'))

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('blocks an amount above the position, and says so', () => {
    const { onSubmit } = renderForm()

    enter('11')

    expect(screen.getByTestId('withdraw-exceeds-position')).toBeTruthy()
    fireEvent.press(screen.getByTestId('withdraw-submit'))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('blocks an amount above the free liquidity with different wording', () => {
    // Distinct from the position case: the money is theirs, the pool just
    // cannot pay it right now, so the copy must not say they lack the funds.
    const { onSubmit } = renderForm({ position: POSITION, withdrawable: parseEther('4') })

    enter('6')

    expect(screen.queryByTestId('withdraw-exceeds-position')).toBeNull()
    expect(screen.getByTestId('withdraw-exceeds-liquidity')).toBeTruthy()
    fireEvent.press(screen.getByTestId('withdraw-submit'))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('flags when liquidity caps the position', () => {
    renderForm({ position: POSITION, withdrawable: parseEther('4') })

    expect(screen.getByTestId('withdraw-liquidity-capped')).toBeTruthy()
  })

  it('says nothing about liquidity when the whole position is available', () => {
    renderForm()

    expect(screen.queryByTestId('withdraw-liquidity-capped')).toBeNull()
  })

  it('allows exactly the withdrawable amount', () => {
    const { onSubmit } = renderForm({ position: POSITION, withdrawable: parseEther('4') })

    enter('4')
    fireEvent.press(screen.getByTestId('withdraw-submit'))

    expect(onSubmit).toHaveBeenCalledWith(parseEther('4'))
  })

  it('does not scold before the field is left', () => {
    render(<WithdrawForm poolName="Neighbourhood Fund" denomination={NATIVE} onSubmit={jest.fn()} />)

    fireEvent.changeText(screen.getByTestId('withdraw-amount'), 'abc')

    expect(screen.queryByTestId('withdraw-amount-error')).toBeNull()
  })

  it('shows the flow error passed in', () => {
    renderForm({ error: 'Transaction cancelled' })

    expect(screen.getByTestId('withdraw-error')).toHaveTextContent('Transaction cancelled')
  })

  it('refuses to submit twice while submitting', () => {
    const { onSubmit } = renderForm({ isSubmitting: true })

    enter('2')
    fireEvent.press(screen.getByTestId('withdraw-submit'))

    expect(onSubmit).not.toHaveBeenCalled()
  })
})
