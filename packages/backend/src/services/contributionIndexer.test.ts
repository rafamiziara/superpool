import { mockLogger } from '../__tests__/setup'
import type { ParsedContributionEvent } from './contributionIndexer'

// ---------------------------------------------------------------------------
// Shared mock references — captured at module-definition time so tests can
// configure them per-case via mockReturnValue / mockImplementation.
// ---------------------------------------------------------------------------
const mockDecodeEventLog = jest.fn()
const mockGetEvent = jest.fn()
const mockGetPoolId = jest.fn()

// Mock ethers BEFORE importing the module under test. The module creates a
// top-level `new Interface([...SampleLendingPoolABI])`, so the mock must be in
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
const {
  parseFundsDepositedLog,
  resolvePoolId,
  indexContributionEvent,
  indexContributionsByTxHash,
  contributionDocId,
} = require('./contributionIndexer')

// ---------------------------------------------------------------------------
// Shared test constants
// ---------------------------------------------------------------------------

const CHAIN_ID = 31337
const TX_HASH = '0xabc123def456'
const BLOCK_NUMBER = 100
const BLOCK_TIMESTAMP = 1700000000
const FUNDS_DEPOSITED_TOPIC = '0xFUNDS_DEPOSITED_TOPIC'
const POOL_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3'
const FACTORY_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'
const DEPOSITOR = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc'

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
    // Both FundsDeposited parameters are `indexed`, so a real log carries no data.
    data: '0x',
    topics: [FUNDS_DEPOSITED_TOPIC, '0xdepositor', '0xamount'],
    transactionHash: TX_HASH,
    blockNumber: BLOCK_NUMBER,
    index: 0,
    address: POOL_ADDRESS,
    ...overrides,
  }
}

function makeDefaultDecodeReturn(overrides: Record<string, unknown> = {}) {
  return {
    depositor: DEPOSITOR,
    amount: BigInt('1000000000000000000'),
    ...overrides,
  }
}

function buildParsedContribution(overrides: Partial<ParsedContributionEvent> = {}): ParsedContributionEvent {
  return {
    poolId: 1,
    poolAddress: POOL_ADDRESS,
    contributor: DEPOSITOR.toLowerCase(),
    amount: '1000000000000000000',
    chainId: CHAIN_ID,
    transactionHash: TX_HASH,
    logIndex: 0,
    blockNumber: BLOCK_NUMBER,
    contributedAt: new Date(BLOCK_TIMESTAMP * 1000),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// contributionDocId
// ---------------------------------------------------------------------------

describe('contributionDocId', () => {
  it('should key on the log, not the transaction, so one tx can carry several deposits', () => {
    // Arrange & Act
    const first = contributionDocId(CHAIN_ID, TX_HASH, 0)
    const second = contributionDocId(CHAIN_ID, TX_HASH, 1)

    // Assert
    expect(first).not.toBe(second)
    expect(first).toBe(`${CHAIN_ID}-${TX_HASH}-0`)
  })

  it('should lowercase the transaction hash so casing cannot fork the document id', () => {
    // Arrange & Act
    const result = contributionDocId(CHAIN_ID, '0xABCDEF', 2)

    // Assert
    expect(result).toBe(`${CHAIN_ID}-0xabcdef-2`)
  })
})

// ---------------------------------------------------------------------------
// parseFundsDepositedLog
// ---------------------------------------------------------------------------

describe('parseFundsDepositedLog', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDecodeEventLog.mockReturnValue(makeDefaultDecodeReturn())
    mockGetEvent.mockReturnValue({ topicHash: FUNDS_DEPOSITED_TOPIC })
  })

  it('should parse a valid FundsDeposited log', () => {
    // Act
    const result = parseFundsDepositedLog(buildMockLog(), CHAIN_ID, BLOCK_TIMESTAMP)

    // Assert
    expect(result.poolAddress).toBe(POOL_ADDRESS)
    expect(result.amount).toBe('1000000000000000000')
    expect(result.chainId).toBe(CHAIN_ID)
    expect(result.transactionHash).toBe(TX_HASH)
    expect(result.blockNumber).toBe(BLOCK_NUMBER)
  })

  it('should take the pool address from the emitting contract, not from the event body', () => {
    // Arrange — the event has no pool field; the log's own address is the pool.
    const log = buildMockLog({ address: '0xAnotherPool' })

    // Act
    const result = parseFundsDepositedLog(log, CHAIN_ID, BLOCK_TIMESTAMP)

    // Assert
    expect(result.poolAddress).toBe('0xAnotherPool')
  })

  it('should lowercase the contributor so a wallet filter matches regardless of casing', () => {
    // Act
    const result = parseFundsDepositedLog(buildMockLog(), CHAIN_ID, BLOCK_TIMESTAMP)

    // Assert
    expect(result.contributor).toBe('0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc')
  })

  it('should convert the BigInt amount to a string', () => {
    // Arrange
    mockDecodeEventLog.mockReturnValue(makeDefaultDecodeReturn({ amount: BigInt('999000000000000000') }))

    // Act
    const result = parseFundsDepositedLog(buildMockLog(), CHAIN_ID, BLOCK_TIMESTAMP)

    // Assert
    expect(result.amount).toBe('999000000000000000')
    expect(typeof result.amount).toBe('string')
  })

  it("should read the log position from ethers v6's `index`, not v5's `logIndex`", () => {
    // Arrange — reading the removed v5 name yields undefined, which would
    // collapse every log in a transaction onto one document id.
    const log = buildMockLog({ index: 3 })

    // Act
    const result = parseFundsDepositedLog(log, CHAIN_ID, BLOCK_TIMESTAMP)

    // Assert
    expect(result.logIndex).toBe(3)
  })

  it('should derive contributedAt from the block timestamp in milliseconds', () => {
    // Act
    const result = parseFundsDepositedLog(buildMockLog(), CHAIN_ID, 1234567890)

    // Assert
    expect(result.contributedAt).toEqual(new Date(1234567890 * 1000))
  })

  it('should throw a descriptive Error when decoding fails', () => {
    // Arrange
    mockDecodeEventLog.mockImplementation(() => {
      throw new Error('bad log data')
    })

    // Act & Assert
    expect(() => parseFundsDepositedLog(buildMockLog(), CHAIN_ID, BLOCK_TIMESTAMP)).toThrow(
      'Failed to decode FundsDeposited log: bad log data'
    )
  })

  it('should wrap non-Error decode failures in a descriptive message', () => {
    // Arrange — a throwable that is not an Error instance
    const nonErrorThrowable = Object.assign(Object.create(null), { toString: () => 'unexpected failure' })
    mockDecodeEventLog.mockImplementation(() => {
      throw nonErrorThrowable
    })

    // Act & Assert
    expect(() => parseFundsDepositedLog(buildMockLog(), CHAIN_ID, BLOCK_TIMESTAMP)).toThrow(
      'Failed to decode FundsDeposited log: unexpected failure'
    )
  })
})

// ---------------------------------------------------------------------------
// resolvePoolId
// ---------------------------------------------------------------------------

describe('resolvePoolId', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return the factory pool id as a plain number', async () => {
    // Arrange
    mockGetPoolId.mockResolvedValue(BigInt(7))

    // Act
    const result = await resolvePoolId(POOL_ADDRESS, FACTORY_ADDRESS, {})

    // Assert
    expect(result).toBe(7)
    expect(typeof result).toBe('number')
    expect(mockGetPoolId).toHaveBeenCalledWith(POOL_ADDRESS)
  })

  it('should return 0 for an address the factory does not know', async () => {
    // Arrange — pool ids start at 1 (`++poolCount`), so 0 is the sentinel.
    mockGetPoolId.mockResolvedValue(BigInt(0))

    // Act
    const result = await resolvePoolId('0xNotAPool', FACTORY_ADDRESS, {})

    // Assert
    expect(result).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// indexContributionEvent
// ---------------------------------------------------------------------------

describe('indexContributionEvent', () => {
  function buildMockFirestore(docExists: boolean) {
    // `create()` is what makes this atomic: Firestore rejects it with
    // ALREADY_EXISTS rather than overwriting.
    const mockCreate = docExists ? jest.fn().mockRejectedValue(alreadyExistsError()) : jest.fn().mockResolvedValue(undefined)
    const mockDocRef = { create: mockCreate }
    const mockCollection = { doc: jest.fn().mockReturnValue(mockDocRef) }
    const mockFs = { collection: jest.fn().mockReturnValue(mockCollection) }

    return { mockFs, mockCollection, mockDocRef }
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should write the contribution document with all required fields', async () => {
    // Arrange
    const { mockFs, mockDocRef } = buildMockFirestore(false)
    const contribution = buildParsedContribution({ poolId: 3 })

    // Act
    await indexContributionEvent(contribution, mockFs)

    // Assert
    expect(mockDocRef.create).toHaveBeenCalledWith({
      poolId: 3,
      poolAddress: POOL_ADDRESS,
      contributor: DEPOSITOR.toLowerCase(),
      amount: '1000000000000000000',
      chainId: CHAIN_ID,
      transactionHash: TX_HASH,
      logIndex: 0,
      blockNumber: BLOCK_NUMBER,
      contributedAt: contribution.contributedAt,
    })
  })

  it('should use the contributions collection', async () => {
    // Arrange
    const { mockFs } = buildMockFirestore(false)

    // Act
    await indexContributionEvent(buildParsedContribution(), mockFs)

    // Assert
    expect(mockFs.collection).toHaveBeenCalledWith('contributions')
  })

  it('should key the document on chainId, txHash and logIndex', async () => {
    // Arrange
    const { mockFs, mockCollection } = buildMockFirestore(false)

    // Act
    await indexContributionEvent(buildParsedContribution({ chainId: 80002, logIndex: 2 }), mockFs)

    // Assert
    expect(mockCollection.doc).toHaveBeenCalledWith(`80002-${TX_HASH}-2`)
  })

  it('should report stored:true for a first-time write', async () => {
    // Arrange
    const { mockFs } = buildMockFirestore(false)

    // Act
    const result = await indexContributionEvent(buildParsedContribution({ poolId: 2 }), mockFs)

    // Assert
    expect(result).toEqual({ id: `${CHAIN_ID}-${TX_HASH}-0`, poolId: 2, alreadyIndexed: false, stored: true })
  })

  it('should report alreadyIndexed:true when the document exists', async () => {
    // Arrange
    const { mockFs } = buildMockFirestore(true)

    // Act
    const result = await indexContributionEvent(buildParsedContribution({ poolId: 2 }), mockFs)

    // Assert
    expect(result).toEqual({ id: `${CHAIN_ID}-${TX_HASH}-0`, poolId: 2, alreadyIndexed: true, stored: false })
    expect(mockLogger.info).toHaveBeenCalledWith('Contribution already indexed, skipping', expect.objectContaining({ poolId: 2 }))
  })

  it('should store exactly once when two callers index the same deposit concurrently', async () => {
    // Arrange — the contribute screen indexes what it watched confirm while
    // startup recovery drains the same hash. Only one may report a store.
    let created = false
    const mockCreate = jest.fn().mockImplementation(async () => {
      if (created) throw alreadyExistsError()
      created = true
    })
    const mockFs = {
      collection: jest.fn().mockReturnValue({ doc: jest.fn().mockReturnValue({ create: mockCreate }) }),
    }
    const contribution = buildParsedContribution({ poolId: 5 })

    // Act
    const results = await Promise.all([indexContributionEvent(contribution, mockFs), indexContributionEvent(contribution, mockFs)])

    // Assert
    expect(results.filter((result: { stored: boolean }) => result.stored)).toHaveLength(1)
    expect(results.filter((result: { alreadyIndexed: boolean }) => result.alreadyIndexed)).toHaveLength(1)
  })

  it('should propagate a write failure that is not ALREADY_EXISTS', async () => {
    // Arrange — a permission error must not be reported as an already-indexed
    // contribution, which would silently drop it.
    const mockCreate = jest.fn().mockRejectedValue(Object.assign(new Error('7 PERMISSION_DENIED'), { code: 7 }))
    const mockFs = {
      collection: jest.fn().mockReturnValue({ doc: jest.fn().mockReturnValue({ create: mockCreate }) }),
    }

    // Act & Assert
    await expect(indexContributionEvent(buildParsedContribution(), mockFs)).rejects.toThrow('7 PERMISSION_DENIED')
  })
})

// ---------------------------------------------------------------------------
// indexContributionsByTxHash
// ---------------------------------------------------------------------------

describe('indexContributionsByTxHash', () => {
  function buildMockProvider(
    overrides: Partial<{
      receipt: object | null
      block: object | null
    }> = {}
  ) {
    const receipt = overrides.receipt === undefined ? { status: 1, blockNumber: BLOCK_NUMBER, logs: [buildMockLog()] } : overrides.receipt

    const block = overrides.block === undefined ? { timestamp: BLOCK_TIMESTAMP } : overrides.block

    return {
      getTransactionReceipt: jest.fn().mockResolvedValue(receipt),
      getBlock: jest.fn().mockResolvedValue(block),
    }
  }

  function buildMockFirestore() {
    const mockCreate = jest.fn().mockResolvedValue(undefined)
    const mockFs = {
      collection: jest.fn().mockReturnValue({ doc: jest.fn().mockReturnValue({ create: mockCreate }) }),
    }

    return { mockFs, mockCreate }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockDecodeEventLog.mockReturnValue(makeDefaultDecodeReturn())
    mockGetEvent.mockReturnValue({ topicHash: FUNDS_DEPOSITED_TOPIC })
    mockGetPoolId.mockResolvedValue(BigInt(1))
  })

  it('should index the FundsDeposited log in a confirmed transaction', async () => {
    // Arrange
    const provider = buildMockProvider()
    const { mockFs } = buildMockFirestore()

    // Act
    const result = await indexContributionsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, provider, mockFs)

    // Assert
    expect(result.contributions).toHaveLength(1)
    expect(result.contributions[0].poolId).toBe(1)
    expect(result.results[0].stored).toBe(true)
  })

  it('should index every FundsDeposited log, not just the first', async () => {
    // Arrange — one transaction can legitimately carry several deposits.
    const provider = buildMockProvider({
      receipt: { status: 1, blockNumber: BLOCK_NUMBER, logs: [buildMockLog({ index: 0 }), buildMockLog({ index: 1 })] },
    })
    const { mockFs, mockCreate } = buildMockFirestore()

    // Act
    const result = await indexContributionsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, provider, mockFs)

    // Assert
    expect(result.contributions).toHaveLength(2)
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })

  it('should ignore logs from other events in the same transaction', async () => {
    // Arrange
    const provider = buildMockProvider({
      receipt: {
        status: 1,
        blockNumber: BLOCK_NUMBER,
        logs: [buildMockLog(), { ...buildMockLog(), topics: ['0xSOME_OTHER_TOPIC'] }],
      },
    })
    const { mockFs } = buildMockFirestore()

    // Act
    const result = await indexContributionsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, provider, mockFs)

    // Assert
    expect(result.contributions).toHaveLength(1)
  })

  it('should throw not-found when the receipt is missing', async () => {
    // Arrange
    const provider = buildMockProvider({ receipt: null })
    const { mockFs } = buildMockFirestore()

    // Act & Assert
    await expect(indexContributionsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, provider, mockFs)).rejects.toThrow(
      `Transaction receipt not found for hash: ${TX_HASH}`
    )
  })

  it('should throw failed-precondition when the transaction reverted', async () => {
    // Arrange
    const provider = buildMockProvider({ receipt: { status: 0, blockNumber: BLOCK_NUMBER, logs: [] } })
    const { mockFs } = buildMockFirestore()

    // Act & Assert
    await expect(indexContributionsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, provider, mockFs)).rejects.toThrow(
      `Transaction was reverted or failed: ${TX_HASH}`
    )
  })

  it('should throw not-found when the transaction has no FundsDeposited log', async () => {
    // Arrange
    const provider = buildMockProvider({
      receipt: { status: 1, blockNumber: BLOCK_NUMBER, logs: [{ ...buildMockLog(), topics: ['0xOTHER'] }] },
    })
    const { mockFs } = buildMockFirestore()

    // Act & Assert
    await expect(indexContributionsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, provider, mockFs)).rejects.toThrow(
      `No FundsDeposited event found in transaction: ${TX_HASH}`
    )
  })

  it('should throw internal when the block cannot be fetched', async () => {
    // Arrange
    const provider = buildMockProvider({ block: null })
    const { mockFs } = buildMockFirestore()

    // Act & Assert
    await expect(indexContributionsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, provider, mockFs)).rejects.toThrow(
      `Failed to fetch block ${BLOCK_NUMBER}`
    )
  })

  it('should reject a deposit into a contract the factory did not deploy', async () => {
    // Arrange — `depositFunds` is callable on any contract that has it, so an
    // unknown pool id means this is not a SuperPool contribution.
    mockGetPoolId.mockResolvedValue(BigInt(0))
    const provider = buildMockProvider()
    const { mockFs, mockCreate } = buildMockFirestore()

    // Act & Assert
    await expect(indexContributionsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, provider, mockFs)).rejects.toThrow(
      'Deposit was not made to a pool deployed by SuperPool'
    )
    expect(mockCreate).not.toHaveBeenCalled()
  })
})
