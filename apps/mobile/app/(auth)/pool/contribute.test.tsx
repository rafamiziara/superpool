import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import React from 'react'
import { type Address, parseEther } from 'viem'
import { mockWagmiUseAccount, mockWagmiUseBalance } from '../../../src/__tests__/mocks'
import { mockLocalSearchParams, mockRouterBack, mockRouterDismissTo } from '../../../src/__tests__/setup'
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
const mockReadAllowance = jest.fn()
const mockApprove = jest.fn()
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

jest.mock('../../../src/hooks/pools/useTokenApproval', () => ({
  useTokenApproval: () => ({
    readAllowance: mockReadAllowance,
    approve: mockApprove,
    isSubmitting: false,
    error: null,
    reset: jest.fn(),
  }),
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

    mockReadAllowance.mockResolvedValue(0n)
    mockApprove.mockResolvedValue(TX_HASH)
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
        // The pool's own unit, read from the pool record rather than assumed:
        // it travels with the transaction so the pending card can use it.
        denomination: { symbol: 'POL', decimals: 18 },
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

      // Pops back to the pool page already on the stack rather than adding a
      // second one, which made the first back press look ignored.
      expect(mockRouterDismissTo).toHaveBeenCalledWith('/(auth)/pool/1')
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

  describe('a token pool', () => {
    /** Pool 7 in the mock data is denominated in USDC, at six decimals. */
    const TOKEN_POOL_ID = '7'
    const TOKEN = '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359'

    beforeEach(() => {
      mockLocalSearchParams.mockReturnValue({ poolId: TOKEN_POOL_ID })
    })

    it('asks the token for an approval before asking the pool for anything', async () => {
      render(<ContributeScreen />)

      await submitAmount('5')

      expect(mockApprove).toHaveBeenCalledWith({
        token: TOKEN,
        spender: poolStore.poolById(7)!.poolAddress,
        // The amount, never the maximum: a bug in the pool must not be able to
        // reach the rest of the member's balance. Six decimals, not eighteen.
        amount: 5_000_000n,
      })
      expect(mockApprove.mock.invocationCallOrder[0]).toBeLessThan(mockContribute.mock.invocationCallOrder[0])
    })

    it('skips the approval when the pool may already take the amount', async () => {
      // A flow abandoned between the two transactions resumes at the deposit
      // rather than asking for a second approval.
      mockReadAllowance.mockResolvedValue(10_000_000n)
      render(<ContributeScreen />)

      await submitAmount('5')

      expect(mockApprove).not.toHaveBeenCalled()
      expect(mockContribute).toHaveBeenCalled()
    })

    it('asks for an approval when the allowance cannot be read', async () => {
      // Undefined is not zero — but asking is the safe way to be wrong: a
      // needless approval costs gas, a missing one costs a reverted deposit.
      mockReadAllowance.mockResolvedValue(undefined)
      render(<ContributeScreen />)

      await submitAmount('5')

      expect(mockApprove).toHaveBeenCalled()
    })

    it('stops at the form when the approval is refused', async () => {
      mockApprove.mockRejectedValue(new Error('User rejected the request'))
      render(<ContributeScreen />)

      await submitAmount('5')

      expect(mockContribute).not.toHaveBeenCalled()
      await waitFor(() => expect(screen.getByTestId('contribute-error')).toHaveTextContent('User rejected the request'))
    })
  })

  describe('a native pool', () => {
    it('asks for no approval at all', async () => {
      // There is nothing to approve: the amount travels as `msg.value`.
      render(<ContributeScreen />)

      await submitAmount('5')

      expect(mockReadAllowance).not.toHaveBeenCalled()
      expect(mockApprove).not.toHaveBeenCalled()
    })
  })
})
