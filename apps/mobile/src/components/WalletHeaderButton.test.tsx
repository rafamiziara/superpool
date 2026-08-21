import { render } from '@testing-library/react-native'
import React from 'react'
import { useAccount } from 'wagmi'
import { WalletHeaderButton } from './WalletHeaderButton'

jest.mock('@reown/appkit-wagmi-react-native', () => ({
  AppKitButton: () => {
    const { View } = jest.requireActual('react-native')
    return <View testID="appkit-button" />
  },
}))

jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
}))

const mockUseAccount = useAccount as unknown as jest.Mock

describe('WalletHeaderButton', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // The placeholder exists to hide AppKit's bright connect pill while a stored
  // WalletConnect session is being restored on an already-authenticated screen.
  it.each(['connecting', 'reconnecting'])('should stand in a placeholder while the status is %s', (status) => {
    mockUseAccount.mockReturnValue({ status })

    const { getByTestId, queryByTestId } = render(<WalletHeaderButton />)

    expect(getByTestId('wallet-header-placeholder')).toBeTruthy()
    expect(queryByTestId('appkit-button')).toBeNull()
  })

  it('should render the wallet button once connected', () => {
    mockUseAccount.mockReturnValue({ status: 'connected' })

    const { getByTestId, queryByTestId } = render(<WalletHeaderButton />)

    expect(getByTestId('appkit-button')).toBeTruthy()
    expect(queryByTestId('wallet-header-placeholder')).toBeNull()
  })

  it('should render the wallet button when disconnected so there is a way back', () => {
    mockUseAccount.mockReturnValue({ status: 'disconnected' })

    const { getByTestId } = render(<WalletHeaderButton />)

    expect(getByTestId('appkit-button')).toBeTruthy()
  })
})
