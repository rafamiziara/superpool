import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import React from 'react'
import { type Address, parseEther } from 'viem'
import { mockWagmiUseAccount, mockWagmiUseReadContract } from '../../../src/__tests__/mocks'
import { mockLocalSearchParams, mockRouterDismissTo } from '../../../src/__tests__/setup'
import { poolStore } from '../../../src/stores/PoolStore'
import WithdrawScreen from './withdraw'

const WALLET_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const TX_HASH = '0xaaaa000000000000000000000000000000000000000000000000000000000001'
const LOCALHOST_CHAIN_ID = 31337

/** Pool 1 exists in the mock data the store loads. */
const POOL_ID = '1'

const mockWithdraw = jest.fn()
const mockWaitForTransaction = jest.fn()
const mockTriggerIndexing = jest.fn()
const mockReset = jest.fn()
let mockWithdrawalError: string | null = null

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}))

jest.mock('../../../src/hooks/pools/useWithdrawal', () => ({
  useWithdrawal: () => ({
    withdraw: mockWithdraw,
    isSubmitting: false,
    error: mockWithdrawalError,
    reset: mockReset,
  }),
}))

jest.mock('../../../src/hooks/pools/useTransactionMonitoring', () => ({
  useTransactionMonitoring: () => ({ waitForTransaction: mockWaitForTransaction, isWaiting: false, error: null }),
}))

jest.mock('../../../src/hooks/pools/usePoolIndexing', () => ({
  usePoolIndexing: () => ({ triggerIndexing: mockTriggerIndexing, indexConfirmed: jest.fn(), isIndexing: false }),
}))

/** Answers each chain read by name, so adding one does not shift the others. */
function chainReads({ position = parseEther('10'), withdrawable = parseEther('10'), version = '2.0.0' } = {}) {
  mockWagmiUseReadContract.mockImplementation((config?: { functionName?: string }) => {
    const data =
      config?.functionName === 'contributions'
        ? position
        : config?.functionName === 'withdrawableAmount'
          ? withdrawable
          : config?.functionName === 'version'
            ? version
            : undefined

    return { data, refetch: jest.fn().mockResolvedValue({ data }) }
  })
}

/** Enters an amount and presses submit, flushing the async flow. */
async function submitAmount(amount = '5') {
  fireEvent.changeText(screen.getByTestId('withdraw-amount'), amount)
  await act(async () => {
    fireEvent.press(screen.getByTestId('withdraw-submit'))
  })
}

describe('WithdrawScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    mockWithdrawalError = null

    mockLocalSearchParams.mockReturnValue({ poolId: POOL_ID })
    mockWagmiUseAccount.mockReturnValue({
      isConnected: true,
      isConnecting: false,
      address: WALLET_ADDRESS as Address,
      chainId: LOCALHOST_CHAIN_ID,
    })
    chainReads()

    mockWithdraw.mockResolvedValue(TX_HASH)
    mockWaitForTransaction.mockResolvedValue({ amount: parseEther('5').toString(), txHash: TX_HASH })
    mockTriggerIndexing.mockResolvedValue(undefined)

    await poolStore.fetchPools()
  })

  it('renders the form for the pool in the query parameter', () => {
    render(<WithdrawScreen />)

    expect(screen.getByTestId('withdraw-screen')).toBeTruthy()
    expect(screen.getByTestId('withdraw-form')).toBeTruthy()
  })

  it('reports a pool that is not in the store', () => {
    mockLocalSearchParams.mockReturnValue({ poolId: '9999' })

    render(<WithdrawScreen />)

    expect(screen.getByTestId('withdraw-pool-not-found')).toBeTruthy()
  })

  it('takes the position from the chain, not from indexed contributions', async () => {
    // Contributions record deposits only, so after one withdrawal they overstate
    // the position. The contract is the only correct source.
    chainReads({ position: parseEther('7'), withdrawable: parseEther('7') })

    render(<WithdrawScreen />)

    expect(screen.getByTestId('withdraw-position')).toHaveTextContent(/7 POL/)
  })

  it('refuses a pool created before withdrawals existed', async () => {
    // Pools are minimal-proxy clones and cannot be upgraded, so a v1 pool will
    // never gain `withdraw` — saying so beats a raw revert.
    chainReads({ version: '1.0.0' })

    render(<WithdrawScreen />)

    expect(screen.getByTestId('withdraw-unsupported')).toBeTruthy()
    expect(screen.queryByTestId('withdraw-form')).toBeNull()
  })

  it('shows the form while the version is still loading', () => {
    chainReads({ version: undefined as unknown as string })

    render(<WithdrawScreen />)

    expect(screen.queryByTestId('withdraw-unsupported')).toBeNull()
    expect(screen.getByTestId('withdraw-form')).toBeTruthy()
  })

  describe('the happy path', () => {
    it('submits the amount in wei', async () => {
      render(<WithdrawScreen />)

      await submitAmount('5')

      expect(mockWithdraw).toHaveBeenCalledWith(
        expect.objectContaining({
          poolId: 1,
          amount: parseEther('5'),
        })
      )
    })

    it('monitors the transaction as a WITHDRAW', async () => {
      render(<WithdrawScreen />)

      await submitAmount()

      expect(mockWaitForTransaction).toHaveBeenCalledWith(TX_HASH, 'WITHDRAW')
    })

    it('settles the pending record even though there is no indexer', async () => {
      render(<WithdrawScreen />)

      await submitAmount()

      expect(mockTriggerIndexing).toHaveBeenCalledWith(TX_HASH, 'WITHDRAW')
    })

    it('reports the amount the chain recorded, not the one submitted', async () => {
      mockWaitForTransaction.mockResolvedValue({ amount: parseEther('4.5').toString(), txHash: TX_HASH })

      render(<WithdrawScreen />)
      await submitAmount('5')

      await waitFor(() => expect(screen.getByTestId('withdraw-success')).toBeTruthy())
      expect(screen.getByTestId('withdraw-success')).toHaveTextContent(/4.5 POL/)
    })

    it('pops back to the pool instead of stacking a second one', async () => {
      render(<WithdrawScreen />)
      await submitAmount()

      await waitFor(() => expect(screen.getByTestId('withdraw-success')).toBeTruthy())
      fireEvent.press(screen.getByTestId('withdraw-view-pool'))

      expect(mockRouterDismissTo).toHaveBeenCalledWith('/(auth)/pool/1')
    })
  })

  describe('failures', () => {
    it('returns to the form when the wallet rejects', async () => {
      mockWithdraw.mockRejectedValue(new Error('Transaction cancelled'))

      render(<WithdrawScreen />)
      await submitAmount()

      expect(screen.getByTestId('withdraw-form')).toBeTruthy()
      expect(screen.getByTestId('withdraw-error')).toHaveTextContent('Transaction cancelled')
      expect(mockWaitForTransaction).not.toHaveBeenCalled()
    })

    it('returns to the form when confirmation fails, without claiming success', async () => {
      mockWaitForTransaction.mockRejectedValue(new Error('Transaction was reverted'))

      render(<WithdrawScreen />)
      await submitAmount()

      expect(screen.getByTestId('withdraw-form')).toBeTruthy()
      expect(screen.getByTestId('withdraw-error')).toHaveTextContent('Transaction was reverted')
      expect(screen.queryByTestId('withdraw-success')).toBeNull()
      expect(mockTriggerIndexing).not.toHaveBeenCalled()
    })
  })
})
