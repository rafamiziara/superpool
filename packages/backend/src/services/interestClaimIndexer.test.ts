import { mockLogger } from '../__tests__/setup'
import type { ParsedInterestClaimEvent } from './interestClaimIndexer'

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
  parseInterestClaimedLog,
  indexInterestClaimEvent,
  indexInterestClaimsByTxHash,
  interestClaimDocId,
} = require('./interestClaimIndexer')

// ---------------------------------------------------------------------------
// Shared test constants
// ---------------------------------------------------------------------------

const CHAIN_ID = 31337
const TX_HASH = '0xabc123def456'
const BLOCK_NUMBER = 100
const BLOCK_TIMESTAMP = 1700000000
const INTEREST_CLAIMED_TOPIC = '0xINTEREST_CLAIMED_TOPIC'
const POOL_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3'
const FACTORY_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'
const ACCOUNT = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc'

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
    // Both InterestClaimed parameters are `indexed`, so a real log carries no data.
    data: '0x',
    topics: [INTEREST_CLAIMED_TOPIC, '0xaccount', '0xamount'],
    transactionHash: TX_HASH,
    blockNumber: BLOCK_NUMBER,
    index: 0,
    address: POOL_ADDRESS,
    ...overrides,
  }
}

function makeDefaultDecodeReturn(overrides: Record<string, unknown> = {}) {
  return {
    account: ACCOUNT,
    amount: BigInt('50000000000000000'),
    ...overrides,
  }
}

function buildParsedClaim(overrides: Partial<ParsedInterestClaimEvent> = {}): ParsedInterestClaimEvent {
  return {
    poolId: 1,
    poolAddress: POOL_ADDRESS,
    account: ACCOUNT.toLowerCase(),
    amount: '50000000000000000',
    chainId: CHAIN_ID,
    transactionHash: TX_HASH,
    logIndex: 0,
    blockNumber: BLOCK_NUMBER,
    claimedAt: new Date(BLOCK_TIMESTAMP * 1000),
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
// interestClaimDocId
// ---------------------------------------------------------------------------

describe('interestClaimDocId', () => {
  it('should key on the log, not the transaction, so one tx can carry several claims', () => {
    // Arrange & Act
    const first = interestClaimDocId(CHAIN_ID, TX_HASH, 0)
    const second = interestClaimDocId(CHAIN_ID, TX_HASH, 1)

    // Assert
    expect(first).not.toBe(second)
    expect(first).toBe(`${CHAIN_ID}-${TX_HASH}-0`)
  })

  it('should lowercase the transaction hash so casing cannot fork the document id', () => {
    // Arrange & Act
    const result = interestClaimDocId(CHAIN_ID, '0xABCDEF', 2)

    // Assert
    expect(result).toBe(`${CHAIN_ID}-0xabcdef-2`)
  })
})

// ---------------------------------------------------------------------------
// parseInterestClaimedLog
// ---------------------------------------------------------------------------

describe('parseInterestClaimedLog', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDecodeEventLog.mockReturnValue(makeDefaultDecodeReturn())
    mockGetEvent.mockReturnValue({ topicHash: INTEREST_CLAIMED_TOPIC })
  })

  it('should parse a valid InterestClaimed log', () => {
    // Act
    const result = parseInterestClaimedLog(buildMockLog(), CHAIN_ID, BLOCK_TIMESTAMP)

    // Assert
    expect(result.poolAddress).toBe(POOL_ADDRESS)
    expect(result.amount).toBe('50000000000000000')
    expect(result.chainId).toBe(CHAIN_ID)
    expect(result.transactionHash).toBe(TX_HASH)
    expect(result.blockNumber).toBe(BLOCK_NUMBER)
  })

  it('should decode from topics, since both parameters are indexed', () => {
    // Arrange — a real log has no `data`; a decoder reading only `data` would
    // return zero for every claim.
    const log = buildMockLog({ data: '0x' })

    // Act
    parseInterestClaimedLog(log, CHAIN_ID, BLOCK_TIMESTAMP)

    // Assert
    expect(mockDecodeEventLog).toHaveBeenCalledWith('InterestClaimed', '0x', log.topics)
  })

  it('should take the pool address from the emitting contract, not from the event body', () => {
    // Arrange — the event has no pool field; the log's own address is the pool.
    const log = buildMockLog({ address: '0xAnotherPool' })

    // Act
    const result = parseInterestClaimedLog(log, CHAIN_ID, BLOCK_TIMESTAMP)

    // Assert
    expect(result.poolAddress).toBe('0xAnotherPool')
  })

  it('should lowercase the account so a wallet filter matches regardless of casing', () => {
    // Act
    const result = parseInterestClaimedLog(buildMockLog(), CHAIN_ID, BLOCK_TIMESTAMP)

    // Assert
    expect(result.account).toBe('0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc')
  })

  it('should convert the BigInt amount to a string', () => {
    // Arrange
    mockDecodeEventLog.mockReturnValue(makeDefaultDecodeReturn({ amount: BigInt('999000000000000000') }))

    // Act
    const result = parseInterestClaimedLog(buildMockLog(), CHAIN_ID, BLOCK_TIMESTAMP)

    // Assert
    expect(result.amount).toBe('999000000000000000')
    expect(typeof result.amount).toBe('string')
  })

  it("should read the log position from ethers v6's `index`, not v5's `logIndex`", () => {
    // Arrange — reading the removed v5 name yields undefined, which would
    // collapse every log in a transaction onto one document id.
    const log = buildMockLog({ index: 3 })

    // Act
    const result = parseInterestClaimedLog(log, CHAIN_ID, BLOCK_TIMESTAMP)

    // Assert
    expect(result.logIndex).toBe(3)
  })

  it('should derive claimedAt from the block timestamp in milliseconds', () => {
    // Act
    const result = parseInterestClaimedLog(buildMockLog(), CHAIN_ID, 1234567890)

    // Assert
    expect(result.claimedAt).toEqual(new Date(1234567890 * 1000))
  })

  it('should throw a named error when decoding fails', () => {
    // Arrange
    mockDecodeEventLog.mockImplementation(() => {
      throw new Error('bad topics')
    })

    // Act & Assert
    expect(() => parseInterestClaimedLog(buildMockLog(), CHAIN_ID, BLOCK_TIMESTAMP)).toThrow(
      'Failed to decode InterestClaimed log: bad topics'
    )
  })
})

// ---------------------------------------------------------------------------
// indexInterestClaimEvent
// ---------------------------------------------------------------------------

describe('indexInterestClaimEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should write the claim to the interest_claims collection', async () => {
    // Arrange
    const { firestore, collection, doc, create } = buildFirestore()

    // Act
    const result = await indexInterestClaimEvent(buildParsedClaim(), firestore)

    // Assert
    expect(collection).toHaveBeenCalledWith('interest_claims')
    expect(doc).toHaveBeenCalledWith(`${CHAIN_ID}-${TX_HASH}-0`)
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ account: ACCOUNT.toLowerCase(), amount: '50000000000000000' }))
    expect(result).toEqual({ id: `${CHAIN_ID}-${TX_HASH}-0`, poolId: 1, alreadyIndexed: false, stored: true })
  })

  it('should use create() so racing indexing paths cannot double-write', async () => {
    // Arrange — the pool screen indexes the transaction it just watched confirm
    // while the scheduled sweep covers the same block.
    const { firestore, create } = buildFirestore(jest.fn().mockRejectedValue(alreadyExistsError()))

    // Act
    const result = await indexInterestClaimEvent(buildParsedClaim(), firestore)

    // Assert
    expect(create).toHaveBeenCalled()
    expect(result).toEqual({ id: `${CHAIN_ID}-${TX_HASH}-0`, poolId: 1, alreadyIndexed: true, stored: false })
    expect(mockLogger.info).toHaveBeenCalledWith('Interest claim already indexed, skipping', expect.anything())
  })

  it('should rethrow a write failure that is not a duplicate', async () => {
    // Arrange
    const { firestore } = buildFirestore(jest.fn().mockRejectedValue(new Error('permission denied')))

    // Act & Assert
    await expect(indexInterestClaimEvent(buildParsedClaim(), firestore)).rejects.toThrow('permission denied')
  })
})

// ---------------------------------------------------------------------------
// indexInterestClaimsByTxHash
// ---------------------------------------------------------------------------

describe('indexInterestClaimsByTxHash', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDecodeEventLog.mockReturnValue(makeDefaultDecodeReturn())
    mockGetEvent.mockReturnValue({ topicHash: INTEREST_CLAIMED_TOPIC })
    mockGetPoolId.mockResolvedValue(BigInt(1))
  })

  it('should return the parsed claims and the per-log results, not the callable shape', async () => {
    // Arrange — `storedCount` and `alreadyIndexed` are computed by the callable;
    // asserting them here would compare against undefined.
    const { firestore } = buildFirestore()

    // Act
    const result = await indexInterestClaimsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, buildProvider(), firestore)

    // Assert
    expect(Object.keys(result).sort()).toEqual(['claims', 'results'])
    expect(result.results[0]).toEqual({ id: `${CHAIN_ID}-${TX_HASH}-0`, poolId: 1, alreadyIndexed: false, stored: true })
  })

  it('should index every InterestClaimed log in the transaction', async () => {
    // Arrange
    const { firestore } = buildFirestore()
    const provider = buildProvider({
      receipt: { status: 1, blockNumber: BLOCK_NUMBER, logs: [buildMockLog({ index: 0 }), buildMockLog({ index: 1 })] },
    })

    // Act
    const result = await indexInterestClaimsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)

    // Assert
    expect(result.claims).toHaveLength(2)
    expect(result.results).toHaveLength(2)
  })

  it('should ignore logs that are not InterestClaimed', async () => {
    // Arrange — a claim transaction carries no other SuperPool event today, but
    // routing on the topic is what keeps that true when one is added.
    const { firestore } = buildFirestore()
    const provider = buildProvider({
      receipt: { status: 1, blockNumber: BLOCK_NUMBER, logs: [buildMockLog(), { ...buildMockLog(), topics: ['0xSOMETHING_ELSE'] }] },
    })

    // Act
    const result = await indexInterestClaimsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)

    // Assert
    expect(result.claims).toHaveLength(1)
  })

  it('should refuse a claim from a contract the factory does not know', async () => {
    // Arrange — anyone can emit an identically-shaped event from their own
    // contract, and indexing one would credit earnings against a stranger's pool.
    mockGetPoolId.mockResolvedValue(BigInt(0))
    const { firestore } = buildFirestore()

    // Act & Assert
    await expect(indexInterestClaimsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, buildProvider(), firestore)).rejects.toThrow(
      /not claimed from a pool deployed by SuperPool/
    )
  })

  it('should reject a transaction with no receipt', async () => {
    // Arrange
    const { firestore } = buildFirestore()

    // Act & Assert
    await expect(
      indexInterestClaimsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, buildProvider({ receipt: null }), firestore)
    ).rejects.toThrow(/receipt not found/)
  })

  it('should reject a reverted transaction', async () => {
    // Arrange
    const { firestore } = buildFirestore()
    const provider = buildProvider({ receipt: { status: 0, blockNumber: BLOCK_NUMBER, logs: [] } })

    // Act & Assert
    await expect(indexInterestClaimsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)).rejects.toThrow(/reverted or failed/)
  })

  it('should reject a transaction carrying no InterestClaimed event', async () => {
    // Arrange
    const { firestore } = buildFirestore()
    const provider = buildProvider({ receipt: { status: 1, blockNumber: BLOCK_NUMBER, logs: [] } })

    // Act & Assert
    await expect(indexInterestClaimsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)).rejects.toThrow(
      /No InterestClaimed event found/
    )
  })

  it('should reject when the block cannot be fetched', async () => {
    // Arrange — the timestamp is what dates the record.
    const { firestore } = buildFirestore()

    // Act & Assert
    await expect(
      indexInterestClaimsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, buildProvider({ block: null }), firestore)
    ).rejects.toThrow(/Failed to fetch block/)
  })
})
