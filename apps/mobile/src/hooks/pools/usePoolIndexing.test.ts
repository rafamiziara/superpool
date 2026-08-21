import { act, renderHook } from '@testing-library/react-native'
import type { Address } from 'viem'
import {
  LOCALHOST_CHAIN_ID,
  makeContributeTransaction,
  makeLoanTransaction,
  makePendingTransaction,
  OTHER_TX_HASH,
  TX_HASH,
} from '../../__tests__/fixtures/pendingTransaction'
import { mockFirebaseCallable, mockWagmiUseAccount } from '../../__tests__/mocks'
import { type CreatePoolTransaction, pendingTransactionsStore } from '../../stores/PendingTransactionsStore'
import { poolStore } from '../../stores/PoolStore'
import { usePoolIndexing } from './usePoolIndexing'

const WALLET_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const POOL_ADDRESS = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0'

jest.mock('../../config/contracts', () => ({
  DEFAULT_CHAIN_ID: 31337,
  getPoolFactoryAddress: jest.fn(),
}))

// Replaced wholesale rather than spied on: MobX defines store actions as
// non-configurable, so jest.spyOn cannot redefine them.
jest.mock('../../stores/PoolStore', () => ({
  poolStore: { refreshPools: jest.fn() },
}))

const refreshPools = jest.mocked(poolStore.refreshPools)

/**
 * Indexing only ever runs against a record the chain has already confirmed, so
 * that — not the fixture's default `submitted` — is this suite's starting point.
 */
function makeConfirmed(overrides: Partial<CreatePoolTransaction> = {}): CreatePoolTransaction {
  return makePendingTransaction({ status: 'confirmed', result: { poolId: 7, poolAddress: POOL_ADDRESS }, ...overrides })
}

describe('usePoolIndexing', () => {
  let indexPoolCallable: jest.Mock
  let logSpy: jest.SpyInstance
  let warnSpy: jest.SpyInstance

  beforeEach(async () => {
    jest.clearAllMocks()
    await pendingTransactionsStore.reset()

    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined)
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    refreshPools.mockResolvedValue(undefined)

    mockWagmiUseAccount.mockReturnValue({
      isConnected: true,
      isConnecting: false,
      address: WALLET_ADDRESS as Address,
      chainId: LOCALHOST_CHAIN_ID,
    })

    indexPoolCallable = jest.fn().mockResolvedValue({ data: { poolId: 7, alreadyIndexed: false, stored: true } })
    mockFirebaseCallable.mockReturnValue(indexPoolCallable)
  })

  afterEach(() => {
    logSpy.mockRestore()
    warnSpy.mockRestore()
  })

  it('starts idle', () => {
    const { result } = renderHook(() => usePoolIndexing())

    expect(result.current.isIndexing).toBe(false)
  })

  describe('triggerIndexing', () => {
    beforeEach(async () => {
      await pendingTransactionsStore.addPendingTransaction(makeConfirmed())
    })

    it('asks the backend to index the transaction on the connected chain', async () => {
      const { result } = renderHook(() => usePoolIndexing())

      await act(async () => {
        await result.current.triggerIndexing(TX_HASH, 'CREATE_POOL')
      })

      expect(mockFirebaseCallable).toHaveBeenCalledWith(expect.anything(), 'indexPool')
      expect(indexPoolCallable).toHaveBeenCalledWith({ txHash: TX_HASH, chainId: LOCALHOST_CHAIN_ID })
      expect(result.current.isIndexing).toBe(false)
    })

    it('prefers an explicitly supplied chain over the connected one', async () => {
      const { result } = renderHook(() => usePoolIndexing())

      await act(async () => {
        await result.current.triggerIndexing(TX_HASH, 'CREATE_POOL', 80002)
      })

      expect(indexPoolCallable).toHaveBeenCalledWith({ txHash: TX_HASH, chainId: 80002 })
    })

    it('falls back to the default chain when no wallet is connected', async () => {
      mockWagmiUseAccount.mockReturnValue({ isConnected: false, isConnecting: false, address: undefined, chainId: undefined })
      const { result } = renderHook(() => usePoolIndexing())

      await act(async () => {
        await result.current.triggerIndexing(TX_HASH, 'CREATE_POOL')
      })

      expect(indexPoolCallable).toHaveBeenCalledWith({ txHash: TX_HASH, chainId: 31337 })
    })

    it('refreshes the pool list before dropping the pending record', async () => {
      const { result } = renderHook(() => usePoolIndexing())

      await act(async () => {
        await result.current.triggerIndexing(TX_HASH, 'CREATE_POOL')
      })

      expect(refreshPools).toHaveBeenCalled()
      expect(pendingTransactionsStore.transactions).toHaveLength(0)
    })

    it('swallows a backend failure and keeps the transaction for the scheduled sync', async () => {
      indexPoolCallable.mockRejectedValue(new Error('functions/unavailable'))
      const { result } = renderHook(() => usePoolIndexing())

      await act(async () => {
        await expect(result.current.triggerIndexing(TX_HASH, 'CREATE_POOL')).resolves.toBeUndefined()
      })

      expect(warnSpy).toHaveBeenCalled()
      expect(pendingTransactionsStore.transactions).toHaveLength(1)
      expect(pendingTransactionsStore.confirmedUnindexed).toHaveLength(1)
      expect(result.current.isIndexing).toBe(false)
    })

    it('keeps the record when the refresh fails, so indexing is retried', async () => {
      refreshPools.mockRejectedValue(new Error('network down'))
      const { result } = renderHook(() => usePoolIndexing())

      await act(async () => {
        await expect(result.current.triggerIndexing(TX_HASH, 'CREATE_POOL')).resolves.toBeUndefined()
      })

      expect(pendingTransactionsStore.transactions).toHaveLength(1)
    })

    it('treats an already-indexed pool as success', async () => {
      indexPoolCallable.mockResolvedValue({ data: { poolId: 7, alreadyIndexed: true, stored: false } })
      const { result } = renderHook(() => usePoolIndexing())

      await act(async () => {
        await result.current.triggerIndexing(TX_HASH, 'CREATE_POOL')
      })

      expect(pendingTransactionsStore.transactions).toHaveLength(0)
    })
  })

  describe('routing by transaction type', () => {
    it('sends a contribution to indexContribution, not indexPool', async () => {
      await pendingTransactionsStore.addPendingTransaction(
        makeContributeTransaction({ status: 'confirmed', result: { amount: '5000000000000000000' } })
      )
      const { result } = renderHook(() => usePoolIndexing())

      await act(async () => {
        await result.current.indexConfirmed()
      })

      expect(mockFirebaseCallable).toHaveBeenCalledWith(expect.anything(), 'indexContribution')
      expect(mockFirebaseCallable).not.toHaveBeenCalledWith(expect.anything(), 'indexPool')
      expect(pendingTransactionsStore.transactions).toHaveLength(0)
    })

    it('routes a mixed drain to both callables', async () => {
      // Startup recovery can confirm a creation and a deposit in the same pass;
      // the type on each record is what decides where it goes.
      await pendingTransactionsStore.addPendingTransaction(makeConfirmed())
      await pendingTransactionsStore.addPendingTransaction(
        makeContributeTransaction({ txHash: OTHER_TX_HASH, status: 'confirmed', result: { amount: '1' } })
      )
      const { result } = renderHook(() => usePoolIndexing())

      await act(async () => {
        await result.current.indexConfirmed()
      })

      expect(mockFirebaseCallable).toHaveBeenCalledWith(expect.anything(), 'indexPool')
      expect(mockFirebaseCallable).toHaveBeenCalledWith(expect.anything(), 'indexContribution')
    })

    it.each(['BORROW', 'REPAY', 'REQUEST_LOAN', 'APPROVE_LOAN', 'REJECT_LOAN', 'CANCEL_LOAN_REQUEST'] as const)(
      'sends %s to indexLoan',
      async (type) => {
        // The callable re-reads the loan through `getLoan` and stores the state
        // afterwards, so all six actions resolve to the same record.
        await pendingTransactionsStore.addPendingTransaction(
          makeLoanTransaction({ type, status: 'confirmed', result: { loanId: 1, amount: '1' } })
        )
        const { result } = renderHook(() => usePoolIndexing())

        await act(async () => {
          await result.current.indexConfirmed()
        })

        expect(mockFirebaseCallable).toHaveBeenCalledWith(expect.anything(), 'indexLoan')
        expect(pendingTransactionsStore.transactions).toHaveLength(0)
      }
    )
  })

  describe('indexConfirmed', () => {
    it('indexes every confirmed transaction, including ones recovered at startup', async () => {
      await pendingTransactionsStore.addPendingTransaction(makeConfirmed())
      await pendingTransactionsStore.addPendingTransaction(makeConfirmed({ txHash: OTHER_TX_HASH, chainId: 80002 }))
      const { result } = renderHook(() => usePoolIndexing())

      await act(async () => {
        await result.current.indexConfirmed()
      })

      expect(indexPoolCallable).toHaveBeenCalledTimes(2)
      expect(indexPoolCallable).toHaveBeenCalledWith({ txHash: TX_HASH, chainId: LOCALHOST_CHAIN_ID })
      // Each transaction is indexed on the chain it was submitted to.
      expect(indexPoolCallable).toHaveBeenCalledWith({ txHash: OTHER_TX_HASH, chainId: 80002 })
      expect(pendingTransactionsStore.transactions).toHaveLength(0)
    })

    it('leaves still-submitted transactions alone', async () => {
      await pendingTransactionsStore.addPendingTransaction(makeConfirmed({ status: 'submitted' }))
      const { result } = renderHook(() => usePoolIndexing())

      await act(async () => {
        await result.current.indexConfirmed()
      })

      expect(indexPoolCallable).not.toHaveBeenCalled()
      expect(pendingTransactionsStore.transactions).toHaveLength(1)
    })

    it('ignores failed transactions', async () => {
      await pendingTransactionsStore.addPendingTransaction(makeConfirmed({ status: 'failed' }))
      const { result } = renderHook(() => usePoolIndexing())

      await act(async () => {
        await result.current.indexConfirmed()
      })

      expect(indexPoolCallable).not.toHaveBeenCalled()
    })

    it('does nothing when there is nothing to index', async () => {
      const { result } = renderHook(() => usePoolIndexing())

      await act(async () => {
        await result.current.indexConfirmed()
      })

      expect(indexPoolCallable).not.toHaveBeenCalled()
    })

    it('carries on after one transaction fails to index', async () => {
      await pendingTransactionsStore.addPendingTransaction(makeConfirmed())
      await pendingTransactionsStore.addPendingTransaction(makeConfirmed({ txHash: OTHER_TX_HASH }))
      indexPoolCallable.mockRejectedValueOnce(new Error('functions/unavailable'))
      const { result } = renderHook(() => usePoolIndexing())

      await act(async () => {
        await result.current.indexConfirmed()
      })

      expect(indexPoolCallable).toHaveBeenCalledTimes(2)
      expect(pendingTransactionsStore.transactions.map((transaction) => transaction.txHash)).toEqual([TX_HASH])
    })
  })
})
