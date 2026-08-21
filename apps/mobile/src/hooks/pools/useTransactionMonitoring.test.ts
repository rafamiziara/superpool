import { act, renderHook } from '@testing-library/react-native'
import {
  BaseError,
  encodeAbiParameters,
  encodeEventTopics,
  HttpRequestError,
  type TransactionReceipt,
  WaitForTransactionReceiptTimeoutError,
} from 'viem'
import {
  mockEstimateContractGas,
  mockGetTransactionReceipt,
  mockReadContract,
  mockWagmiUsePublicClient,
  mockWaitForTransactionReceipt,
} from '../../__tests__/mocks'
import { makeContributeTransaction, makePendingTransaction, TX_HASH } from '../../__tests__/fixtures/pendingTransaction'
import { LendingPoolABI, PoolFactoryABI } from '../../constants/abis'
import { pendingTransactionsStore } from '../../stores/PendingTransactionsStore'
import { useTransactionMonitoring } from './useTransactionMonitoring'

type ReceiptLog = TransactionReceipt['logs'][number]

const FACTORY_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3'
const POOL_ADDRESS = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0'
const POOL_OWNER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

function makePoolCreatedLog(poolId: bigint): ReceiptLog {
  return {
    address: FACTORY_ADDRESS,
    topics: encodeEventTopics({
      abi: PoolFactoryABI,
      eventName: 'PoolCreated',
      args: { poolId, poolAddress: POOL_ADDRESS, poolOwner: POOL_OWNER },
    }),
    data: encodeAbiParameters(
      [{ type: 'string' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }],
      ['Neighbourhood Fund', 1_000_000_000_000_000_000n, 500n, 2_592_000n]
    ),
    blockHash: '0xdead000000000000000000000000000000000000000000000000000000000001',
    blockNumber: 42n,
    logIndex: 0,
    transactionHash: TX_HASH,
    transactionIndex: 0,
    removed: false,
  } as ReceiptLog
}

/** Both parameters are `indexed`, so everything lands in topics and `data` is empty. */
function makeFundsDepositedLog(amount: bigint): ReceiptLog {
  return {
    address: POOL_ADDRESS,
    topics: encodeEventTopics({
      abi: LendingPoolABI,
      eventName: 'FundsDeposited',
      args: { depositor: POOL_OWNER, amount },
    }),
    data: '0x',
    blockHash: '0xdead000000000000000000000000000000000000000000000000000000000001',
    blockNumber: 42n,
    logIndex: 0,
    transactionHash: TX_HASH,
    transactionIndex: 0,
    removed: false,
  } as ReceiptLog
}

function makeReceipt(overrides: Partial<TransactionReceipt> = {}): TransactionReceipt {
  return {
    blockHash: '0xdead000000000000000000000000000000000000000000000000000000000001',
    blockNumber: 42n,
    contractAddress: null,
    cumulativeGasUsed: 100_000n,
    effectiveGasPrice: 1_000_000_000n,
    from: POOL_OWNER,
    gasUsed: 90_000n,
    logs: [makePoolCreatedLog(7n)],
    logsBloom: `0x${'0'.repeat(512)}`,
    status: 'success',
    to: FACTORY_ADDRESS,
    transactionHash: TX_HASH,
    transactionIndex: 0,
    type: 'eip1559',
    ...overrides,
  }
}

const storedStatus = () => pendingTransactionsStore.transactions[0]?.status

describe('useTransactionMonitoring', () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    await pendingTransactionsStore.reset()
    await pendingTransactionsStore.addPendingTransaction(makePendingTransaction())

    mockWagmiUsePublicClient.mockReturnValue({
      chain: { id: 31337 },
      estimateContractGas: mockEstimateContractGas,
      waitForTransactionReceipt: mockWaitForTransactionReceipt,
      getTransactionReceipt: mockGetTransactionReceipt,
      readContract: mockReadContract,
    })
    mockWaitForTransactionReceipt.mockResolvedValue(makeReceipt())
  })

  it('starts idle', () => {
    const { result } = renderHook(() => useTransactionMonitoring())

    expect(result.current.isWaiting).toBe(false)
    expect(result.current.error).toBeNull()
  })

  describe('confirmation', () => {
    it('resolves with the pool identifiers decoded from the receipt', async () => {
      const { result } = renderHook(() => useTransactionMonitoring())

      let outcome
      await act(async () => {
        outcome = await result.current.waitForTransaction(TX_HASH, 'CREATE_POOL')
      })

      expect(outcome).toEqual({ poolId: 7, poolAddress: POOL_ADDRESS, txHash: TX_HASH })
      expect(result.current.isWaiting).toBe(false)
      expect(result.current.error).toBeNull()
    })

    it('watches with a two-minute ceiling', async () => {
      const { result } = renderHook(() => useTransactionMonitoring())

      await act(async () => {
        await result.current.waitForTransaction(TX_HASH, 'CREATE_POOL')
      })

      expect(mockWaitForTransactionReceipt).toHaveBeenCalledWith({ hash: TX_HASH, timeout: 120_000 })
    })

    it('records the transaction as confirmed with its result', async () => {
      const { result } = renderHook(() => useTransactionMonitoring())

      await act(async () => {
        await result.current.waitForTransaction(TX_HASH, 'CREATE_POOL')
      })

      expect(storedStatus()).toBe('confirmed')
      expect(pendingTransactionsStore.transactions[0].result).toEqual({ poolId: 7, poolAddress: POOL_ADDRESS })
      expect(pendingTransactionsStore.confirmedUnindexed).toHaveLength(1)
    })

    it('decodes a contribution from its FundsDeposited log', async () => {
      // The type given here is what picks the decoder. Passing the wrong one
      // finds no log and marks a perfectly good deposit failed.
      await pendingTransactionsStore.reset()
      await pendingTransactionsStore.addPendingTransaction(makeContributeTransaction())
      mockWaitForTransactionReceipt.mockResolvedValue(makeReceipt({ logs: [makeFundsDepositedLog(5_000_000_000_000_000_000n)] }))
      const { result } = renderHook(() => useTransactionMonitoring())

      let outcome
      await act(async () => {
        outcome = await result.current.waitForTransaction(TX_HASH, 'CONTRIBUTE')
      })

      expect(outcome).toEqual({ amount: '5000000000000000000', txHash: TX_HASH })
      expect(storedStatus()).toBe('confirmed')
    })

    it('fails a contribution whose receipt carries no deposit log', async () => {
      await pendingTransactionsStore.reset()
      await pendingTransactionsStore.addPendingTransaction(makeContributeTransaction())
      mockWaitForTransactionReceipt.mockResolvedValue(makeReceipt({ logs: [] }))
      const { result } = renderHook(() => useTransactionMonitoring())

      await act(async () => {
        await expect(result.current.waitForTransaction(TX_HASH, 'CONTRIBUTE')).rejects.toThrow('did not record a deposit')
      })

      expect(storedStatus()).toBe('failed')
    })
  })

  describe('a verdict of failure', () => {
    it('marks a reverted transaction failed', async () => {
      mockWaitForTransactionReceipt.mockResolvedValue(makeReceipt({ status: 'reverted', logs: [] }))
      const { result } = renderHook(() => useTransactionMonitoring())

      await act(async () => {
        await expect(result.current.waitForTransaction(TX_HASH, 'CREATE_POOL')).rejects.toThrow('Transaction was reverted')
      })

      expect(storedStatus()).toBe('failed')
      expect(result.current.error).toBe('Transaction was reverted')
      expect(result.current.isWaiting).toBe(false)
    })

    it('marks a confirmed transaction that created no pool failed, so indexing never retries it', async () => {
      mockWaitForTransactionReceipt.mockResolvedValue(makeReceipt({ logs: [] }))
      const { result } = renderHook(() => useTransactionMonitoring())

      await act(async () => {
        await expect(result.current.waitForTransaction(TX_HASH, 'CREATE_POOL')).rejects.toThrow('did not create a pool')
      })

      expect(storedStatus()).toBe('failed')
      expect(pendingTransactionsStore.confirmedUnindexed).toHaveLength(0)
    })
  })

  describe('no verdict yet', () => {
    it('leaves a timed-out transaction submitted so startup recovery can resolve it', async () => {
      mockWaitForTransactionReceipt.mockRejectedValue(new WaitForTransactionReceiptTimeoutError({ hash: TX_HASH }))
      const { result } = renderHook(() => useTransactionMonitoring())

      await act(async () => {
        await expect(result.current.waitForTransaction(TX_HASH, 'CREATE_POOL')).rejects.toThrow('Still waiting for the network')
      })

      expect(storedStatus()).toBe('submitted')
      expect(pendingTransactionsStore.hasPending).toBe(true)
    })

    it('leaves a transaction submitted when the RPC call fails', async () => {
      mockWaitForTransactionReceipt.mockRejectedValue(
        new BaseError('HTTP request failed', { cause: new HttpRequestError({ url: 'http://localhost:8545' }) })
      )
      const { result } = renderHook(() => useTransactionMonitoring())

      await act(async () => {
        await expect(result.current.waitForTransaction(TX_HASH, 'CREATE_POOL')).rejects.toThrow()
      })

      expect(storedStatus()).toBe('submitted')
      expect(result.current.error).not.toBeNull()
    })

    it('refuses to run without a client and changes nothing', async () => {
      mockWagmiUsePublicClient.mockReturnValue(undefined)
      const { result } = renderHook(() => useTransactionMonitoring())

      await act(async () => {
        await expect(result.current.waitForTransaction(TX_HASH, 'CREATE_POOL')).rejects.toThrow('No connection to the network')
      })

      expect(storedStatus()).toBe('submitted')
      expect(mockWaitForTransactionReceipt).not.toHaveBeenCalled()
    })
  })

  it('does not fail when the hash is not one it stored', async () => {
    await pendingTransactionsStore.reset()
    const { result } = renderHook(() => useTransactionMonitoring())

    let outcome
    await act(async () => {
      outcome = await result.current.waitForTransaction(TX_HASH, 'CREATE_POOL')
    })

    expect(outcome).toEqual({ poolId: 7, poolAddress: POOL_ADDRESS, txHash: TX_HASH })
    expect(pendingTransactionsStore.transactions).toHaveLength(0)
  })
})
