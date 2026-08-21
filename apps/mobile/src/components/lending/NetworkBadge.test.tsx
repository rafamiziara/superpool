import React from 'react'
import { render } from '../../__tests__/test-utils'
import { NetworkBadge } from './NetworkBadge'

describe('NetworkBadge', () => {
  it('names the chain the app is showing', () => {
    const { getByText } = render(<NetworkBadge chainId={80002} />)

    expect(getByText('Polygon Amoy')).toBeTruthy()
  })

  it('uses the app’s name for a chain, not viem’s', () => {
    // Viem calls 31337 "Hardhat"; the network picker calls it Localhost, and
    // the badge has to agree with the picker the user just used.
    const { getByText } = render(<NetworkBadge chainId={31337} />)

    expect(getByText('Localhost')).toBeTruthy()
  })

  it('falls back to the raw id for a chain it does not know', () => {
    // Better than an empty pill: a wallet on an unconfigured chain is exactly
    // the case where the user needs to be told which one they are on.
    const { getByText } = render(<NetworkBadge chainId={999_999} />)

    expect(getByText('Chain 999999')).toBeTruthy()
  })

  it('takes a testID so several screens can carry one', () => {
    const { getByTestId } = render(<NetworkBadge chainId={80002} testID="pools-network" />)

    expect(getByTestId('pools-network')).toBeTruthy()
  })
})
