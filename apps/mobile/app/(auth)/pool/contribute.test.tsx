import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import React from 'react'
import { type Address, parseEther } from 'viem'
import { mockWagmiUseAccount, mockWagmiUseBalance } from '../../../src/__tests__/mocks'
import { mockLocalSearchParams, mockRouterBack, mockRouterReplace } from '../../../src/__tests__/setup'
import { poolStore } from '../../../src/stores/PoolStore'
import ContributeScreen from './contribute'

const WALLET_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const TX_HASH = '0xaaaa000000000000000000000000000000000000000000000000000000000001'
const LOCALHOST_CHAIN_ID = 31337

/** Pool 1 exists in the mock data the store loads. */
const POOL_ID = '1'

const mockContribute = jest.fn()
const mockWaitForTransaction = jest.fn()
const mockTriggerIndexing = jest.fn()
const mockReset = jest.fn()
let mockContributionError: string | null = null

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}))

jest.mock('../../../src/hooks/pools/useContribution', () => ({
  useContribution: () => ({
    contribute: mockContribute,
    isSubmitting: false,
    error: mockContributionError,
    reset: mockReset,
  }),
}))

jest.mock('../../../src/hooks/pools/useTransactionMonitoring', () => ({
  useTransactionMonitoring: () => ({ waitForTransaction: mockWaitForTransaction, isWaiting: false, error: null }),
}))

jest.mock('../../../src/hooks/pools/usePoolIndexing', () => ({
  usePoolIndexing: () => ({ triggerIndexing: mockTriggerIndexing, indexConfirmed: jest.fn(), isIndexing: false }),
}))

/** Enters an amount and presses submit, flushing the async flow. */
async function submitAmount(amount = '5') {
  fireEvent.changeText(screen.getByTestId('contribute-amount'), amount)
  await act(async () => {
    fireEvent.press(screen.getByTestId('contribute-submit'))
  })
}

describe('ContributeScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    mockContributionError = null

    mockLocalSearchParams.mockReturnValue({ poolId: POOL_ID })
    mockWagmiUseAccount.mockReturnValue({
      isConnected: true,
      isConnecting: false,
      address: WALLET_ADDRESS as Address,
      chainId: LOCALHOST_CHAIN_ID,
    })
    mockWagmiUseBalance.mockReturnValue({ data: { value: parseEther('50') } })

    mockContribute.mockResolvedValue(TX_HASH)
    mockWaitForTransaction.mockResolvedValue({ amount: parseEther('5').toString(), txHash: TX_HASH })
    mockTriggerIndexing.mockResolvedValue(undefined)

    await poolStore.fetchPools()
  })

  it('renders the form for the pool in the query parameter', () => {
    render(<ContributeScreen />)

    expect(screen.getByTestId('contribute-screen')).toBeTruthy()
    expect(screen.getByText(poolStore.poolById(Number(POOL_ID))!.name)).toBeTruthy()
  })

  it('falls back to a not-found state for a pool that is not loaded', () => {
    mockLocalSearchParams.mockReturnValue({ poolId: '9999' })

    render(<ContributeScreen />)

    expect(screen.getByTestId('contribute-pool-not-found')).toBeTruthy()
    expect(screen.queryByTestId('contribute-screen')).toBeNull()
  })

  it('goes back from the not-found state', () => {
    mockLocalSearchParams.mockReturnValue({ poolId: '9999' })

    render(<ContributeScreen />)
    fireEvent.press(screen.getByText('Go back'))

    expect(mockRouterBack).toHaveBeenCalled()
  })

  describe('the full flow', () => {
    it('contributes, confirms and indexes in order', async () => {
      render(<ContributeScreen />)

      await submitAmount('5')

      expect(mockContribute).toHaveBeenCalledWith({
        poolId: 1,
        poolAddress: poolStore.poolById(1)!.poolAddress,
        poolName: poolStore.poolById(1)!.name,
        amount: parseEther('5'),
      })
      expect(mockWaitForTransaction).toHaveBeenCalledWith(TX_HASH, 'CONTRIBUTE')
      expect(mockTriggerIndexing).toHaveBeenCalledWith(TX_HASH, 'CONTRIBUTE')

      expect(mockContribute.mock.invocationCallOrder[0]).toBeLessThan(mockWaitForTransaction.mock.invocationCallOrder[0])
      expect(mockWaitForTransaction.mock.invocationCallOrder[0]).toBeLessThan(mockTriggerIndexing.mock.invocationCallOrder[0])
    })

    it('reports the amount the chain recorded, not the one submitted', async () => {
      // The receipt is authoritative; they agree in practice, and preferring it
      // keeps the confirmation honest if they ever do not.
      mockWaitForTransaction.mockResolvedValue({ amount: parseEther('4.9').toString(), txHash: TX_HASH })
      render(<ContributeScreen />)

      await submitAmount('5')

      await waitFor(() => expect(screen.getByTestId('contribute-success')).toBeTruthy())
      expect(screen.getByText(/4\.9 POL is now in/)).toBeTruthy()
    })

    it('offers a way back to the pool once done', async () => {
      render(<ContributeScreen />)

      await submitAmount()
      fireEvent.press(screen.getByTestId('contribute-view-pool'))

      expect(mockRouterReplace).toHaveBeenCalledWith('/(auth)/pool/1')
    })
  })

  describe('failures', () => {
    it('returns to the form when the wallet rejects', async () => {
      mockContribute.mockRejectedValue(new Error('Transaction cancelled'))
      render(<ContributeScreen />)

      await submitAmount()

      expect(screen.getByTestId('contribute-form')).toBeTruthy()
      expect(screen.getByTestId('contribute-error').props.children).toBe('Transaction cancelled')
      expect(mockWaitForTransaction).not.toHaveBeenCalled()
    })

    it('returns to the form when confirmation does not resolve, without indexing', async () => {
      // The transaction is on chain; only its outcome is unresolved, and the
      // pending record survives so startup recovery can finish the job.
      mockWaitForTransaction.mockRejectedValue(new Error('Still waiting for the network to confirm this transaction'))
      render(<ContributeScreen />)

      await submitAmount()

      expect(screen.getByTestId('contribute-form')).toBeTruthy()
      expect(screen.getByTestId('contribute-error').props.children).toBe('Still waiting for the network to confirm this transaction')
      expect(mockTriggerIndexing).not.toHaveBeenCalled()
    })

    it('still succeeds when indexing fails, since the scheduled sync is the net', async () => {
      mockTriggerIndexing.mockResolvedValue(undefined)
      render(<ContributeScreen />)

      await submitAmount()

      await waitFor(() => expect(screen.getByTestId('contribute-success')).toBeTruthy())
    })

    it('surfaces an error the hook is holding', () => {
      mockContributionError = 'Insufficient balance for gas'

      render(<ContributeScreen />)

      expect(screen.getByTestId('contribute-error').props.children).toBe('Insufficient balance for gas')
    })
  })
})
