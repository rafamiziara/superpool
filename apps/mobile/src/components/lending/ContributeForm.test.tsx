import React from 'react'
import { parseEther } from 'viem'
import { fireEvent, render } from '../../__tests__/test-utils'
import { NATIVE } from '../../__tests__/fixtures/denomination'
import { ContributeForm } from './ContributeForm'

const POOL_NAME = 'Neighbourhood Fund'

function renderForm(props: Partial<React.ComponentProps<typeof ContributeForm>> = {}) {
  const onSubmit = jest.fn()
  const utils = render(<ContributeForm poolName={POOL_NAME} denomination={NATIVE} onSubmit={onSubmit} {...props} />)

  return { ...utils, onSubmit }
}

/** Types an amount and leaves the field, which is what reveals errors. */
function enterAmount(getByTestId: ReturnType<typeof render>['getByTestId'], value: string) {
  fireEvent.changeText(getByTestId('contribute-amount'), value)
  fireEvent(getByTestId('contribute-amount'), 'blur')
}

describe('ContributeForm', () => {
  it('names the pool the money is going to', () => {
    const { getByText } = renderForm()

    expect(getByText(POOL_NAME)).toBeTruthy()
  })

  it('starts with the submit button disabled', () => {
    const { getByTestId } = renderForm()

    expect(getByTestId('contribute-submit').props.accessibilityState.disabled).toBe(true)
  })

  it('converts POL to wei before handing the amount over', () => {
    // People think in POL, the contract takes wei; the form is where that
    // translation happens so the hook and the screen never do it again.
    const { getByTestId, onSubmit } = renderForm()

    enterAmount(getByTestId, '2.5')
    fireEvent.press(getByTestId('contribute-submit'))

    expect(onSubmit).toHaveBeenCalledWith(parseEther('2.5'))
  })

  it('accepts a whole number', () => {
    const { getByTestId, onSubmit } = renderForm()

    enterAmount(getByTestId, '10')
    fireEvent.press(getByTestId('contribute-submit'))

    expect(onSubmit).toHaveBeenCalledWith(parseEther('10'))
  })

  it('does not scold an amount the user has not finished typing', () => {
    const { getByTestId, queryByTestId } = renderForm()

    fireEvent.changeText(getByTestId('contribute-amount'), '')

    expect(queryByTestId('contribute-amount-error')).toBeNull()
  })

  it.each([
    ['an empty amount', '', 'Enter an amount'],
    ['a non-numeric amount', 'ten', 'Enter an amount in POL, with at most 18 decimals'],
    ['more than 18 decimals', '1.0000000000000000001', 'Enter an amount in POL, with at most 18 decimals'],
    ['a negative amount', '-5', 'Enter an amount in POL, with at most 18 decimals'],
    ['zero', '0', 'Enter an amount greater than zero'],
  ])('rejects %s once the field is left', (_label, value, message) => {
    const { getByTestId } = renderForm()

    enterAmount(getByTestId, value)

    expect(getByTestId('contribute-amount-error').props.children).toBe(message)
    expect(getByTestId('contribute-submit').props.accessibilityState.disabled).toBe(true)
  })

  it('does not submit an invalid amount', () => {
    const { getByTestId, onSubmit } = renderForm()

    enterAmount(getByTestId, '0')
    fireEvent.press(getByTestId('contribute-submit'))

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows the existing position when there is one', () => {
    const { getByTestId } = renderForm({ currentPosition: parseEther('12') })

    expect(getByTestId('contribute-current-position').props.children).toContain('12 POL')
  })

  it('omits the position line for a first contribution', () => {
    const { queryByTestId } = renderForm({ currentPosition: 0n })

    expect(queryByTestId('contribute-current-position')).toBeNull()
  })

  it('shows the wallet balance as a hint', () => {
    const { getByText } = renderForm({ walletBalance: parseEther('40') })

    expect(getByText('In POL — your wallet holds 40 POL')).toBeTruthy()
  })

  it('warns when the amount exceeds the wallet balance', () => {
    const { getByTestId } = renderForm({ walletBalance: parseEther('1') })

    enterAmount(getByTestId, '5')

    expect(getByTestId('contribute-exceeds-balance')).toBeTruthy()
  })

  it('still allows submitting an amount above the balance', () => {
    // A warning, not a validation failure: the balance read can be stale, and
    // the definitive answer is the pre-flight estimate in useContribution.
    const { getByTestId, onSubmit } = renderForm({ walletBalance: parseEther('1') })

    enterAmount(getByTestId, '5')
    fireEvent.press(getByTestId('contribute-submit'))

    expect(onSubmit).toHaveBeenCalledWith(parseEther('5'))
  })

  it('does not warn when the amount fits', () => {
    const { getByTestId, queryByTestId } = renderForm({ walletBalance: parseEther('10') })

    enterAmount(getByTestId, '5')

    expect(queryByTestId('contribute-exceeds-balance')).toBeNull()
  })

  it('shows the flow error above the button', () => {
    const { getByTestId } = renderForm({ error: 'Transaction cancelled' })

    expect(getByTestId('contribute-error').props.children).toBe('Transaction cancelled')
  })

  it('disables the button and reports progress while submitting', () => {
    const { getByTestId, getByText } = renderForm({ isSubmitting: true })

    expect(getByTestId('contribute-submit').props.accessibilityState.disabled).toBe(true)
    expect(getByText('Submitting…')).toBeTruthy()
  })

  it('ignores a press while submitting', () => {
    const { getByTestId, onSubmit } = renderForm({ isSubmitting: true })

    enterAmount(getByTestId, '5')
    fireEvent.press(getByTestId('contribute-submit'))

    expect(onSubmit).not.toHaveBeenCalled()
  })
})
