import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'
import { ConnectWalletButton } from './ConnectWalletButton'

jest.mock('@reown/appkit-wagmi-react-native', () => {
  const open = jest.fn()
  return {
    useAppKit: () => ({ open, close: jest.fn() }),
    __open: open,
  }
})

const { __open: mockOpen } = jest.requireMock('@reown/appkit-wagmi-react-native')

describe('ConnectWalletButton', () => {
  beforeEach(() => {
    mockOpen.mockClear()
  })

  it('should render the default label', () => {
    const { getByTestId, getByText } = render(<ConnectWalletButton />)

    expect(getByTestId('connect-wallet-button')).toBeTruthy()
    expect(getByText('Connect Wallet')).toBeTruthy()
  })

  it('should accept a custom label and testID', () => {
    const { getByTestId, getByText } = render(<ConnectWalletButton label="Link a wallet" testID="custom-connect" />)

    expect(getByTestId('custom-connect')).toBeTruthy()
    expect(getByText('Link a wallet')).toBeTruthy()
  })

  it('should open the AppKit modal when pressed', () => {
    const { getByTestId } = render(<ConnectWalletButton />)

    fireEvent.press(getByTestId('connect-wallet-button'))

    expect(mockOpen).toHaveBeenCalledTimes(1)
  })

  it('should announce itself as a button', () => {
    const { getByTestId } = render(<ConnectWalletButton />)

    const button = getByTestId('connect-wallet-button')
    expect(button.props.accessibilityRole).toBe('button')
    expect(button.props.accessibilityLabel).toBe('Connect Wallet')
  })
})
