import { mockLogger } from '../__tests__/setup'
import type { ParsedLoanRepaymentEvent } from './loanRepaymentIndexer'

// ---------------------------------------------------------------------------
// Shared mock references — captured at module-definition time so tests can
// configure them per-case via mockReturnValue / mockImplementation.
// ---------------------------------------------------------------------------
const mockDecodeEventLog = jest.fn()
const mockGetEvent = jest.fn()
const mockGetPoolId = jest.fn()

// Mock ethers BEFORE importing the module under test. The module creates a
// top-level `new Interface([...LendingPoolABI])`, so the mock must be in
// place before the first `require`.
jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers')
  return {
    ...actual,
    Interface: jest.fn().mockImplementation(() => ({
      decodeEventLog: mockDecodeEventLog,
      getEvent: mockGetEvent,
    })),
    Contract: jest.fn().mockImplementation(() => ({
      getPoolId: mockGetPoolId,
    })),
  }
})

mockGetEvent.mockReturnValue({ topicHash: '0xLOAN_REPAYMENT_MADE_TOPIC' })

// Import AFTER mocks are registered
const {
  parseLoanRepaymentLog,
  indexLoanRepaymentEvent,
  indexLoanRepaymentsByTxHash,
  loanRepaymentDocId,
} = require('./loanRepaymentIndexer')

// ---------------------------------------------------------------------------
// Shared test constants
// ---------------------------------------------------------------------------

const CHAIN_ID = 31337
const TX_HASH = '0xabc123def456'
const BLOCK_NUMBER = 100
const BLOCK_TIMESTAMP = 1700000000
const LOAN_REPAYMENT_MADE_TOPIC = '0xLOAN_REPAYMENT_MADE_TOPIC'
const POOL_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3'
const FACTORY_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'
const BORROWER = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * What Firestore throws when `create()` hits an existing document: a plain
 * Error carrying the gRPC status, not a typed class the SDK exports.
 */
function alreadyExistsError(): Error & { code: number } {
  return Object.assign(new Error('6 ALREADY_EXISTS: entity already exists'), { code: 6 })
}

function buildMockLog(
  overrides: Partial<{
    data: string
    topics: string[]
    transactionHash: string
    blockNumber: number
    index: number
    address: string
  }> = {}
) {
  return {
    // All three LoanRepaymentMade parameters are `indexed`, so a real log
    // carries no data.
    data: '0x',
    topics: [LOAN_REPAYMENT_MADE_TOPIC, '0xloanId', '0xborrower', '0xamount'],
    transactionHash: TX_HASH,
    blockNumber: BLOCK_NUMBER,
    index: 0,
    address: POOL_ADDRESS,
    ...overrides,
  }
}

function makeDefaultDecodeReturn(overrides: Record<string, unknown> = {}) {
  return {
    loanId: 4n,
    borrower: BORROWER,
    amount: BigInt('2000000000000000000'),
    ...overrides,
  }
}

function buildParsedRepayment(overrides: Partial<ParsedLoanRepaymentEvent> = {}): ParsedLoanRepaymentEvent {
  return {
    loanId: 4,
    poolId: 1,
    poolAddress: POOL_ADDRESS,
    borrower: BORROWER.toLowerCase(),
    amount: '2000000000000000000',
    chainId: CHAIN_ID,
    transactionHash: TX_HASH,
    logIndex: 0,
    blockNumber: BLOCK_NUMBER,
    repaidAt: new Date(BLOCK_TIMESTAMP * 1000),
    ...overrides,
  }
}

function buildFirestore(create = jest.fn().mockResolvedValue(undefined)) {
  const doc = jest.fn().mockReturnValue({ create })
  const collection = jest.fn().mockReturnValue({ doc })

  return { firestore: { collection } as never, collection, doc, create }
}

function buildProvider(
  overrides: Partial<{
    receipt: unknown
    block: unknown
  }> = {}
) {
  return {
    getTransactionReceipt: jest
      .fn()
      .mockResolvedValue(
        overrides.receipt === undefined ? { status: 1, blockNumber: BLOCK_NUMBER, logs: [buildMockLog()] } : overrides.receipt
      ),
    getBlock: jest.fn().mockResolvedValue(overrides.block === undefined ? { timestamp: BLOCK_TIMESTAMP } : overrides.block),
  } as never
}

// ---------------------------------------------------------------------------
// loanRepaymentDocId
// ---------------------------------------------------------------------------

describe('loanRepaymentDocId', () => {
  it('should key on the log, so a loan can carry many payments', () => {
    // Arrange & Act — the whole reason this is not keyed on the loan: with
    // instalments, `${chainId}-${poolId}-${loanId}` would collapse a
    // borrower's payments onto one document and keep only the last.
    const first = loanRepaymentDocId(CHAIN_ID, TX_HASH, 0)
    const second = loanRepaymentDocId(CHAIN_ID, TX_HASH, 1)

    // Assert
    expect(first).not.toBe(second)
    expect(first).toBe(`${CHAIN_ID}-${TX_HASH}-0`)
  })

  it('should lowercase the transaction hash so casing cannot fork the document id', () => {
    // Arrange & Act
    const result = loanRepaymentDocId(CHAIN_ID, '0xABCDEF', 2)

    // Assert
    expect(result).toBe(`${CHAIN_ID}-0xabcdef-2`)
  })
})

// ---------------------------------------------------------------------------
// parseLoanRepaymentLog
// ---------------------------------------------------------------------------

describe('parseLoanRepaymentLog', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDecodeEventLog.mockReturnValue(makeDefaultDecodeReturn())
    mockGetEvent.mockReturnValue({ topicHash: LOAN_REPAYMENT_MADE_TOPIC })
  })

  it('should parse a valid LoanRepaymentMade log', () => {
    // Act
    const result = parseLoanRepaymentLog(buildMockLog(), CHAIN_ID, BLOCK_TIMESTAMP)

    // Assert
    expect(result.loanId).toBe(4)
    expect(result.poolAddress).toBe(POOL_ADDRESS)
    expect(result.amount).toBe('2000000000000000000')
    expect(result.chainId).toBe(CHAIN_ID)
    expect(result.transactionHash).toBe(TX_HASH)
    expect(result.blockNumber).toBe(BLOCK_NUMBER)
  })

  it('should decode from topics, since all three parameters are indexed', () => {
    // Arrange — a real log has no `data`; a decoder reading only `data` would
    // return zero for every payment.
    const log = buildMockLog({ data: '0x' })

    // Act
    parseLoanRepaymentLog(log, CHAIN_ID, BLOCK_TIMESTAMP)

    // Assert
    expect(mockDecodeEventLog).toHaveBeenCalledWith('LoanRepaymentMade', '0x', log.topics)
  })

  it('should take the pool address from the emitting contract, not from the event body', () => {
    // Arrange — the event has no pool field; the log's own address is the pool.
    const log = buildMockLog({ address: '0xAnotherPool' })

    // Act
    const result = parseLoanRepaymentLog(log, CHAIN_ID, BLOCK_TIMESTAMP)

    // Assert
    expect(result.poolAddress).toBe('0xAnotherPool')
  })

  it('should lowercase the borrower so listLoanRepayments can filter by wallet', () => {
    // Act
    const result = parseLoanRepaymentLog(buildMockLog(), CHAIN_ID, BLOCK_TIMESTAMP)

    // Assert
    expect(result.borrower).toBe(BORROWER.toLowerCase())
  })

  it("should read ethers v6's `index`, not v5's `logIndex`", () => {
    // Arrange — the old name yields `undefined` and collapses every log in a
    // transaction onto one document id.
    const log = buildMockLog({ index: 3 })

    // Act
    const result = parseLoanRepaymentLog(log, CHAIN_ID, BLOCK_TIMESTAMP)

    // Assert
    expect(result.logIndex).toBe(3)
  })

  it('should date the payment by its block, which is the only date it has', () => {
    // Act
    const result = parseLoanRepaymentLog(buildMockLog(), CHAIN_ID, BLOCK_TIMESTAMP)

    // Assert — the loan's `repaidAt` dates only the payment that settles it, so
    // an instalment that is not the last has nowhere else to get a date from.
    expect(result.repaidAt).toEqual(new Date(BLOCK_TIMESTAMP * 1000))
  })

  it('should throw with context when the log cannot be decoded', () => {
    // Arrange
    mockDecodeEventLog.mockImplementation(() => {
      throw new Error('bad topics')
    })

    // Act & Assert
    expect(() => parseLoanRepaymentLog(buildMockLog(), CHAIN_ID, BLOCK_TIMESTAMP)).toThrow(
      'Failed to decode LoanRepaymentMade log: bad topics'
    )
  })
})

// ---------------------------------------------------------------------------
// indexLoanRepaymentEvent
// ---------------------------------------------------------------------------

describe('indexLoanRepaymentEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockLogger.info.mockClear()
  })

  it('should write the payment and report it stored', async () => {
    // Arrange
    const { firestore, collection, doc, create } = buildFirestore()

    // Act
    const result = await indexLoanRepaymentEvent(buildParsedRepayment(), firestore)

    // Assert
    expect(collection).toHaveBeenCalledWith('loan_repayments')
    expect(doc).toHaveBeenCalledWith(`${CHAIN_ID}-${TX_HASH}-0`)
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        loanId: 4,
        poolId: 1,
        borrower: BORROWER.toLowerCase(),
        amount: '2000000000000000000',
      })
    )
    expect(result).toEqual({ id: `${CHAIN_ID}-${TX_HASH}-0`, loanId: 4, poolId: 1, alreadyIndexed: false, stored: true })
  })

  it('should treat an existing document as already indexed rather than failing', async () => {
    // Arrange — `create()` racing itself is the normal case: the callable and
    // the sweep both index the same transaction.
    const { firestore } = buildFirestore(jest.fn().mockRejectedValue(alreadyExistsError()))

    // Act
    const result = await indexLoanRepaymentEvent(buildParsedRepayment(), firestore)

    // Assert
    expect(result).toEqual({ id: `${CHAIN_ID}-${TX_HASH}-0`, loanId: 4, poolId: 1, alreadyIndexed: true, stored: false })
  })

  it('should rethrow any failure that is not a collision', async () => {
    // Arrange
    const { firestore } = buildFirestore(jest.fn().mockRejectedValue(new Error('network down')))

    // Act & Assert
    await expect(indexLoanRepaymentEvent(buildParsedRepayment(), firestore)).rejects.toThrow('network down')
  })

  it('should record each instalment separately rather than a running total', async () => {
    // Arrange — two payments towards the same loan in different transactions.
    const { firestore, doc, create } = buildFirestore()

    // Act
    await indexLoanRepaymentEvent(buildParsedRepayment({ amount: '1000000000000000000' }), firestore)
    await indexLoanRepaymentEvent(
      buildParsedRepayment({ amount: '4250000000000000000', transactionHash: '0xsecond', logIndex: 0 }),
      firestore
    )

    // Assert — different documents, each carrying what it paid. The sum is a
    // read-time question, and the loan's own `amountRepaid` answers it from
    // the chain.
    expect(doc).toHaveBeenNthCalledWith(1, `${CHAIN_ID}-${TX_HASH}-0`)
    expect(doc).toHaveBeenNthCalledWith(2, `${CHAIN_ID}-0xsecond-0`)
    expect(create).toHaveBeenNthCalledWith(1, expect.objectContaining({ amount: '1000000000000000000' }))
    expect(create).toHaveBeenNthCalledWith(2, expect.objectContaining({ amount: '4250000000000000000' }))
  })
})

// ---------------------------------------------------------------------------
// indexLoanRepaymentsByTxHash
// ---------------------------------------------------------------------------

describe('indexLoanRepaymentsByTxHash', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDecodeEventLog.mockReturnValue(makeDefaultDecodeReturn())
    mockGetEvent.mockReturnValue({ topicHash: LOAN_REPAYMENT_MADE_TOPIC })
    mockGetPoolId.mockResolvedValue(1n)
  })

  it('should index every payment in the transaction', async () => {
    // Arrange
    const { firestore } = buildFirestore()

    // Act
    const { repayments, results } = await indexLoanRepaymentsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, buildProvider(), firestore)

    // Assert
    expect(repayments).toHaveLength(1)
    expect(results[0].stored).toBe(true)
  })

  /**
   * The difference from every other `…ByTxHash` helper here.
   *
   * Those are each the whole job of a callable, so nothing found means the
   * caller asked about the wrong transaction. This one runs beside loan
   * indexing on every loan transaction, and a borrow, an approval and a
   * rejection all carry no payment at all.
   */
  it('should return an empty result rather than throwing when nothing was repaid', async () => {
    // Arrange — a loan transaction with no repayment log in it.
    const { firestore } = buildFirestore()
    const provider = buildProvider({
      receipt: { status: 1, blockNumber: BLOCK_NUMBER, logs: [buildMockLog({ topics: ['0xSOMETHING_ELSE'] })] },
    })

    // Act
    const result = await indexLoanRepaymentsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)

    // Assert
    expect(result).toEqual({ repayments: [], results: [] })
  })

  it('should reject a transaction that was never mined', async () => {
    // Arrange
    const { firestore } = buildFirestore()

    // Act & Assert
    await expect(
      indexLoanRepaymentsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, buildProvider({ receipt: null }), firestore)
    ).rejects.toThrow('Transaction receipt not found')
  })

  it('should reject a transaction that reverted', async () => {
    // Arrange
    const { firestore } = buildFirestore()
    const provider = buildProvider({ receipt: { status: 0, blockNumber: BLOCK_NUMBER, logs: [buildMockLog()] } })

    // Act & Assert
    await expect(indexLoanRepaymentsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)).rejects.toThrow(
      'Transaction was reverted or failed'
    )
  })

  it('should skip a payment emitted by a contract the factory does not know', async () => {
    // Arrange — anyone can emit an identically-shaped event, and indexing one
    // would put a stranger's payment in a user's history.
    const { firestore, create } = buildFirestore()
    mockGetPoolId.mockResolvedValue(0n)

    // Act
    const { repayments } = await indexLoanRepaymentsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, buildProvider(), firestore)

    // Assert
    expect(repayments).toHaveLength(0)
    expect(create).not.toHaveBeenCalled()
  })
})
