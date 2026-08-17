import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { parseEther } from 'viem'
import { CreatePoolForm, createPoolFormSchema } from './CreatePoolForm'
import { NATIVE } from '../../__tests__/fixtures/denomination'

/** Fills every field with values that parse, so tests can vary one at a time. */
function fillValidForm(overrides: Partial<Record<string, string>> = {}) {
  const values: Record<string, string> = {
    'create-pool-name': 'Neighbourhood Fund',
    'create-pool-description': 'Micro-loans for the block',
    'create-pool-max-loan': '100',
    'create-pool-interest-rate': '5',
    'create-pool-loan-duration': '30',
    ...overrides,
  }

  for (const [testID, value] of Object.entries(values)) {
    fireEvent.changeText(screen.getByTestId(testID), value)
  }
}

describe('createPoolFormSchema', () => {
  const validInput = {
    name: 'Neighbourhood Fund',
    description: 'Micro-loans for the block',
    maxLoanAmount: '100',
    interestRate: '5',
    loanDuration: '30',
  }

  it('converts the units the user types into the units the contract takes', () => {
    const parsed = createPoolFormSchema(NATIVE).parse(validInput)

    expect(parsed).toEqual({
      name: 'Neighbourhood Fund',
      description: 'Micro-loans for the block',
      maxLoanAmount: parseEther('100'),
      interestRate: 500,
      loanDuration: 2_592_000,
    })
  })

  it('keeps sub-percent rates exact in basis points', () => {
    expect(createPoolFormSchema(NATIVE).parse({ ...validInput, interestRate: '7.25' }).interestRate).toBe(725)
  })

  it('accepts a fractional amount', () => {
    expect(createPoolFormSchema(NATIVE).parse({ ...validInput, maxLoanAmount: '0.5' }).maxLoanAmount).toBe(parseEther('0.5'))
  })

  it('trims surrounding whitespace from the name', () => {
    expect(createPoolFormSchema(NATIVE).parse({ ...validInput, name: '  Fund  ' }).name).toBe('Fund')
  })

  it('accepts an empty description', () => {
    expect(createPoolFormSchema(NATIVE).parse({ ...validInput, description: '' }).description).toBe('')
  })

  it('allows the contract ceiling of exactly 100%', () => {
    expect(createPoolFormSchema(NATIVE).parse({ ...validInput, interestRate: '100' }).interestRate).toBe(10_000)
  })

  it.each([
    ['an empty name', { name: '' }, 'Pool name is required'],
    ['a name of only spaces', { name: '   ' }, 'Pool name is required'],
    ['an over-long name', { name: 'x'.repeat(65) }, 'Use 64 characters or fewer'],
    ['an over-long description', { description: 'x'.repeat(257) }, 'Use 256 characters or fewer'],
    ['a missing amount', { maxLoanAmount: '' }, 'Enter a maximum loan amount'],
    ['a non-numeric amount', { maxLoanAmount: 'ten' }, 'Enter an amount in POL, with at most 18 decimals'],
    ['a negative amount', { maxLoanAmount: '-5' }, 'Enter an amount in POL, with at most 18 decimals'],
    ['an amount below one wei', { maxLoanAmount: '0.0000000000000000001' }, 'Enter an amount in POL, with at most 18 decimals'],
    ['a zero amount', { maxLoanAmount: '0' }, 'Maximum loan amount must be greater than zero'],
    ['a missing rate', { interestRate: '' }, 'Enter an interest rate'],
    ['a rate with too many decimals', { interestRate: '5.555' }, 'Enter a percentage, with at most 2 decimals'],
    ['a rate above 100%', { interestRate: '101' }, 'Interest rate cannot exceed 100%'],
    ['a missing duration', { loanDuration: '' }, 'Enter a loan duration'],
    ['a fractional duration', { loanDuration: '1.5' }, 'Enter a whole number of days'],
    ['a zero duration', { loanDuration: '0' }, 'Loan duration must be at least one day'],
  ])('rejects %s', (_label, overrides, expected) => {
    const result = createPoolFormSchema(NATIVE).safeParse({ ...validInput, ...overrides })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toBe(expected)
  })
})

describe('CreatePoolForm', () => {
  let onSubmit: jest.Mock

  beforeEach(() => {
    onSubmit = jest.fn()
  })

  it('renders every field', () => {
    render(<CreatePoolForm denomination={NATIVE} onSubmit={onSubmit} />)

    expect(screen.getByTestId('create-pool-name')).toBeTruthy()
    expect(screen.getByTestId('create-pool-description')).toBeTruthy()
    expect(screen.getByTestId('create-pool-max-loan')).toBeTruthy()
    expect(screen.getByTestId('create-pool-interest-rate')).toBeTruthy()
    expect(screen.getByTestId('create-pool-loan-duration')).toBeTruthy()
  })

  it('starts with submission disabled', () => {
    render(<CreatePoolForm denomination={NATIVE} onSubmit={onSubmit} />)

    expect(screen.getByTestId('create-pool-submit').props.accessibilityState.disabled).toBe(true)
  })

  it('submits the converted parameters once every field parses', () => {
    render(<CreatePoolForm denomination={NATIVE} onSubmit={onSubmit} />)

    fillValidForm()
    fireEvent.press(screen.getByTestId('create-pool-submit'))

    expect(onSubmit).toHaveBeenCalledWith({
      denomination: NATIVE,
      name: 'Neighbourhood Fund',
      description: 'Micro-loans for the block',
      maxLoanAmount: parseEther('100'),
      interestRate: 500,
      loanDuration: 2_592_000,
      // Defaulted on: a private circle is what the product is for, and a pool
      // opened by accident cannot be un-opened for whoever funded it meanwhile.
      requiresMembership: true,
    })
  })

  it('submits an open pool when the switch is turned off', () => {
    render(<CreatePoolForm denomination={NATIVE} onSubmit={onSubmit} />)

    fillValidForm()
    fireEvent.press(screen.getByTestId('create-pool-private'))
    fireEvent.press(screen.getByTestId('create-pool-submit'))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ requiresMembership: false }))
  })

  it('enables submission without a description', () => {
    render(<CreatePoolForm denomination={NATIVE} onSubmit={onSubmit} />)

    fillValidForm({ 'create-pool-description': '' })

    expect(screen.getByTestId('create-pool-submit').props.accessibilityState.disabled).toBe(false)
  })

  it('does not submit while a field is invalid', () => {
    render(<CreatePoolForm denomination={NATIVE} onSubmit={onSubmit} />)

    fillValidForm({ 'create-pool-interest-rate': '150' })
    fireEvent.press(screen.getByTestId('create-pool-submit'))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByTestId('create-pool-submit').props.accessibilityState.disabled).toBe(true)
  })

  describe('inline errors', () => {
    it('stays quiet while a field is still being typed in', () => {
      render(<CreatePoolForm denomination={NATIVE} onSubmit={onSubmit} />)

      fireEvent.changeText(screen.getByTestId('create-pool-max-loan'), 'ten')

      expect(screen.queryByTestId('create-pool-max-loan-error')).toBeNull()
    })

    it('shows the message once the field is left', () => {
      render(<CreatePoolForm denomination={NATIVE} onSubmit={onSubmit} />)

      fireEvent.changeText(screen.getByTestId('create-pool-max-loan'), 'ten')
      fireEvent(screen.getByTestId('create-pool-max-loan'), 'blur')

      expect(screen.getByTestId('create-pool-max-loan-error')).toHaveTextContent('Enter an amount in POL, with at most 18 decimals')
    })

    it('clears the message once the field is corrected', () => {
      render(<CreatePoolForm denomination={NATIVE} onSubmit={onSubmit} />)

      fireEvent.changeText(screen.getByTestId('create-pool-interest-rate'), '500')
      fireEvent(screen.getByTestId('create-pool-interest-rate'), 'blur')
      expect(screen.getByTestId('create-pool-interest-rate-error')).toBeTruthy()

      fireEvent.changeText(screen.getByTestId('create-pool-interest-rate'), '5')

      expect(screen.queryByTestId('create-pool-interest-rate-error')).toBeNull()
    })

    it('reports each invalid field independently', () => {
      render(<CreatePoolForm denomination={NATIVE} onSubmit={onSubmit} />)

      fireEvent(screen.getByTestId('create-pool-name'), 'blur')
      fireEvent(screen.getByTestId('create-pool-loan-duration'), 'blur')

      expect(screen.getByTestId('create-pool-name-error')).toHaveTextContent('Pool name is required')
      expect(screen.getByTestId('create-pool-loan-duration-error')).toHaveTextContent('Enter a loan duration')
      expect(screen.queryByTestId('create-pool-max-loan-error')).toBeNull()
    })
  })

  describe('flow state', () => {
    it('blocks submission and relabels the button while submitting', () => {
      render(<CreatePoolForm denomination={NATIVE} onSubmit={onSubmit} isSubmitting />)

      fillValidForm()
      fireEvent.press(screen.getByTestId('create-pool-submit'))

      expect(onSubmit).not.toHaveBeenCalled()
      expect(screen.getByText('Submitting…')).toBeTruthy()
    })

    it('shows the flow error', () => {
      render(<CreatePoolForm denomination={NATIVE} onSubmit={onSubmit} error="Transaction cancelled" />)

      expect(screen.getByTestId('create-pool-error')).toHaveTextContent('Transaction cancelled')
    })

    it('shows a gas estimate when the screen supplies one', () => {
      render(<CreatePoolForm denomination={NATIVE} onSubmit={onSubmit} gasEstimate="0.0021 POL" />)

      expect(screen.getByTestId('create-pool-gas-estimate')).toHaveTextContent('0.0021 POL')
    })

    it('omits the fee row when there is no estimate', () => {
      render(<CreatePoolForm denomination={NATIVE} onSubmit={onSubmit} />)

      expect(screen.queryByTestId('create-pool-gas-estimate')).toBeNull()
    })

    it('honours a custom submit label', () => {
      render(<CreatePoolForm denomination={NATIVE} onSubmit={onSubmit} submitLabel="Launch pool" />)

      expect(screen.getByText('Launch pool')).toBeTruthy()
    })
  })
})
