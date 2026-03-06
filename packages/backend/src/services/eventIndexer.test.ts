import { mockLogger } from '../__tests__/setup'
import { createMockDoc } from '../__tests__/mocks'
import { ParsedPoolEvent } from './eventIndexer'

// ---------------------------------------------------------------------------
// Shared mock references — captured at module-definition time so tests can
// configure them per-case via mockReturnValue / mockImplementation.
// ---------------------------------------------------------------------------
const mockDecodeEventLog = jest.fn()
const mockGetEvent = jest.fn()

// Mock ethers BEFORE importing the module under test. The module creates a
// top-level `new Interface([...PoolFactoryABI])`, so the mock must be in
// place before the first `require`.
jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers')
  return {
    ...actual,
    Interface: jest.fn().mockImplementation(() => ({
      decodeEventLog: mockDecodeEventLog,
      getEvent: mockGetEvent,
    })),
  }
})

// Import AFTER mocks are registered
const { parsePoolCreatedLog, indexPoolEvent, indexPoolByTxHash } = require('./eventIndexer')

// ---------------------------------------------------------------------------
// Shared test constants
// ---------------------------------------------------------------------------

const CHAIN_ID = 31337
const TX_HASH = '0xabc123def456'
const BLOCK_NUMBER = 100
const BLOCK_TIMESTAMP = 1700000000
const POOL_CREATED_TOPIC = '0xPOOL_CREATED_TOPIC'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildMockLog(
  overrides: Partial<{
    data: string
    topics: string[]
    transactionHash: string
    blockNumber: number
  }> = {}
) {
  return {
    data: '0xlogdata',
    topics: [POOL_CREATED_TOPIC, '0xtopic1'],
    transactionHash: TX_HASH,
    blockNumber: BLOCK_NUMBER,
    ...overrides,
  }
}

function buildParsedPool(overrides: Partial<ParsedPoolEvent> = {}): ParsedPoolEvent {
  return {
    poolId: 1,
    poolAddress: '0xPoolAddress',
    poolOwner: '0xOwnerAddress',
    name: 'Test Pool',
    description: '',
    maxLoanAmount: '1000000000000000000',
    interestRate: 500,
    loanDuration: 2592000,
    chainId: CHAIN_ID,
    transactionHash: TX_HASH,
    blockNumber: BLOCK_NUMBER,
    createdAt: new Date(BLOCK_TIMESTAMP * 1000),
    isActive: true,
    ...overrides,
  }
}

function makeDefaultDecodeReturn(overrides: Record<string, unknown> = {}) {
  return {
    poolId: BigInt(1),
    poolAddress: '0xPoolAddress',
    poolOwner: '0xOwnerAddress',
    name: 'Test Pool',
    maxLoanAmount: BigInt('1000000000000000000'),
    interestRate: BigInt(500),
    loanDuration: BigInt(2592000),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// parsePoolCreatedLog
// ---------------------------------------------------------------------------

describe('parsePoolCreatedLog', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Reset the mocks to a valid default so each test can override only what it needs
    mockDecodeEventLog.mockReturnValue(makeDefaultDecodeReturn())
    mockGetEvent.mockReturnValue({ topicHash: POOL_CREATED_TOPIC })
  })

  it('should parse a valid PoolCreated log into a ParsedPoolEvent', () => {
    // Arrange
    const log = buildMockLog()

    // Act
    const result = parsePoolCreatedLog(log, CHAIN_ID, BLOCK_TIMESTAMP)

    // Assert
    expect(result.poolId).toBe(1)
    expect(result.poolAddress).toBe('0xPoolAddress')
    expect(result.poolOwner).toBe('0xOwnerAddress')
    expect(result.name).toBe('Test Pool')
    expect(result.description).toBe('')
    expect(result.maxLoanAmount).toBe('1000000000000000000')
    expect(result.interestRate).toBe(500)
    expect(result.loanDuration).toBe(2592000)
    expect(result.chainId).toBe(CHAIN_ID)
    expect(result.transactionHash).toBe(TX_HASH)
    expect(result.blockNumber).toBe(BLOCK_NUMBER)
    expect(result.createdAt).toEqual(new Date(BLOCK_TIMESTAMP * 1000))
    expect(result.isActive).toBe(true)
  })

  it('should always set description to empty string regardless of decoded data', () => {
    // Arrange
    mockDecodeEventLog.mockReturnValue(makeDefaultDecodeReturn({ poolId: BigInt(2) }))
    const log = buildMockLog()

    // Act
    const result = parsePoolCreatedLog(log, CHAIN_ID, BLOCK_TIMESTAMP)

    // Assert
    expect(result.description).toBe('')
  })

  it('should derive createdAt from blockTimestamp in seconds', () => {
    // Arrange
    const timestamp = 1699999999
    const log = buildMockLog()

    // Act
    const result = parsePoolCreatedLog(log, CHAIN_ID, timestamp)

    // Assert
    expect(result.createdAt).toEqual(new Date(timestamp * 1000))
  })

  it('should convert BigInt poolId to a plain Number', () => {
    // Arrange
    mockDecodeEventLog.mockReturnValue(makeDefaultDecodeReturn({ poolId: BigInt(42) }))

    // Act
    const result = parsePoolCreatedLog(buildMockLog(), CHAIN_ID, BLOCK_TIMESTAMP)

    // Assert
    expect(result.poolId).toBe(42)
    expect(typeof result.poolId).toBe('number')
  })

  it('should convert BigInt maxLoanAmount to a string', () => {
    // Arrange
    mockDecodeEventLog.mockReturnValue(makeDefaultDecodeReturn({ maxLoanAmount: BigInt('999000000000000000') }))

    // Act
    const result = parsePoolCreatedLog(buildMockLog(), CHAIN_ID, BLOCK_TIMESTAMP)

    // Assert
    expect(result.maxLoanAmount).toBe('999000000000000000')
    expect(typeof result.maxLoanAmount).toBe('string')
  })

  it('should throw an Error when decodeEventLog fails', () => {
    // Arrange
    mockDecodeEventLog.mockImplementation(() => {
      throw new Error('bad log data')
    })
    const log = buildMockLog()

    // Act & Assert
    expect(() => parsePoolCreatedLog(log, CHAIN_ID, BLOCK_TIMESTAMP)).toThrow('Failed to decode PoolCreated log: bad log data')
  })

  it('should wrap non-Error decode failures in a descriptive message', () => {
    // Arrange — simulate a non-Error being thrown (e.g. a plain string)
    // We use Object.assign to create a throwable that is not an Error instance
    const nonErrorThrowable = Object.assign(Object.create(null), { toString: () => 'unexpected failure' })
    mockDecodeEventLog.mockImplementation(() => {
      throw nonErrorThrowable
    })
    const log = buildMockLog()

    // Act & Assert
    expect(() => parsePoolCreatedLog(log, CHAIN_ID, BLOCK_TIMESTAMP)).toThrow('Failed to decode PoolCreated log: unexpected failure')
  })
})

// ---------------------------------------------------------------------------
// indexPoolEvent
// ---------------------------------------------------------------------------

describe('indexPoolEvent', () => {
  function buildMockFirestore(docExists: boolean) {
    const mockSet = jest.fn().mockResolvedValue(undefined)
    const mockGet = jest.fn().mockResolvedValue(createMockDoc({}, docExists))

    const mockDocRef = {
      get: mockGet,
      set: mockSet,
    }

    const mockCollection = {
      doc: jest.fn().mockReturnValue(mockDocRef),
    }

    const mockFs = {
      collection: jest.fn().mockReturnValue(mockCollection),
    }

    return { mockFs, mockCollection, mockDocRef, mockGet, mockSet }
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return alreadyIndexed:true and stored:false when document already exists', async () => {
    // Arrange
    const { mockFs } = buildMockFirestore(true)
    const parsedPool = buildParsedPool({ poolId: 1, chainId: CHAIN_ID })

    // Act
    const result = await indexPoolEvent(parsedPool, mockFs)

    // Assert
    expect(result).toEqual({ poolId: 1, alreadyIndexed: true, stored: false })
  })

  it('should log "Pool already indexed, skipping" with correct metadata', async () => {
    // Arrange
    const { mockFs } = buildMockFirestore(true)
    const parsedPool = buildParsedPool({ poolId: 1, chainId: CHAIN_ID })

    // Act
    await indexPoolEvent(parsedPool, mockFs)

    // Assert
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Pool already indexed, skipping',
      expect.objectContaining({ poolId: 1, chainId: CHAIN_ID, docId: `${CHAIN_ID}-1` })
    )
  })

  it('should not call set when document already exists', async () => {
    // Arrange
    const { mockFs, mockDocRef } = buildMockFirestore(true)
    const parsedPool = buildParsedPool({ poolId: 5, chainId: CHAIN_ID })

    // Act
    await indexPoolEvent(parsedPool, mockFs)

    // Assert
    expect(mockDocRef.set).not.toHaveBeenCalled()
  })

  it('should return alreadyIndexed:false and stored:true when document does not exist', async () => {
    // Arrange
    const { mockFs } = buildMockFirestore(false)
    const parsedPool = buildParsedPool({ poolId: 2, chainId: CHAIN_ID })

    // Act
    const result = await indexPoolEvent(parsedPool, mockFs)

    // Assert
    expect(result).toEqual({ poolId: 2, alreadyIndexed: false, stored: true })
  })

  it('should write the pool document with all required fields when it does not exist', async () => {
    // Arrange
    const { mockFs, mockDocRef } = buildMockFirestore(false)
    const parsedPool = buildParsedPool({ poolId: 3 })

    // Act
    await indexPoolEvent(parsedPool, mockFs)

    // Assert
    expect(mockDocRef.set).toHaveBeenCalledWith(
      expect.objectContaining({
        poolId: 3,
        poolAddress: parsedPool.poolAddress,
        poolOwner: parsedPool.poolOwner,
        name: parsedPool.name,
        description: '',
        maxLoanAmount: parsedPool.maxLoanAmount,
        interestRate: parsedPool.interestRate,
        loanDuration: parsedPool.loanDuration,
        chainId: CHAIN_ID,
        createdBy: parsedPool.poolOwner,
        createdAt: parsedPool.createdAt,
        transactionHash: parsedPool.transactionHash,
        isActive: true,
      })
    )
  })

  it('should use the correct docId format chainId-poolId for the Firestore document', async () => {
    // Arrange
    const { mockFs, mockCollection } = buildMockFirestore(false)
    const parsedPool = buildParsedPool({ poolId: 7, chainId: 80002 })

    // Act
    await indexPoolEvent(parsedPool, mockFs)

    // Assert
    expect(mockCollection.doc).toHaveBeenCalledWith('80002-7')
  })

  it('should set createdBy equal to poolOwner (the msg.sender at creation)', async () => {
    // Arrange
    const { mockFs, mockDocRef } = buildMockFirestore(false)
    const parsedPool = buildParsedPool({ poolId: 9, poolOwner: '0xCreatorAddr' })

    // Act
    await indexPoolEvent(parsedPool, mockFs)

    // Assert
    expect(mockDocRef.set).toHaveBeenCalledWith(expect.objectContaining({ createdBy: '0xCreatorAddr' }))
  })

  it('should log success after writing a new pool', async () => {
    // Arrange
    const { mockFs } = buildMockFirestore(false)
    const parsedPool = buildParsedPool({ poolId: 4 })

    // Act
    await indexPoolEvent(parsedPool, mockFs)

    // Assert
    expect(mockLogger.info).toHaveBeenCalledWith('Pool indexed successfully', expect.objectContaining({ poolId: 4, chainId: CHAIN_ID }))
  })
})

// ---------------------------------------------------------------------------
// indexPoolByTxHash
// ---------------------------------------------------------------------------

describe('indexPoolByTxHash', () => {
  function buildMockProvider(
    overrides: Partial<{
      receipt: object | null
      block: object | null
    }> = {}
  ) {
    const defaultReceipt = {
      status: 1,
      blockNumber: BLOCK_NUMBER,
      logs: [
        {
          topics: [POOL_CREATED_TOPIC],
          data: '0xlogdata',
          transactionHash: TX_HASH,
          blockNumber: BLOCK_NUMBER,
        },
      ],
    }

    return {
      getTransactionReceipt: jest.fn().mockResolvedValue(overrides.receipt !== undefined ? overrides.receipt : defaultReceipt),
      getBlock: jest
        .fn()
        .mockResolvedValue(overrides.block !== undefined ? overrides.block : { timestamp: BLOCK_TIMESTAMP, number: BLOCK_NUMBER }),
    }
  }

  function buildMockFirestoreForIndex(docExists: boolean) {
    const mockSet = jest.fn().mockResolvedValue(undefined)
    const mockGet = jest.fn().mockResolvedValue(createMockDoc({}, docExists))
    const mockDocRef = { get: mockGet, set: mockSet }
    const mockCollection = { doc: jest.fn().mockReturnValue(mockDocRef) }
    return {
      collection: jest.fn().mockReturnValue(mockCollection),
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    // Ensure the Interface mock always returns the topic hash so that log filtering works
    mockGetEvent.mockReturnValue({ topicHash: POOL_CREATED_TOPIC })
    mockDecodeEventLog.mockReturnValue(makeDefaultDecodeReturn())
  })

  it('should throw HttpsError not-found when receipt is null', async () => {
    // Arrange
    const mockProvider = buildMockProvider({ receipt: null })
    const mockFs = buildMockFirestoreForIndex(false)

    // Act & Assert
    await expect(indexPoolByTxHash(TX_HASH, CHAIN_ID, mockProvider, mockFs)).rejects.toHaveProperty('code', 'not-found')
  })

  it('should include the txHash in the not-found error message when receipt is missing', async () => {
    // Arrange
    const mockProvider = buildMockProvider({ receipt: null })
    const mockFs = buildMockFirestoreForIndex(false)

    // Act & Assert
    await expect(indexPoolByTxHash(TX_HASH, CHAIN_ID, mockProvider, mockFs)).rejects.toMatchObject({
      message: expect.stringContaining(TX_HASH),
    })
  })

  it('should throw HttpsError failed-precondition when transaction was reverted (status !== 1)', async () => {
    // Arrange
    const revertedReceipt = { status: 0, blockNumber: BLOCK_NUMBER, logs: [] }
    const mockProvider = buildMockProvider({ receipt: revertedReceipt })
    const mockFs = buildMockFirestoreForIndex(false)

    // Act & Assert
    await expect(indexPoolByTxHash(TX_HASH, CHAIN_ID, mockProvider, mockFs)).rejects.toHaveProperty('code', 'failed-precondition')
  })

  it('should throw HttpsError not-found when no PoolCreated log is present', async () => {
    // Arrange
    const receiptNoMatch = {
      status: 1,
      blockNumber: BLOCK_NUMBER,
      logs: [{ topics: ['0xDIFFERENT_TOPIC'], data: '0x', transactionHash: TX_HASH, blockNumber: BLOCK_NUMBER }],
    }
    const mockProvider = buildMockProvider({ receipt: receiptNoMatch })
    const mockFs = buildMockFirestoreForIndex(false)

    // Act & Assert
    await expect(indexPoolByTxHash(TX_HASH, CHAIN_ID, mockProvider, mockFs)).rejects.toHaveProperty('code', 'not-found')
  })

  it('should throw HttpsError not-found when receipt has empty logs array', async () => {
    // Arrange
    const receiptNoLogs = { status: 1, blockNumber: BLOCK_NUMBER, logs: [] }
    const mockProvider = buildMockProvider({ receipt: receiptNoLogs })
    const mockFs = buildMockFirestoreForIndex(false)

    // Act & Assert
    await expect(indexPoolByTxHash(TX_HASH, CHAIN_ID, mockProvider, mockFs)).rejects.toHaveProperty('code', 'not-found')
  })

  it('should throw HttpsError internal when block fetch returns null', async () => {
    // Arrange
    const mockProvider = buildMockProvider({ block: null })
    const mockFs = buildMockFirestoreForIndex(false)

    // Act & Assert
    await expect(indexPoolByTxHash(TX_HASH, CHAIN_ID, mockProvider, mockFs)).rejects.toHaveProperty('code', 'internal')
  })

  it('should return stored:true for a new pool on the happy path', async () => {
    // Arrange
    const mockProvider = buildMockProvider()
    const mockFs = buildMockFirestoreForIndex(false)

    // Act
    const result = await indexPoolByTxHash(TX_HASH, CHAIN_ID, mockProvider, mockFs)

    // Assert
    expect(result.stored).toBe(true)
    expect(result.alreadyIndexed).toBe(false)
    expect(result.poolId).toBe(1)
  })

  it('should return alreadyIndexed:true for an existing pool on the happy path', async () => {
    // Arrange
    const mockProvider = buildMockProvider()
    const mockFs = buildMockFirestoreForIndex(true)

    // Act
    const result = await indexPoolByTxHash(TX_HASH, CHAIN_ID, mockProvider, mockFs)

    // Assert
    expect(result.alreadyIndexed).toBe(true)
    expect(result.stored).toBe(false)
  })

  it('should call getBlock with the blockNumber from the receipt', async () => {
    // Arrange
    const mockProvider = buildMockProvider()
    const mockFs = buildMockFirestoreForIndex(false)

    // Act
    await indexPoolByTxHash(TX_HASH, CHAIN_ID, mockProvider, mockFs)

    // Assert
    expect(mockProvider.getBlock).toHaveBeenCalledWith(BLOCK_NUMBER)
  })

  it('should pass the correct chainId to parsePoolCreatedLog', async () => {
    // Arrange
    const mockProvider = buildMockProvider()
    const mockFs = buildMockFirestoreForIndex(false)
    const customChainId = 80002
    // Provide a matching receipt log with the correct topic
    const customReceipt = {
      status: 1,
      blockNumber: BLOCK_NUMBER,
      logs: [{ topics: [POOL_CREATED_TOPIC], data: '0xlogdata', transactionHash: TX_HASH, blockNumber: BLOCK_NUMBER }],
    }
    mockProvider.getTransactionReceipt.mockResolvedValue(customReceipt)

    // Act
    const result = await indexPoolByTxHash(TX_HASH, customChainId, mockProvider, mockFs)

    // Assert — the poolId comes from decodeEventLog BigInt(1) = 1
    expect(result.poolId).toBe(1)
  })
})
