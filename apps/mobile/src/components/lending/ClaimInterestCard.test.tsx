import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import React from 'react'
import { type Address, parseEther } from 'viem'
import { mockWagmiUseAccount, mockWagmiUseReadContract } from '../../__tests__/mocks'
import { poolStore } from '../../stores/PoolStore'
import { ClaimInterestCard } from './ClaimInterestCard'
import { NATIVE } from '../../__tests__/fixtures/denomination'

const WALLET_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const POOL_ADDRESS = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0'
const TX_HASH = '0xaaaa000000000000000000000000000000000000000000000000000000000001'
const LOCALHOST_CHAIN_ID = 31337

const mockClaimInterest = jest.fn()
const mockWaitForTransaction = jest.fn()
const mockTriggerIndexing = jest.fn()
const mockReset = jest.fn()
let mockClaimError: string | null = null

jest.mock('../../hooks/pools/useInterest', () => ({
  useInterest: () => ({
    claimInterest: mockClaimInterest,
    isSubmitting: false,
    error: mockClaimError,
    reset: mockReset,
  }),
}))

jest.mock('../../hooks/pools/useTransactionMonitoring', () => ({
  useTransactionMonitoring: () => ({ waitForTransaction: mockWaitForTransaction, isWaiting: false, error: null }),
}))

jest.mock('../../hooks/pools/usePoolIndexing', () => ({
  usePoolIndexing: () => ({ triggerIndexing: mockTriggerIndexing, indexConfirmed: jest.fn(), isIndexing: false }),
}))

const mockRefetch = jest.fn()

/**
 * Answers the `claimable` read, so adding another read does not shift this one.
 *
 * No default: `undefined` is a meaningful value here — it is what the chain
 * reports before it has answered — and a default would swallow it.
 */
function chainReads(claimable: bigint | undefined) {
  mockRefetch.mockResolvedValue({ data: claimable })
  mockWagmiUseReadContract.mockImplementation((config?: { functionName?: string }) => {
    const data = config?.functionName === 'claimable' ? claimable : undefined

    return { data, refetch: mockRefetch }
  })
}

function renderCard() {
  return render(<ClaimInterestCard denomination={NATIVE} poolId={1} poolAddress={POOL_ADDRESS} poolName="Neighbourhood Fund" />)
}

/** Presses claim and flushes the async flow. */
async function pressClaim() {
  await act(async () => {
    fireEvent.press(screen.getByTestId('claim-interest-button'))
  })
}

describe('ClaimInterestCard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockClaimError = null

    mockWagmiUseAccount.mockReturnValue({
      isConnected: true,
      isConnecting: false,
      address: WALLET_ADDRESS as Address,
      chainId: LOCALHOST_CHAIN_ID,
    })
    chainReads(parseEther('1.5'))
    mockClaimInterest.mockResolvedValue(TX_HASH)
    mockWaitForTransaction.mockResolvedValue({ amount: parseEther('1.5').toString(), txHash: TX_HASH })
    mockTriggerIndexing.mockResolvedValue(undefined)
    poolStore.claimableByPool = {}
  })

  describe('what it shows', () => {
    it('shows what the chain says is claimable', () => {
      renderCard()

      expect(screen.getByTestId('claim-interest-amount')).toHaveTextContent('1.5 POL')
    })

    it('offers the claim with the amount on the button', () => {
      renderCard()

      expect(screen.getByTestId('claim-interest-button')).toHaveTextContent('Claim 1.5 POL')
    })

    it('renders at zero rather than disappearing', () => {
      // "You have earned nothing yet" is a real answer to what a lender is
      // asking; hiding the card would read as the feature not existing.
      chainReads(0n)

      renderCard()

      expect(screen.getByTestId('claim-interest-card')).toBeTruthy()
      expect(screen.getByTestId('claim-interest-amount')).toHaveTextContent('0 POL')
    })

    it('offers no claim at zero', () => {
      chainReads(0n)

      renderCard()

      expect(screen.queryByTestId('claim-interest-button')).toBeNull()
    })

    it('reads zero while the chain has not answered, rather than blank', () => {
      chainReads(undefined)

      renderCard()

      expect(screen.getByTestId('claim-interest-amount')).toHaveTextContent('0 POL')
    })
  })

  describe('the store mirror', () => {
    it('records what the chain reported, so the dashboard can include it', () => {
      // Nothing else in the app reads `claimable`, and it cannot be derived from
      // the indexed feeds: accrual comes from other people's repayments and
      // emits nothing naming the member it credits.
      renderCard()

      expect(poolStore.claimableByPool[1]).toBe(parseEther('1.5').toString())
    })

    it('records nothing while the chain has not answered', () => {
      // Zero and "not read yet" are different, and writing the first would make
      // an unanswered read look like an answer.
      chainReads(undefined)

      renderCard()

      expect(poolStore.claimableByPool[1]).toBeUndefined()
    })
  })

  describe('claiming', () => {
    it('sends the claim for this pool', async () => {
      renderCard()

      await pressClaim()

      expect(mockClaimInterest).toHaveBeenCalledWith({
        poolId: 1,
        poolAddress: POOL_ADDRESS,
        poolName: 'Neighbourhood Fund',
        denomination: NATIVE,
      })
    })

    it('waits for the transaction as a CLAIM_INTEREST', async () => {
      // The type picks the result extractor; the wrong one finds no log, and
      // "no log" is read as a confirmed transaction that produced nothing.
      renderCard()

      await pressClaim()

      expect(mockWaitForTransaction).toHaveBeenCalledWith(TX_HASH, 'CLAIM_INTEREST')
    })

    it('indexes the confirmed transaction', async () => {
      renderCard()

      await pressClaim()

      expect(mockTriggerIndexing).toHaveBeenCalledWith(TX_HASH, 'CLAIM_INTEREST')
    })

    it('re-reads the chain after indexing', async () => {
      // The claim is what makes `claimable` fall to zero, and the indexed feeds
      // are only eventually consistent with it.
      renderCard()

      await pressClaim()

      expect(mockRefetch).toHaveBeenCalled()
    })

    it('reports the amount the chain actually paid', async () => {
      renderCard()

      await pressClaim()

      await waitFor(() => expect(screen.getByTestId('claim-interest-success')).toHaveTextContent(/^1\.5 POL/))
    })
  })

  describe('failures', () => {
    it('surfaces a rejected signature and stops', async () => {
      mockClaimInterest.mockRejectedValue(new Error('Transaction cancelled'))

      renderCard()
      await pressClaim()

      expect(screen.getByTestId('claim-interest-error')).toHaveTextContent('Transaction cancelled')
      expect(mockWaitForTransaction).not.toHaveBeenCalled()
    })

    it('surfaces a confirmation failure without indexing', async () => {
      // The transaction is on chain; only its outcome is unresolved, and the
      // pending record survives for recovery to finish.
      mockWaitForTransaction.mockRejectedValue(new Error('Could not confirm the transaction'))

      renderCard()
      await pressClaim()

      expect(screen.getByTestId('claim-interest-error')).toHaveTextContent('Could not confirm the transaction')
      expect(mockTriggerIndexing).not.toHaveBeenCalled()
    })

    it('leaves the claim on offer after a failure', async () => {
      mockClaimInterest.mockRejectedValue(new Error('Transaction cancelled'))

      renderCard()
      await pressClaim()

      expect(screen.getByTestId('claim-interest-button')).toBeTruthy()
    })
  })
})
