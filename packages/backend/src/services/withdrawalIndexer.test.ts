import { mockLogger } from '../__tests__/setup'
import type { ParsedWithdrawalEvent } from './withdrawalIndexer'

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

// Import AFTER mocks are registered
const { parseFundsWithdrawnLog, indexWithdrawalEvent, indexWithdrawalsByTxHash, withdrawalDocId } = require('./withdrawalIndexer')

// ---------------------------------------------------------------------------
// Shared test constants
// ---------------------------------------------------------------------------

const CHAIN_ID = 31337
const TX_HASH = '0xabc123def456'
const BLOCK_NUMBER = 100
const BLOCK_TIMESTAMP = 1700000000
const FUNDS_WITHDRAWN_TOPIC = '0xFUNDS_WITHDRAWN_TOPIC'
const POOL_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3'
const FACTORY_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'
const MEMBER = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc'

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
    // Both FundsWithdrawn parameters are `indexed`, so a real log carries no data.
    data: '0x',
    topics: [FUNDS_WITHDRAWN_TOPIC, '0xmember', '0xamount'],
    transactionHash: TX_HASH,
    blockNumber: BLOCK_NUMBER,
    index: 0,
    address: POOL_ADDRESS,
    ...overrides,
  }
}

function makeDefaultDecodeReturn(overrides: Record<string, unknown> = {}) {
  return {
    member: MEMBER,
    amount: BigInt('1000000000000000000'),
    ...overrides,
  }
}

function buildParsedWithdrawal(overrides: Partial<ParsedWithdrawalEvent> = {}): ParsedWithdrawalEvent {
  return {
    poolId: 1,
    poolAddress: POOL_ADDRESS,
    member: MEMBER.toLowerCase(),
    amount: '1000000000000000000',
    chainId: CHAIN_ID,
    transactionHash: TX_HASH,
    logIndex: 0,
    blockNumber: BLOCK_NUMBER,
    withdrawnAt: new Date(BLOCK_TIMESTAMP * 1000),
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
// withdrawalDocId
// ---------------------------------------------------------------------------

describe('withdrawalDocId', () => {
  it('should key on the log, not the transaction, so one tx can carry several withdrawals', () => {
    // Arrange & Act
    const first = withdrawalDocId(CHAIN_ID, TX_HASH, 0)
    const second = withdrawalDocId(CHAIN_ID, TX_HASH, 1)

    // Assert
    expect(first).not.toBe(second)
    expect(first).toBe(`${CHAIN_ID}-${TX_HASH}-0`)
  })

  it('should lowercase the transaction hash so casing cannot fork the document id', () => {
    // Arrange & Act
    const result = withdrawalDocId(CHAIN_ID, '0xABCDEF', 2)

    // Assert
    expect(result).toBe(`${CHAIN_ID}-0xabcdef-2`)
  })
})

// ---------------------------------------------------------------------------
// parseFundsWithdrawnLog
// ---------------------------------------------------------------------------

describe('parseFundsWithdrawnLog', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDecodeEventLog.mockReturnValue(makeDefaultDecodeReturn())
    mockGetEvent.mockReturnValue({ topicHash: FUNDS_WITHDRAWN_TOPIC })
  })

  it('should parse a valid FundsWithdrawn log', () => {
    // Act
    const result = parseFundsWithdrawnLog(buildMockLog(), CHAIN_ID, BLOCK_TIMESTAMP)

    // Assert
    expect(result.poolAddress).toBe(POOL_ADDRESS)
    expect(result.amount).toBe('1000000000000000000')
    expect(result.chainId).toBe(CHAIN_ID)
    expect(result.transactionHash).toBe(TX_HASH)
    expect(result.blockNumber).toBe(BLOCK_NUMBER)
  })

  it('should decode from topics, since both parameters are indexed', () => {
    // Arrange — a real log has no `data`; a decoder reading only `data` would
    // return zero for every withdrawal.
    const log = buildMockLog({ data: '0x' })

    // Act
    parseFundsWithdrawnLog(log, CHAIN_ID, BLOCK_TIMESTAMP)

    // Assert
    expect(mockDecodeEventLog).toHaveBeenCalledWith('FundsWithdrawn', '0x', log.topics)
  })

  it('should take the pool address from the emitting contract, not from the event body', () => {
    // Arrange — the event has no pool field; the log's own address is the pool.
    const log = buildMockLog({ address: '0xAnotherPool' })

    // Act
    const result = parseFundsWithdrawnLog(log, CHAIN_ID, BLOCK_TIMESTAMP)

    // Assert
    expect(result.poolAddress).toBe('0xAnotherPool')
  })

  it('should lowercase the member so a wallet filter matches regardless of casing', () => {
    // Act
    const result = parseFundsWithdrawnLog(buildMockLog(), CHAIN_ID, BLOCK_TIMESTAMP)

    // Assert
    expect(result.member).toBe('0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc')
  })

  it('should convert the BigInt amount to a string', () => {
    // Arrange
    mockDecodeEventLog.mockReturnValue(makeDefaultDecodeReturn({ amount: BigInt('999000000000000000') }))

    // Act
    const result = parseFundsWithdrawnLog(buildMockLog(), CHAIN_ID, BLOCK_TIMESTAMP)

    // Assert
    expect(result.amount).toBe('999000000000000000')
    expect(typeof result.amount).toBe('string')
  })

  it("should read the log position from ethers v6's `index`, not v5's `logIndex`", () => {
    // Arrange — reading the removed v5 name yields undefined, which would
    // collapse every log in a transaction onto one document id.
    const log = buildMockLog({ index: 3 })

    // Act
    const result = parseFundsWithdrawnLog(log, CHAIN_ID, BLOCK_TIMESTAMP)

    // Assert
    expect(result.logIndex).toBe(3)
  })

  it('should derive withdrawnAt from the block timestamp in milliseconds', () => {
    // Act
    const result = parseFundsWithdrawnLog(buildMockLog(), CHAIN_ID, 1234567890)

    // Assert
    expect(result.withdrawnAt).toEqual(new Date(1234567890 * 1000))
  })

  it('should throw a named error when decoding fails', () => {
    // Arrange
    mockDecodeEventLog.mockImplementation(() => {
      throw new Error('bad topics')
    })

    // Act & Assert
    expect(() => parseFundsWithdrawnLog(buildMockLog(), CHAIN_ID, BLOCK_TIMESTAMP)).toThrow(
      'Failed to decode FundsWithdrawn log: bad topics'
    )
  })
})

// ---------------------------------------------------------------------------
// indexWithdrawalEvent
// ---------------------------------------------------------------------------

describe('indexWithdrawalEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should write the withdrawal to the withdrawals collection', async () => {
    // Arrange
    const { firestore, collection, doc, create } = buildFirestore()

    // Act
    const result = await indexWithdrawalEvent(buildParsedWithdrawal(), firestore)

    // Assert
    expect(collection).toHaveBeenCalledWith('withdrawals')
    expect(doc).toHaveBeenCalledWith(`${CHAIN_ID}-${TX_HASH}-0`)
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ member: MEMBER.toLowerCase(), amount: '1000000000000000000' }))
    expect(result).toEqual({ id: `${CHAIN_ID}-${TX_HASH}-0`, poolId: 1, alreadyIndexed: false, stored: true })
  })

  it('should use create() so racing indexing paths cannot double-write', async () => {
    // Arrange — the withdraw screen indexes the transaction it just watched
    // confirm while startup recovery drains the same hash.
    const { firestore, create } = buildFirestore(jest.fn().mockRejectedValue(alreadyExistsError()))

    // Act
    const result = await indexWithdrawalEvent(buildParsedWithdrawal(), firestore)

    // Assert
    expect(create).toHaveBeenCalled()
    expect(result).toEqual({ id: `${CHAIN_ID}-${TX_HASH}-0`, poolId: 1, alreadyIndexed: true, stored: false })
    expect(mockLogger.info).toHaveBeenCalledWith('Withdrawal already indexed, skipping', expect.anything())
  })

  it('should rethrow a write failure that is not a duplicate', async () => {
    // Arrange
    const { firestore } = buildFirestore(jest.fn().mockRejectedValue(new Error('permission denied')))

    // Act & Assert
    await expect(indexWithdrawalEvent(buildParsedWithdrawal(), firestore)).rejects.toThrow('permission denied')
  })
})

// ---------------------------------------------------------------------------
// indexWithdrawalsByTxHash
// ---------------------------------------------------------------------------

describe('indexWithdrawalsByTxHash', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDecodeEventLog.mockReturnValue(makeDefaultDecodeReturn())
    mockGetEvent.mockReturnValue({ topicHash: FUNDS_WITHDRAWN_TOPIC })
    mockGetPoolId.mockResolvedValue(BigInt(1))
  })

  it('should index every FundsWithdrawn log in the transaction', async () => {
    // Arrange — one transaction can carry several.
    const { firestore } = buildFirestore()
    const provider = buildProvider({
      receipt: { status: 1, blockNumber: BLOCK_NUMBER, logs: [buildMockLog({ index: 0 }), buildMockLog({ index: 1 })] },
    })

    // Act
    const result = await indexWithdrawalsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)

    // Assert
    expect(result.withdrawals).toHaveLength(2)
    expect(result.results).toHaveLength(2)
  })

  it('should ignore logs that are not FundsWithdrawn', async () => {
    // Arrange — a withdrawal transaction also carries unrelated logs.
    const { firestore } = buildFirestore()
    const provider = buildProvider({
      receipt: { status: 1, blockNumber: BLOCK_NUMBER, logs: [buildMockLog(), { ...buildMockLog(), topics: ['0xSOMETHING_ELSE'] }] },
    })

    // Act
    const result = await indexWithdrawalsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)

    // Assert
    expect(result.withdrawals).toHaveLength(1)
  })

  it('should refuse a withdrawal from a contract the factory does not know', async () => {
    // Arrange — anyone can emit an identically-shaped event from their own
    // contract, and indexing one would subtract from an unrelated position.
    mockGetPoolId.mockResolvedValue(BigInt(0))
    const { firestore } = buildFirestore()

    // Act & Assert
    await expect(indexWithdrawalsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, buildProvider(), firestore)).rejects.toThrow(
      /not made from a pool deployed by SuperPool/
    )
  })

  it('should reject a transaction with no receipt', async () => {
    // Arrange
    const { firestore } = buildFirestore()

    // Act & Assert
    await expect(indexWithdrawalsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, buildProvider({ receipt: null }), firestore)).rejects.toThrow(
      /receipt not found/
    )
  })

  it('should reject a reverted transaction', async () => {
    // Arrange
    const { firestore } = buildFirestore()
    const provider = buildProvider({ receipt: { status: 0, blockNumber: BLOCK_NUMBER, logs: [] } })

    // Act & Assert
    await expect(indexWithdrawalsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)).rejects.toThrow(/reverted or failed/)
  })

  it('should reject a transaction carrying no FundsWithdrawn event', async () => {
    // Arrange
    const { firestore } = buildFirestore()
    const provider = buildProvider({ receipt: { status: 1, blockNumber: BLOCK_NUMBER, logs: [] } })

    // Act & Assert
    await expect(indexWithdrawalsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)).rejects.toThrow(
      /No FundsWithdrawn event found/
    )
  })

  it('should reject when the block cannot be fetched', async () => {
    // Arrange — the timestamp is what dates the record.
    const { firestore } = buildFirestore()

    // Act & Assert
    await expect(indexWithdrawalsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, buildProvider({ block: null }), firestore)).rejects.toThrow(
      /Failed to fetch block/
    )
  })
})
