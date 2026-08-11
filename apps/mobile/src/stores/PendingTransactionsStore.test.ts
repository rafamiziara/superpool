import AsyncStorage from '@react-native-async-storage/async-storage'
import { createPublicClient, encodeAbiParameters, encodeEventTopics, http, type TransactionReceipt } from 'viem'
import { hardhat } from 'viem/chains'
import {
  LOAN_PARAMS,
  makeContributeTransaction,
  makeLoanTransaction,
  makePendingTransaction,
  OTHER_TX_HASH,
  TX_HASH,
} from '../__tests__/fixtures/pendingTransaction'
import { PoolFactoryABI, SampleLendingPoolABI } from '../constants/abis'
import {
  extractFundsDepositedResult,
  extractLoanResult,
  extractPoolCreatedResult,
  extractResult,
  isLoanTransactionType,
  type PendingTransaction,
  PendingTransactionsStore,
  type TransactionReceiptReader,
} from './PendingTransactionsStore'

// An in-memory AsyncStorage, replacing the global mock so this file can seed
// storage directly and force write failures.
jest.mock('@react-native-async-storage/async-storage', () => {
  let contents: Record<string, string> = {}

  return {
    __esModule: true,
    default: {
      getItem: jest.fn((key: string) => Promise.resolve(contents[key] ?? null)),
      setItem: jest.fn((key: string, value: string) => {
        contents[key] = value
        return Promise.resolve()
      }),
      removeItem: jest.fn((key: string) => {
        delete contents[key]
        return Promise.resolve()
      }),
      clear: jest.fn(() => {
        contents = {}
        return Promise.resolve()
      }),
    },
  }
})

/** A log as it appears on a receipt — mined, so `blockHash` is non-null. */
type ReceiptLog = TransactionReceipt['logs'][number]

const STORAGE_KEY = '@superpool/pending_transactions'
const FACTORY_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3'
const POOL_ADDRESS = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0'
const POOL_OWNER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Builds a `PoolCreated` log by encoding against the generated ABI, so the
 * decode path is exercised through the same ABI the app ships rather than a
 * hand-written fixture that could agree with a bug.
 */
function makePoolCreatedLog(poolId: bigint, poolAddress: `0x${string}`): ReceiptLog {
  const topics = encodeEventTopics({
    abi: PoolFactoryABI,
    eventName: 'PoolCreated',
    args: { poolId, poolAddress, poolOwner: POOL_OWNER },
  })

  const data = encodeAbiParameters(
    [{ type: 'string' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }],
    ['Neighbourhood Fund', 1_000_000_000_000_000_000n, 500n, 2_592_000n]
  )

  return {
    address: FACTORY_ADDRESS,
    topics,
    data,
    blockHash: '0xdead000000000000000000000000000000000000000000000000000000000001',
    blockNumber: 42n,
    logIndex: 0,
    transactionHash: TX_HASH,
    transactionIndex: 0,
    removed: false,
  } as ReceiptLog
}

/**
 * Builds a `FundsDeposited` log the same way — through the shipped ABI.
 *
 * Both of that event's parameters are `indexed`, so everything lands in
 * `topics` and `data` is empty. A fixture that put the amount in `data` would
 * decode to nothing against the real ABI.
 */
function makeFundsDepositedLog(depositor: `0x${string}`, amount: bigint): ReceiptLog {
  const topics = encodeEventTopics({
    abi: SampleLendingPoolABI,
    eventName: 'FundsDeposited',
    args: { depositor, amount },
  })

  return {
    address: POOL_ADDRESS,
    topics,
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
    logs: [makePoolCreatedLog(7n, POOL_ADDRESS)],
    logsBloom: `0x${'0'.repeat(512)}`,
    status: 'success',
    to: FACTORY_ADDRESS,
    transactionHash: TX_HASH,
    transactionIndex: 0,
    type: 'eip1559',
    ...overrides,
  }
}

/** A receipt reader that answers from a fixed map; unknown hashes throw, as Viem does. */
function makeClient(receipts: Record<string, TransactionReceipt>, chainId?: number): TransactionReceiptReader {
  return {
    ...(chainId === undefined ? {} : { chain: { id: chainId } }),
    getTransactionReceipt: jest.fn(({ hash }: { hash: `0x${string}` }) => {
      const receipt = receipts[hash]
      if (!receipt) return Promise.reject(new Error('TransactionReceiptNotFoundError'))
      return Promise.resolve(receipt)
    }),
  }
}

async function readStoredHashes(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY)
  const parsed = JSON.parse(raw ?? '[]') as PendingTransaction[]
  return parsed.map((transaction) => transaction.txHash)
}

// ---------------------------------------------------------------------------

describe('PendingTransactionsStore', () => {
  let store: PendingTransactionsStore
  let warnSpy: jest.SpyInstance

  beforeEach(async () => {
    await AsyncStorage.clear()
    jest.clearAllMocks()
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    store = new PendingTransactionsStore()
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('starts empty', () => {
    expect(store.transactions).toHaveLength(0)
    expect(store.isLoading).toBe(false)
    expect(store.hasPending).toBe(false)
    expect(store.pendingCount).toBe(0)
    expect(store.confirmedUnindexed).toHaveLength(0)
  })

  describe('addPendingTransaction', () => {
    it('adds and persists', async () => {
      await store.addPendingTransaction(makePendingTransaction())

      expect(store.transactions).toHaveLength(1)
      expect(await readStoredHashes()).toEqual([TX_HASH])
    })

    it('replaces an entry with the same hash rather than duplicating it', async () => {
      await store.addPendingTransaction(makePendingTransaction())
      await store.addPendingTransaction(makePendingTransaction({ status: 'confirmed' }))

      expect(store.transactions).toHaveLength(1)
      expect(store.transactions[0].status).toBe('confirmed')
    })

    it('keeps the newest 50 transactions', async () => {
      for (let index = 0; index < 55; index += 1) {
        await store.addPendingTransaction(makePendingTransaction({ txHash: `0x${String(index).padStart(64, '0')}` }))
      }

      expect(store.transactions).toHaveLength(50)
      expect(store.transactions[0].txHash).toBe(`0x${'5'.padStart(64, '0')}`)
      expect(await readStoredHashes()).toHaveLength(50)
    })

    it('keeps the transaction when persistence fails', async () => {
      jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('quota exceeded'))

      await expect(store.addPendingTransaction(makePendingTransaction())).resolves.toBeUndefined()

      expect(store.transactions).toHaveLength(1)
      expect(warnSpy).toHaveBeenCalled()
    })
  })

  describe('updateTransactionStatus', () => {
    beforeEach(async () => {
      await store.addPendingTransaction(makePendingTransaction())
    })

    it('updates status and result, and persists both', async () => {
      await store.updateTransactionStatus(TX_HASH, 'confirmed', { poolId: 7, poolAddress: POOL_ADDRESS })

      expect(store.transactions[0].status).toBe('confirmed')
      expect(store.transactions[0].result).toEqual({ poolId: 7, poolAddress: POOL_ADDRESS })

      const persisted = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? '[]') as PendingTransaction[]
      expect(persisted[0].result).toEqual({ poolId: 7, poolAddress: POOL_ADDRESS })
    })

    it('leaves an existing result in place when none is supplied', async () => {
      await store.updateTransactionStatus(TX_HASH, 'confirmed', { poolId: 7, poolAddress: POOL_ADDRESS })
      await store.updateTransactionStatus(TX_HASH, 'failed')

      expect(store.transactions[0].status).toBe('failed')
      expect(store.transactions[0].result).toEqual({ poolId: 7, poolAddress: POOL_ADDRESS })
    })

    it('ignores an unknown hash', async () => {
      await store.updateTransactionStatus(OTHER_TX_HASH, 'confirmed')

      expect(store.transactions[0].status).toBe('submitted')
      expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1) // only the add
    })
  })

  describe('removePendingTransaction', () => {
    it('removes and persists', async () => {
      await store.addPendingTransaction(makePendingTransaction())
      await store.removePendingTransaction(TX_HASH)

      expect(store.transactions).toHaveLength(0)
      expect(await readStoredHashes()).toEqual([])
    })

    it('does not write when the hash is unknown', async () => {
      await store.addPendingTransaction(makePendingTransaction())
      jest.mocked(AsyncStorage.setItem).mockClear()

      await store.removePendingTransaction(OTHER_TX_HASH)

      expect(store.transactions).toHaveLength(1)
      expect(AsyncStorage.setItem).not.toHaveBeenCalled()
    })
  })

  describe('loadFromStorage', () => {
    it('restores persisted transactions', async () => {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makePendingTransaction()]))

      await store.loadFromStorage()

      expect(store.transactions).toHaveLength(1)
      expect(store.transactions[0].txHash).toBe(TX_HASH)
      expect(store.isLoading).toBe(false)
    })

    it('restores an optional result', async () => {
      const confirmed = makePendingTransaction({ status: 'confirmed', result: { poolId: 7, poolAddress: POOL_ADDRESS } })
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([confirmed]))

      await store.loadFromStorage()

      expect(store.transactions[0].result).toEqual({ poolId: 7, poolAddress: POOL_ADDRESS })
    })

    it('starts empty when nothing is stored', async () => {
      await store.loadFromStorage()

      expect(store.transactions).toHaveLength(0)
    })

    it('recovers from malformed JSON instead of throwing at startup', async () => {
      await AsyncStorage.setItem(STORAGE_KEY, '{ not json')

      await expect(store.loadFromStorage()).resolves.toBeUndefined()

      expect(store.transactions).toHaveLength(0)
      expect(store.isLoading).toBe(false)
      expect(warnSpy).toHaveBeenCalled()
    })

    it('recovers from a read failure', async () => {
      jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('storage unavailable'))

      await store.loadFromStorage()

      expect(store.transactions).toHaveLength(0)
      expect(store.isLoading).toBe(false)
    })

    it('ignores a payload that is not an array', async () => {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ txHash: TX_HASH }))

      await store.loadFromStorage()

      expect(store.transactions).toHaveLength(0)
    })

    it.each([
      ['a non-object entry', 'nonsense'],
      ['a missing hash', { ...makePendingTransaction(), txHash: undefined }],
      ['a non-hex hash', { ...makePendingTransaction(), txHash: 'nope' }],
      ['a non-numeric chainId', { ...makePendingTransaction(), chainId: '31337' }],
      ['an unknown type', { ...makePendingTransaction(), type: 'CLOSE_POOL' }],
      ['an unknown status', { ...makePendingTransaction(), status: 'queued' }],
      ['a missing timestamp', { ...makePendingTransaction(), timestamp: undefined }],
      ['missing params', { ...makePendingTransaction(), params: undefined }],
      ['a numeric maxLoanAmount', { ...makePendingTransaction(), params: { ...makePendingTransaction().params, maxLoanAmount: 1 } }],
      ['a string interestRate', { ...makePendingTransaction(), params: { ...makePendingTransaction().params, interestRate: '500' } }],
    ])('drops an entry left by an older build: %s', async (_label, entry) => {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([entry, makePendingTransaction({ txHash: OTHER_TX_HASH })]))

      await store.loadFromStorage()

      expect(store.transactions.map((transaction) => transaction.txHash)).toEqual([OTHER_TX_HASH])
    })

    it('drops an unusable result but keeps the transaction', async () => {
      const entry = { ...makePendingTransaction(), status: 'confirmed', result: { poolId: '7', poolAddress: POOL_ADDRESS } }
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([entry]))

      await store.loadFromStorage()

      expect(store.transactions).toHaveLength(1)
      expect(store.transactions[0].result).toBeUndefined()
    })

    it('restores a contribution record', async () => {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeContributeTransaction()]))

      await store.loadFromStorage()

      expect(store.transactions).toHaveLength(1)
      expect(store.transactions[0].type).toBe('CONTRIBUTE')
      expect(store.transactions[0].params).toEqual(makeContributeTransaction().params)
    })

    it('restores a contribution result', async () => {
      const confirmed = makeContributeTransaction({ status: 'confirmed', result: { amount: '5000000000000000000' } })
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([confirmed]))

      await store.loadFromStorage()

      expect(store.transactions[0].result).toEqual({ amount: '5000000000000000000' })
    })

    it.each([
      ['a numeric amount', { ...makeContributeTransaction(), params: { ...makeContributeTransaction().params, amount: 5 } }],
      ['a string poolId', { ...makeContributeTransaction(), params: { ...makeContributeTransaction().params, poolId: '1' } }],
      ['a non-hex poolAddress', { ...makeContributeTransaction(), params: { ...makeContributeTransaction().params, poolAddress: 'nope' } }],
      ['a missing poolName', { ...makeContributeTransaction(), params: { ...makeContributeTransaction().params, poolName: undefined } }],
    ])('drops a malformed contribution entry: %s', async (_label, entry) => {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([entry, makeContributeTransaction({ txHash: OTHER_TX_HASH })]))

      await store.loadFromStorage()

      expect(store.transactions.map((transaction) => transaction.txHash)).toEqual([OTHER_TX_HASH])
    })

    it('does not accept pool-creation params on a contribution record', async () => {
      // The types are discriminated, so a record whose `type` and `params`
      // disagree is corrupt and must be dropped rather than half-restored.
      const mismatched = { ...makeContributeTransaction(), params: makePendingTransaction().params }
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([mismatched]))

      await store.loadFromStorage()

      expect(store.transactions).toHaveLength(0)
    })

    it.each(['BORROW', 'REPAY', 'REQUEST_LOAN', 'APPROVE_LOAN', 'REJECT_LOAN', 'CANCEL_LOAN_REQUEST'] as const)(
      'restores a %s record',
      async (type) => {
        // The regression: loan records were dropped on restore, so an app killed
        // after signing lost the only trace of the transaction and startup
        // recovery had nothing to resolve against the chain.
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeLoanTransaction({ type })]))

        await store.loadFromStorage()

        expect(store.transactions).toHaveLength(1)
        expect(store.transactions[0].type).toBe(type)
      }
    )

    it('restores the loan id and borrower an owner decision carries', async () => {
      const entry = makeLoanTransaction({ type: 'APPROVE_LOAN', params: { ...LOAN_PARAMS, loanId: 7, borrower: POOL_OWNER } })
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([entry]))

      await store.loadFromStorage()

      expect(store.transactions[0].params).toMatchObject({ loanId: 7, borrower: POOL_OWNER })
    })

    it('restores a borrow with no loan id, which is a valid state', async () => {
      // The contract assigns the id, so it is genuinely absent until the receipt
      // arrives — a validator that demanded it would drop every live borrow.
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeLoanTransaction({ type: 'BORROW' })]))

      await store.loadFromStorage()

      expect(store.transactions).toHaveLength(1)
      expect(store.transactions[0].params).not.toHaveProperty('loanId')
    })

    it('restores a loan result', async () => {
      const confirmed = makeLoanTransaction({ status: 'confirmed', result: { loanId: 3, amount: '5000000000000000000' } })
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([confirmed]))

      await store.loadFromStorage()

      expect(store.transactions[0].result).toEqual({ loanId: 3, amount: '5000000000000000000' })
    })

    it.each([
      ['a string loanId', { ...LOAN_PARAMS, loanId: '3' }],
      ['a numeric amount', { ...LOAN_PARAMS, amount: 5 }],
      ['a non-hex poolAddress', { ...LOAN_PARAMS, poolAddress: 'nope' }],
    ])('drops a malformed loan entry: %s', async (_label, params) => {
      const entry = { ...makeLoanTransaction(), params }
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([entry, makeContributeTransaction({ txHash: OTHER_TX_HASH })]))

      await store.loadFromStorage()

      expect(store.transactions.map((transaction) => transaction.txHash)).toEqual([OTHER_TX_HASH])
    })

    it('does not accept contribution params on a loan record', async () => {
      // A loan record needs no id, so the shapes overlap — but a result with no
      // `loanId` is still corrupt and must not be half-restored.
      const mismatched = { ...makeLoanTransaction({ status: 'confirmed' }), result: { amount: '1' } }
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([mismatched]))

      await store.loadFromStorage()

      expect(store.transactions[0].result).toBeUndefined()
    })

    it('caps a stored list that grew beyond the limit', async () => {
      const stored = Array.from({ length: 60 }, (_unused, index) =>
        makePendingTransaction({ txHash: `0x${String(index).padStart(64, '0')}` })
      )
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stored))

      await store.loadFromStorage()

      expect(store.transactions).toHaveLength(50)
      expect(store.transactions[0].txHash).toBe(`0x${'10'.padStart(64, '0')}`)
    })
  })

  describe('checkPendingTransactions', () => {
    beforeEach(async () => {
      await store.addPendingTransaction(makePendingTransaction())
    })

    it('confirms a successful transaction and decodes its pool identifiers', async () => {
      await store.checkPendingTransactions(makeClient({ [TX_HASH]: makeReceipt() }, 31337))

      expect(store.transactions[0].status).toBe('confirmed')
      expect(store.transactions[0].result).toEqual({ poolId: 7, poolAddress: POOL_ADDRESS })
      expect(store.confirmedUnindexed).toHaveLength(1)
      expect(store.hasPending).toBe(false)
    })

    it('confirms a contribution by decoding its FundsDeposited log, not PoolCreated', async () => {
      // Recovery has only the stored `type` to tell the two apart, so the wrong
      // extractor here would mark every recovered deposit failed.
      await store.reset()
      await store.addPendingTransaction(makeContributeTransaction())
      const receipt = makeReceipt({ logs: [makeFundsDepositedLog(POOL_OWNER, 5_000_000_000_000_000_000n)] })

      await store.checkPendingTransactions(makeClient({ [TX_HASH]: receipt }, 31337))

      expect(store.transactions[0].status).toBe('confirmed')
      expect(store.transactions[0].result).toEqual({ amount: '5000000000000000000' })
    })

    it('marks a reverted transaction failed', async () => {
      await store.checkPendingTransactions(makeClient({ [TX_HASH]: makeReceipt({ status: 'reverted', logs: [] }) }, 31337))

      expect(store.transactions[0].status).toBe('failed')
      expect(store.transactions[0].result).toBeUndefined()
      expect(store.confirmedUnindexed).toHaveLength(0)
    })

    it('leaves an unmined transaction submitted when Viem throws receipt-not-found', async () => {
      await store.checkPendingTransactions(makeClient({}, 31337))

      expect(store.transactions[0].status).toBe('submitted')
      expect(store.hasPending).toBe(true)
    })

    it('confirms without a result when the receipt carries no PoolCreated log', async () => {
      await store.checkPendingTransactions(makeClient({ [TX_HASH]: makeReceipt({ logs: [] }) }, 31337))

      expect(store.transactions[0].status).toBe('confirmed')
      expect(store.transactions[0].result).toBeUndefined()
    })

    it('skips transactions belonging to another chain', async () => {
      const client = makeClient({ [TX_HASH]: makeReceipt() }, 80002)

      await store.checkPendingTransactions(client)

      expect(store.transactions[0].status).toBe('submitted')
      expect(client.getTransactionReceipt).not.toHaveBeenCalled()
    })

    it('checks every chain when the client has none configured', async () => {
      await store.checkPendingTransactions(makeClient({ [TX_HASH]: makeReceipt() }))

      expect(store.transactions[0].status).toBe('confirmed')
    })

    it('ignores transactions that are already resolved', async () => {
      await store.updateTransactionStatus(TX_HASH, 'confirmed')
      const client = makeClient({ [TX_HASH]: makeReceipt() }, 31337)

      await store.checkPendingTransactions(client)

      expect(client.getTransactionReceipt).not.toHaveBeenCalled()
    })

    it('accepts a real Viem public client', () => {
      // Compile-time assertion: the injected interface must stay satisfiable by
      // the client `usePublicClient()` returns.
      const client: TransactionReceiptReader = createPublicClient({ chain: hardhat, transport: http() })

      expect(client.chain?.id).toBe(hardhat.id)
    })
  })

  describe('reset', () => {
    it('clears state and storage', async () => {
      await store.addPendingTransaction(makePendingTransaction())

      await store.reset()

      expect(store.transactions).toHaveLength(0)
      expect(await readStoredHashes()).toEqual([])
    })
  })

  describe('computed counts', () => {
    it('counts only submitted transactions as pending', async () => {
      await store.addPendingTransaction(makePendingTransaction())
      await store.addPendingTransaction(makePendingTransaction({ txHash: OTHER_TX_HASH, status: 'confirmed' }))

      expect(store.pendingCount).toBe(1)
      expect(store.hasPending).toBe(true)
      expect(store.confirmedUnindexed.map((transaction) => transaction.txHash)).toEqual([OTHER_TX_HASH])
    })
  })
})

describe('extractPoolCreatedResult', () => {
  it('decodes poolId and poolAddress from a PoolCreated log', () => {
    const receipt = makeReceipt({ logs: [makePoolCreatedLog(12n, POOL_ADDRESS)] })

    expect(extractPoolCreatedResult(receipt)).toEqual({ poolId: 12, poolAddress: POOL_ADDRESS })
  })

  it('ignores unrelated logs', () => {
    const unrelated = { ...makePoolCreatedLog(1n, POOL_ADDRESS), topics: ['0x' + 'ab'.repeat(32)] } as ReceiptLog
    const receipt = makeReceipt({ logs: [unrelated] })

    expect(extractPoolCreatedResult(receipt)).toBeUndefined()
  })

  it('returns undefined when there are no logs', () => {
    expect(extractPoolCreatedResult(makeReceipt({ logs: [] }))).toBeUndefined()
  })
})

describe('extractFundsDepositedResult', () => {
  it('decodes the amount from a FundsDeposited log', () => {
    const receipt = makeReceipt({ logs: [makeFundsDepositedLog(POOL_OWNER, 5_000_000_000_000_000_000n)] })

    expect(extractFundsDepositedResult(receipt)).toEqual({ amount: '5000000000000000000' })
  })

  it('reads an indexed amount out of the topics, where the event actually puts it', () => {
    // Both parameters are `indexed`, so a decoder that only looked at `data`
    // would return zero for every deposit.
    const receipt = makeReceipt({ logs: [makeFundsDepositedLog(POOL_OWNER, 1n)] })

    expect(extractFundsDepositedResult(receipt)).toEqual({ amount: '1' })
  })

  it('ignores a PoolCreated log', () => {
    const receipt = makeReceipt({ logs: [makePoolCreatedLog(1n, POOL_ADDRESS)] })

    expect(extractFundsDepositedResult(receipt)).toBeUndefined()
  })

  it('returns undefined when there are no logs', () => {
    expect(extractFundsDepositedResult(makeReceipt({ logs: [] }))).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// The loan actions.
//
// All five events carry the same three indexed parameters, so one extractor
// serves every action — but only if each event name is actually in the list it
// tries. A missing name yields no result, and "no result" is what the monitor
// reads as a confirmed transaction that produced nothing.
// ---------------------------------------------------------------------------

/** Any of the five loan events, encoded through the shipped ABI. */
function makeLoanLog(
  eventName: 'LoanCreated' | 'LoanRepaid' | 'LoanRequested' | 'LoanApproved' | 'LoanRejected',
  loanId: bigint,
  amount: bigint
): ReceiptLog {
  const topics = encodeEventTopics({
    abi: SampleLendingPoolABI,
    eventName,
    args: { loanId, borrower: POOL_OWNER, amount },
  })

  return {
    address: POOL_ADDRESS,
    topics,
    // All three parameters are `indexed`, as with `FundsDeposited`.
    data: '0x',
    blockHash: '0xdead000000000000000000000000000000000000000000000000000000000001',
    blockNumber: 42n,
    logIndex: 0,
    transactionHash: TX_HASH,
    transactionIndex: 0,
    removed: false,
  } as ReceiptLog
}

describe('extractLoanResult', () => {
  it.each(['LoanCreated', 'LoanRepaid', 'LoanRequested', 'LoanApproved', 'LoanRejected'] as const)(
    'decodes the id and amount from a %s log',
    (eventName) => {
      const receipt = makeReceipt({ logs: [makeLoanLog(eventName, 4n, 3_000_000_000_000_000_000n)] })

      expect(extractLoanResult(receipt)).toEqual({ loanId: 4, amount: '3000000000000000000' })
    }
  )

  it('reads a cancellation, which emits LoanRejected rather than an event of its own', () => {
    // The record tracks the state, not who ended the request.
    const receipt = makeReceipt({ logs: [makeLoanLog('LoanRejected', 9n, 1n)] })

    expect(extractLoanResult(receipt)).toEqual({ loanId: 9, amount: '1' })
  })

  it('ignores a deposit', () => {
    const receipt = makeReceipt({ logs: [makeFundsDepositedLog(POOL_OWNER, 1n)] })

    expect(extractLoanResult(receipt)).toBeUndefined()
  })

  it('returns undefined when there are no logs', () => {
    expect(extractLoanResult(makeReceipt({ logs: [] }))).toBeUndefined()
  })
})

describe('extractResult dispatch', () => {
  it.each(['BORROW', 'REPAY', 'REQUEST_LOAN', 'APPROVE_LOAN', 'REJECT_LOAN', 'CANCEL_LOAN_REQUEST'] as const)(
    'routes %s to the loan extractor',
    (type) => {
      // Startup recovery has only the stored type to go on, and picking the
      // wrong extractor finds no log.
      const receipt = makeReceipt({ logs: [makeLoanLog('LoanApproved', 2n, 5n)] })

      expect(extractResult(type, receipt)).toEqual({ loanId: 2, amount: '5' })
    }
  )

  it('does not route a contribution to the loan extractor', () => {
    const receipt = makeReceipt({ logs: [makeFundsDepositedLog(POOL_OWNER, 5n)] })

    expect(extractResult('CONTRIBUTE', receipt)).toEqual({ amount: '5' })
  })
})

describe('isLoanTransactionType', () => {
  it.each(['BORROW', 'REPAY', 'REQUEST_LOAN', 'APPROVE_LOAN', 'REJECT_LOAN', 'CANCEL_LOAN_REQUEST'] as const)('claims %s', (type) => {
    expect(isLoanTransactionType(type)).toBe(true)
  })

  it.each(['CREATE_POOL', 'CONTRIBUTE', 'WITHDRAW'] as const)('does not claim %s', (type) => {
    expect(isLoanTransactionType(type)).toBe(false)
  })
})
