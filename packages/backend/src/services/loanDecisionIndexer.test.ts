import { mockLogger } from '../__tests__/setup'
import type { ParsedLoanDecision } from './loanDecisionIndexer'

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

const APPROVED_TOPIC = '0xLOAN_APPROVED_TOPIC'
const REJECTED_TOPIC = '0xLOAN_REJECTED_TOPIC'
const DEFAULTED_TOPIC = '0xLOAN_DEFAULTED_TOPIC'

// Per name, not one value for all three: a single topic hash would collapse the
// three events onto one entry and every log would decode as whichever won.
mockGetEvent.mockImplementation((name: string) => {
  const topics: Record<string, string> = {
    LoanApproved: APPROVED_TOPIC,
    LoanRejected: REJECTED_TOPIC,
    LoanDefaulted: DEFAULTED_TOPIC,
  }

  return { topicHash: topics[name] }
})

// Import AFTER mocks are registered
const {
  parseLoanDecisionLog,
  indexLoanDecisionEvent,
  indexLoanDecisionsByTxHash,
  readDecisionSender,
  loanDecisionDocId,
  isLoanDecisionLog,
  LOAN_DECISION_TOPICS,
} = require('./loanDecisionIndexer')

// ---------------------------------------------------------------------------
// Shared test constants
// ---------------------------------------------------------------------------

const CHAIN_ID = 31337
const TX_HASH = '0xabc123def456'
const BLOCK_NUMBER = 100
const BLOCK_TIMESTAMP = 1700000000
const POOL_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3'
const FACTORY_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'
const BORROWER = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc'
const OWNER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

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
    // All three parameters of all three decision events are `indexed`, so a
    // real log carries no data.
    data: '0x',
    topics: [APPROVED_TOPIC, '0xloanId', '0xborrower', '0xamount'],
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

function buildParsedDecision(overrides: Partial<ParsedLoanDecision> = {}): ParsedLoanDecision {
  return {
    loanId: 4,
    poolId: 1,
    poolAddress: POOL_ADDRESS,
    borrower: BORROWER.toLowerCase(),
    amount: '2000000000000000000',
    outcome: 'approved',
    decidedBy: OWNER.toLowerCase(),
    chainId: CHAIN_ID,
    transactionHash: TX_HASH,
    logIndex: 0,
    blockNumber: BLOCK_NUMBER,
    decidedAt: new Date(BLOCK_TIMESTAMP * 1000),
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
    transaction: unknown
  }> = {}
) {
  return {
    getTransactionReceipt: jest
      .fn()
      .mockResolvedValue(
        overrides.receipt === undefined ? { status: 1, blockNumber: BLOCK_NUMBER, from: OWNER, logs: [buildMockLog()] } : overrides.receipt
      ),
    getBlock: jest.fn().mockResolvedValue(overrides.block === undefined ? { timestamp: BLOCK_TIMESTAMP } : overrides.block),
    getTransaction: jest.fn().mockResolvedValue(overrides.transaction === undefined ? { from: OWNER } : overrides.transaction),
  } as never
}

// ---------------------------------------------------------------------------
// loanDecisionDocId
// ---------------------------------------------------------------------------

describe('loanDecisionDocId', () => {
  it('should key on the log, so one loan can carry several decisions', () => {
    // Arrange & Act — the whole reason this is not keyed on the loan: an
    // approval and a later declaration of default are both decisions about the
    // same loan, and `${chainId}-${poolId}-${loanId}` would keep only the last.
    const first = loanDecisionDocId(CHAIN_ID, TX_HASH, 0)
    const second = loanDecisionDocId(CHAIN_ID, '0xdifferent', 0)

    // Assert
    expect(first).not.toBe(second)
    expect(first).toBe(`${CHAIN_ID}-${TX_HASH}-0`)
  })

  it('should lowercase the transaction hash so casing cannot fork the document id', () => {
    // Arrange & Act
    const result = loanDecisionDocId(CHAIN_ID, '0xABCDEF', 2)

    // Assert
    expect(result).toBe(`${CHAIN_ID}-0xabcdef-2`)
  })
})

// ---------------------------------------------------------------------------
// LOAN_DECISION_TOPICS / isLoanDecisionLog
// ---------------------------------------------------------------------------

describe('LOAN_DECISION_TOPICS', () => {
  it('should carry only the three events somebody can be asked about', () => {
    // Assert — a request, a disbursement and a repayment all happen, but
    // nobody decided them. A pool that lends on demand makes no decisions at
    // all, which is the right answer for it rather than a gap.
    expect([...LOAN_DECISION_TOPICS]).toEqual([APPROVED_TOPIC, REJECTED_TOPIC, DEFAULTED_TOPIC])
  })

  it('should recognise its own logs and nothing else', () => {
    // Assert
    expect(isLoanDecisionLog(buildMockLog({ topics: [REJECTED_TOPIC] }))).toBe(true)
    expect(isLoanDecisionLog(buildMockLog({ topics: ['0xLOAN_REPAYMENT_MADE_TOPIC'] }))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// parseLoanDecisionLog
// ---------------------------------------------------------------------------

describe('parseLoanDecisionLog', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDecodeEventLog.mockReturnValue(makeDefaultDecodeReturn())
  })

  it('should parse an approval', () => {
    // Act
    const result = parseLoanDecisionLog(buildMockLog(), CHAIN_ID, BLOCK_TIMESTAMP, OWNER)

    // Assert
    expect(result.loanId).toBe(4)
    expect(result.poolAddress).toBe(POOL_ADDRESS)
    expect(result.amount).toBe('2000000000000000000')
    expect(result.outcome).toBe('approved')
    expect(result.decidedAt).toEqual(new Date(BLOCK_TIMESTAMP * 1000))
    expect(result.blockNumber).toBe(BLOCK_NUMBER)
  })

  it('should decode each event by its own name', () => {
    // Arrange — three events share this path and only the topic says which.
    const log = buildMockLog({ topics: [DEFAULTED_TOPIC] })
    mockDecodeEventLog.mockReturnValue(makeDefaultDecodeReturn({ outstanding: BigInt('7') }))

    // Act
    parseLoanDecisionLog(log, CHAIN_ID, BLOCK_TIMESTAMP, OWNER)

    // Assert
    expect(mockDecodeEventLog).toHaveBeenCalledWith('LoanDefaulted', '0x', log.topics)
  })

  it('should read a default declaration from `outstanding`, not `amount`', () => {
    // Arrange — LoanDefaulted names its third parameter for what it is: the
    // debt at that block, not the sum lent. Reading `amount` yields undefined
    // and stores a declaration worth zero.
    mockDecodeEventLog.mockReturnValue({ loanId: 4n, borrower: BORROWER, outstanding: BigInt('3300000000000000000') })

    // Act
    const result = parseLoanDecisionLog(buildMockLog({ topics: [DEFAULTED_TOPIC] }), CHAIN_ID, BLOCK_TIMESTAMP, OWNER)

    // Assert
    expect(result.amount).toBe('3300000000000000000')
    expect(result.outcome).toBe('defaulted')
  })

  it('should record an owner turning a request down as rejected', () => {
    // Act
    const result = parseLoanDecisionLog(buildMockLog({ topics: [REJECTED_TOPIC] }), CHAIN_ID, BLOCK_TIMESTAMP, OWNER)

    // Assert
    expect(result.outcome).toBe('rejected')
    expect(result.decidedBy).toBe(OWNER.toLowerCase())
  })

  it('should record a borrower withdrawing their own request as cancelled', () => {
    // Arrange — `cancelLoanRequest` emits the same LoanRejected and leaves the
    // loan in the same state, so the sender is the only thing that separates
    // a refusal from somebody changing their mind. Cased differently on
    // purpose: wallets report checksummed addresses.
    const log = buildMockLog({ topics: [REJECTED_TOPIC] })

    // Act
    const result = parseLoanDecisionLog(log, CHAIN_ID, BLOCK_TIMESTAMP, BORROWER.toLowerCase())

    // Assert
    expect(result.outcome).toBe('cancelled')
    expect(result.decidedBy).toBe(BORROWER.toLowerCase())
  })

  it('should not read a cancellation into an approval or a declaration', () => {
    // Arrange — an owner borrowing from their own pool is both parties, and
    // only the rejected path is ambiguous.
    mockDecodeEventLog.mockReturnValue(makeDefaultDecodeReturn({ borrower: OWNER, outstanding: BigInt('1') }))

    // Act
    const approved = parseLoanDecisionLog(buildMockLog(), CHAIN_ID, BLOCK_TIMESTAMP, OWNER)
    const defaulted = parseLoanDecisionLog(buildMockLog({ topics: [DEFAULTED_TOPIC] }), CHAIN_ID, BLOCK_TIMESTAMP, OWNER)

    // Assert
    expect(approved.outcome).toBe('approved')
    expect(defaulted.outcome).toBe('defaulted')
  })

  it('should lowercase both addresses so a filter cannot miss on casing', () => {
    // Act
    const result = parseLoanDecisionLog(buildMockLog(), CHAIN_ID, BLOCK_TIMESTAMP, OWNER)

    // Assert
    expect(result.borrower).toBe(BORROWER.toLowerCase())
    expect(result.decidedBy).toBe(OWNER.toLowerCase())
  })

  it('should take the log position from `index`, which is what ethers v6 calls it', () => {
    // Arrange — v5's `logIndex` reads undefined here and would collapse every
    // decision in a transaction onto one document id.
    const log = buildMockLog({ index: 3 })

    // Act
    const result = parseLoanDecisionLog(log, CHAIN_ID, BLOCK_TIMESTAMP, OWNER)

    // Assert
    expect(result.logIndex).toBe(3)
  })

  it('should refuse a log that is not a decision', () => {
    // Act & Assert — the caller filters, but a mistake there must not be
    // decoded as whichever event happens to be first.
    expect(() => parseLoanDecisionLog(buildMockLog({ topics: ['0xSOMETHING_ELSE'] }), CHAIN_ID, BLOCK_TIMESTAMP, OWNER)).toThrow(
      'Not a loan decision log'
    )
  })

  it('should name the event it failed to decode', () => {
    // Arrange
    mockDecodeEventLog.mockImplementation(() => {
      throw new Error('bad data')
    })

    // Act & Assert
    expect(() => parseLoanDecisionLog(buildMockLog({ topics: [REJECTED_TOPIC] }), CHAIN_ID, BLOCK_TIMESTAMP, OWNER)).toThrow(
      'Failed to decode LoanRejected log'
    )
  })
})

// ---------------------------------------------------------------------------
// readDecisionSender
// ---------------------------------------------------------------------------

describe('readDecisionSender', () => {
  beforeEach(() => jest.clearAllMocks())

  it('should return the transaction sender', async () => {
    // Act
    const result = await readDecisionSender(TX_HASH, buildProvider())

    // Assert
    expect(result).toBe(OWNER)
  })

  it('should throw rather than guess when the sender cannot be read', async () => {
    // Arrange — the guess would be written once and read as history forever,
    // and on a rejection the two possible guesses are opposite claims about a
    // person. Skipping the log leaves it to a later re-scan.
    const provider = buildProvider({ transaction: null })

    // Act & Assert
    await expect(readDecisionSender(TX_HASH, provider)).rejects.toThrow('Transaction not found')
  })
})

// ---------------------------------------------------------------------------
// indexLoanDecisionEvent
// ---------------------------------------------------------------------------

describe('indexLoanDecisionEvent', () => {
  beforeEach(() => jest.clearAllMocks())

  it('should store a decision under its log id', async () => {
    // Arrange
    const { firestore, collection, doc, create } = buildFirestore()

    // Act
    const result = await indexLoanDecisionEvent(buildParsedDecision(), firestore)

    // Assert
    expect(collection).toHaveBeenCalledWith('loan_decisions')
    expect(doc).toHaveBeenCalledWith(`${CHAIN_ID}-${TX_HASH}-0`)
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        loanId: 4,
        poolId: 1,
        borrower: BORROWER.toLowerCase(),
        outcome: 'approved',
        decidedBy: OWNER.toLowerCase(),
        amount: '2000000000000000000',
        decidedAt: new Date(BLOCK_TIMESTAMP * 1000),
      })
    )
    expect(result).toMatchObject({ stored: true, alreadyIndexed: false, outcome: 'approved' })
  })

  it('should treat an existing document as already indexed rather than an error', async () => {
    // Arrange — a re-scan of a range covers decisions it has already written,
    // and `create()` refusing is what makes that idempotent.
    const create = jest.fn().mockRejectedValue(alreadyExistsError())
    const { firestore } = buildFirestore(create)

    // Act
    const result = await indexLoanDecisionEvent(buildParsedDecision(), firestore)

    // Assert
    expect(result).toMatchObject({ stored: false, alreadyIndexed: true })
    expect(mockLogger.info).toHaveBeenCalledWith('Loan decision already indexed, skipping', expect.any(Object))
  })

  it('should propagate any other write failure', async () => {
    // Arrange
    const create = jest.fn().mockRejectedValue(Object.assign(new Error('unavailable'), { code: 14 }))
    const { firestore } = buildFirestore(create)

    // Act & Assert
    await expect(indexLoanDecisionEvent(buildParsedDecision(), firestore)).rejects.toThrow('unavailable')
  })
})

// ---------------------------------------------------------------------------
// indexLoanDecisionsByTxHash
// ---------------------------------------------------------------------------

describe('indexLoanDecisionsByTxHash', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDecodeEventLog.mockReturnValue(makeDefaultDecodeReturn())
    mockGetPoolId.mockResolvedValue(1n)
  })

  it('should index the decisions a transaction recorded', async () => {
    // Arrange
    const { firestore, create } = buildFirestore()
    const provider = buildProvider()

    // Act
    const result = await indexLoanDecisionsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)

    // Assert
    expect(result.decisions).toHaveLength(1)
    expect(result.results[0]).toMatchObject({ stored: true })
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('should take the sender from the receipt rather than asking again', async () => {
    // Arrange — the receipt already carries `from`, so this path costs no
    // extra round trip for the one field that separates a refusal from a
    // withdrawal.
    const { firestore } = buildFirestore()
    const provider = buildProvider()

    // Act
    const result = await indexLoanDecisionsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)

    // Assert
    expect(result.decisions[0].decidedBy).toBe(OWNER.toLowerCase())
    expect((provider as unknown as { getTransaction: jest.Mock }).getTransaction).not.toHaveBeenCalled()
  })

  it('should return nothing for a transaction that decided nothing', async () => {
    // Arrange — this runs beside loan indexing on every loan transaction, and
    // requests, disbursements and repayments decide nothing.
    const { firestore, create } = buildFirestore()
    const provider = buildProvider({
      receipt: { status: 1, blockNumber: BLOCK_NUMBER, from: OWNER, logs: [buildMockLog({ topics: ['0xOTHER'] })] },
    })

    // Act
    const result = await indexLoanDecisionsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)

    // Assert
    expect(result).toEqual({ decisions: [], results: [] })
    expect(create).not.toHaveBeenCalled()
    expect((provider as unknown as { getBlock: jest.Mock }).getBlock).not.toHaveBeenCalled()
  })

  it('should skip a decision emitted by a contract the factory does not know', async () => {
    // Arrange — anyone can emit an identically-shaped event, and indexing one
    // would put a stranger's judgement in a pool's history.
    mockGetPoolId.mockResolvedValue(0n)
    const { firestore, create } = buildFirestore()

    // Act
    const result = await indexLoanDecisionsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, buildProvider(), firestore)

    // Assert
    expect(result.decisions).toHaveLength(0)
    expect(create).not.toHaveBeenCalled()
  })

  it('should reject a transaction with no receipt', async () => {
    // Arrange
    const { firestore } = buildFirestore()

    // Act & Assert
    await expect(
      indexLoanDecisionsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, buildProvider({ receipt: null }), firestore)
    ).rejects.toThrow('Transaction receipt not found')
  })

  it('should reject a reverted transaction', async () => {
    // Arrange — a decision that failed is not a decision.
    const { firestore } = buildFirestore()
    const provider = buildProvider({ receipt: { status: 0, blockNumber: BLOCK_NUMBER, from: OWNER, logs: [] } })

    // Act & Assert
    await expect(indexLoanDecisionsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)).rejects.toThrow(
      'Transaction was reverted or failed'
    )
  })

  it('should fail when the block cannot be read, rather than dating a decision now', async () => {
    // Arrange — `decidedAt` is the block's time; falling back to the server's
    // clock would date a swept decision at the moment of the sweep.
    const { firestore } = buildFirestore()

    // Act & Assert
    await expect(indexLoanDecisionsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, buildProvider({ block: null }), firestore)).rejects.toThrow(
      'Failed to fetch block'
    )
  })
})
