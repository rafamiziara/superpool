import { mockLogger } from '../__tests__/setup'
import { buildSearchTokens } from '../utils/searchTokens'
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
    // Delegates to the real Contract by default so the suites that predate this
    // mock behave exactly as before; the pool-status tests override it.
    Contract: jest.fn().mockImplementation((...args: unknown[]) => new actual.Contract(...(args as [string, object, object]))),
  }
})

// Import AFTER mocks are registered
const {
  parsePoolCreatedLog,
  indexPoolEvent,
  indexPoolByTxHash,
  fetchPoolActive,
  updatePoolActive,
  fetchPoolMetadata,
} = require('./eventIndexer')
const { Contract } = require('ethers')

// ---------------------------------------------------------------------------
// Shared test constants
// ---------------------------------------------------------------------------

const CHAIN_ID = 31337
const TX_HASH = '0xabc123def456'
const BLOCK_NUMBER = 100
const BLOCK_TIMESTAMP = 1700000000
const POOL_CREATED_TOPIC = '0xPOOL_CREATED_TOPIC'
const NATIVE = '0x0000000000000000000000000000000000000000'
const TOKEN = '0xStablecoinAddress'

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
    loanToken: NATIVE,
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
    // `create()` is what the indexer relies on for atomicity: Firestore rejects
    // it with ALREADY_EXISTS rather than overwriting.
    const mockCreate = docExists ? jest.fn().mockRejectedValue(alreadyExistsError()) : jest.fn().mockResolvedValue(undefined)

    // `get` and `update` are here because the already-exists path reads the
    // document back to see what needs filling in — token metadata, and now the
    // search tokens that backfill every pool indexed before Discover could
    // search past its first page.
    const mockDocRef = {
      create: mockCreate,
      get: jest.fn().mockResolvedValue({ exists: true, data: () => ({ searchTokens: [] }) }),
      update: jest.fn().mockResolvedValue(undefined),
    }

    const mockCollection = {
      doc: jest.fn().mockReturnValue(mockDocRef),
    }

    const mockFs = {
      collection: jest.fn().mockReturnValue(mockCollection),
    }

    return { mockFs, mockCollection, mockDocRef, mockCreate }
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

  it('should store exactly once when two callers index the same pool concurrently', async () => {
    // Arrange — the create screen and the pools screen both index the same
    // confirmed transaction. A read-then-write let both observe "absent" and
    // both report a first-time store; only one may win.
    let created = false
    const mockCreate = jest.fn().mockImplementation(async () => {
      if (created) throw alreadyExistsError()
      created = true
    })
    const mockFs = {
      collection: jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({
          create: mockCreate,
          get: jest.fn().mockResolvedValue({ exists: true, data: () => ({ searchTokens: [] }) }),
          update: jest.fn().mockResolvedValue(undefined),
        }),
      }),
    }
    const parsedPool = buildParsedPool({ poolId: 5, chainId: CHAIN_ID })

    // Act
    const results = await Promise.all([indexPoolEvent(parsedPool, mockFs), indexPoolEvent(parsedPool, mockFs)])

    // Assert
    expect(results.filter((result) => result.stored)).toHaveLength(1)
    expect(results.filter((result) => result.alreadyIndexed)).toHaveLength(1)
  })

  it('should propagate a write failure that is not ALREADY_EXISTS', async () => {
    // Arrange — a permission or transport error must not be reported as an
    // already-indexed pool, which would silently drop it.
    const mockCreate = jest.fn().mockRejectedValue(Object.assign(new Error('7 PERMISSION_DENIED'), { code: 7 }))
    const mockFs = {
      collection: jest.fn().mockReturnValue({ doc: jest.fn().mockReturnValue({ create: mockCreate }) }),
    }
    const parsedPool = buildParsedPool({ poolId: 6, chainId: CHAIN_ID })

    // Act & Assert
    await expect(indexPoolEvent(parsedPool, mockFs)).rejects.toThrow('7 PERMISSION_DENIED')
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
    expect(mockDocRef.create).toHaveBeenCalledWith(
      expect.objectContaining({
        poolId: 3,
        poolAddress: parsedPool.poolAddress,
        poolOwner: parsedPool.poolOwner.toLowerCase(),
        name: parsedPool.name,
        description: '',
        maxLoanAmount: parsedPool.maxLoanAmount,
        interestRate: parsedPool.interestRate,
        loanDuration: parsedPool.loanDuration,
        chainId: CHAIN_ID,
        createdBy: parsedPool.poolOwner.toLowerCase(),
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
    expect(mockDocRef.create).toHaveBeenCalledWith(expect.objectContaining({ createdBy: '0xcreatoraddr' }))
  })

  it('should store addresses lowercased, so the listPools owner filter can match', async () => {
    // Arrange
    const { mockFs, mockDocRef } = buildMockFirestore(false)
    const parsedPool = buildParsedPool({ poolId: 10, poolOwner: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc' })

    // Act
    await indexPoolEvent(parsedPool, mockFs)

    // Assert
    expect(mockDocRef.create).toHaveBeenCalledWith(
      expect.objectContaining({
        poolOwner: '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc',
        createdBy: '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc',
      })
    )
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

  describe('denomination', () => {
    it('stores a native pool with the zero address and no token metadata', async () => {
      const { mockFs, mockCreate } = buildMockFirestore(false)

      await indexPoolEvent(buildParsedPool(), mockFs)

      const written = mockCreate.mock.calls[0][0]
      expect(written.loanToken).toBe(NATIVE)
      // Not `null`, not `'POL'` — absent. The native symbol belongs to the
      // chain, and writing one here would put POL on a Base pool.
      expect('tokenSymbol' in written).toBe(false)
      expect('tokenDecimals' in written).toBe(false)
    })

    it('stores a token pool with its symbol and decimals', async () => {
      const { mockFs, mockCreate } = buildMockFirestore(false)

      await indexPoolEvent(buildParsedPool({ loanToken: TOKEN, tokenSymbol: 'USDC', tokenDecimals: 6 }), mockFs)

      expect(mockCreate.mock.calls[0][0]).toMatchObject({
        loanToken: TOKEN.toLowerCase(),
        tokenSymbol: 'USDC',
        tokenDecimals: 6,
      })
    })

    it('lowercases the token address, like every other address it stores', async () => {
      const { mockFs, mockCreate } = buildMockFirestore(false)

      await indexPoolEvent(buildParsedPool({ loanToken: '0xABCDEF', tokenSymbol: 'USDC', tokenDecimals: 6 }), mockFs)

      expect(mockCreate.mock.calls[0][0].loanToken).toBe('0xabcdef')
    })

    it('writes no decimals at all when the token could not be read', async () => {
      // Firestore rejects `undefined` outright, and a default would be worse
      // than a rejection: the app has to be able to tell "unsupported" from
      // "eighteen".
      const { mockFs, mockCreate } = buildMockFirestore(false)

      await indexPoolEvent(buildParsedPool({ loanToken: TOKEN }), mockFs)

      const written = mockCreate.mock.calls[0][0]
      expect(written.loanToken).toBe(TOKEN.toLowerCase())
      expect('tokenDecimals' in written).toBe(false)
    })
  })

  describe('repairing a pool already indexed without something', () => {
    function buildExistingPool(stored: Record<string, unknown>) {
      const mockUpdate = jest.fn().mockResolvedValue(undefined)
      const mockGet = jest.fn().mockResolvedValue({ exists: true, data: () => stored })
      const mockDocRef = {
        create: jest.fn().mockRejectedValue(alreadyExistsError()),
        get: mockGet,
        update: mockUpdate,
      }

      return {
        mockFs: { collection: jest.fn().mockReturnValue({ doc: jest.fn().mockReturnValue(mockDocRef) }) },
        mockUpdate,
      }
    }

    it('fills in metadata a failed token read left out', async () => {
      // One RPC hiccup at creation would otherwise mark a pool unsupported for
      // ever, because `create()` never runs again for it. The sweep re-scans
      // ranges deliberately, so this path actually runs.
      const { mockFs, mockUpdate } = buildExistingPool({
        loanToken: TOKEN.toLowerCase(),
        searchTokens: ['te', 'tes', 'test', 'po', 'poo', 'pool'],
      })

      const result = await indexPoolEvent(buildParsedPool({ loanToken: TOKEN, tokenSymbol: 'USDC', tokenDecimals: 6 }), mockFs)

      expect(mockUpdate).toHaveBeenCalledWith({ loanToken: TOKEN.toLowerCase(), tokenSymbol: 'USDC', tokenDecimals: 6 })
      // Still not a store: nothing was created, and the caller's counters are
      // about pools discovered, not fields tidied.
      expect(result).toEqual({ poolId: 1, alreadyIndexed: true, stored: false })
    })

    it('never overwrites metadata that is already there', async () => {
      // Repairs in one direction only — absent to known — so a later failed
      // read cannot undo a good value.
      const { mockFs, mockUpdate } = buildExistingPool({
        loanToken: TOKEN.toLowerCase(),
        tokenSymbol: 'USDC',
        tokenDecimals: 6,
        searchTokens: ['te', 'tes', 'test', 'po', 'poo', 'pool'],
      })

      await indexPoolEvent(buildParsedPool({ loanToken: TOKEN, tokenSymbol: 'WRONG', tokenDecimals: 18 }), mockFs)

      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it('leaves a pool indexed before denominations existed alone', async () => {
      // It has no `loanToken` because it is native, which is what it is. There
      // is nothing to repair, and touching it would be a rewrite for nothing.
      const { mockFs, mockUpdate } = buildExistingPool({
        name: 'An older pool',
        searchTokens: ['te', 'tes', 'test', 'po', 'poo', 'pool'],
      })

      await indexPoolEvent(buildParsedPool(), mockFs)

      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it('does not repair when this read failed too', async () => {
      const { mockFs, mockUpdate } = buildExistingPool({
        loanToken: TOKEN.toLowerCase(),
        searchTokens: ['te', 'tes', 'test', 'po', 'poo', 'pool'],
      })

      await indexPoolEvent(buildParsedPool({ loanToken: TOKEN }), mockFs)

      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it('backfills search tokens onto a pool indexed before Discover could search', async () => {
      // The whole backfill story: `create()` never runs again for a pool, so
      // without this every pool that existed before search tokens did would be
      // unfindable past the first page for ever. Re-running the sweep from the
      // factory's block is what applies it.
      const { mockFs, mockUpdate } = buildExistingPool({ name: 'Builders Guild' })

      await indexPoolEvent(buildParsedPool({ name: 'Builders Guild' }), mockFs)

      expect(mockUpdate).toHaveBeenCalledWith({ searchTokens: expect.arrayContaining(['guild', 'builders']) })
    })

    it('adds to search tokens rather than replacing them', async () => {
      // `fetchPoolMetadata` returns an empty description when the read *failed*,
      // and an empty description is also what most pools legitimately have — so
      // rebuilding the array would let one RPC hiccup delete a pool's
      // description from the index. A union cannot.
      const { mockFs, mockUpdate } = buildExistingPool({ searchTokens: ['re', 'ren', 'rent'] })

      await indexPoolEvent(buildParsedPool({ name: 'Test Pool', description: '' }), mockFs)

      expect(mockUpdate).toHaveBeenCalledWith({ searchTokens: expect.arrayContaining(['rent', 'test', 'pool']) })
    })

    it('writes nothing when the stored tokens already cover this read', async () => {
      const { mockFs, mockUpdate } = buildExistingPool({ searchTokens: buildSearchTokens('Test Pool', '') })

      await indexPoolEvent(buildParsedPool(), mockFs)

      expect(mockUpdate).not.toHaveBeenCalled()
    })
  })
})

// ---------------------------------------------------------------------------
// fetchPoolMetadata
// ---------------------------------------------------------------------------

describe('fetchPoolMetadata', () => {
  const FACTORY = '0xFactoryAddress'

  beforeEach(() => {
    jest.clearAllMocks()
  })

  /**
   * The indexer builds two contracts from one address argument each: the
   * factory, then the token. Dispatching on the address keeps the two apart
   * without depending on the order they happen to be constructed in.
   */
  function mockChain(options: { poolInfo?: object; poolInfoError?: Error; symbol?: string; decimals?: bigint; tokenError?: Error }) {
    Contract.mockImplementation((address: string) => {
      if (address === FACTORY) {
        return {
          getPoolInfo: options.poolInfoError
            ? jest.fn().mockRejectedValue(options.poolInfoError)
            : jest.fn().mockResolvedValue(options.poolInfo),
        }
      }

      return {
        symbol: options.tokenError ? jest.fn().mockRejectedValue(options.tokenError) : jest.fn().mockResolvedValue(options.symbol),
        decimals: options.tokenError ? jest.fn().mockRejectedValue(options.tokenError) : jest.fn().mockResolvedValue(options.decimals),
      }
    })
  }

  it('reads the description and the denomination in one call', async () => {
    mockChain({ poolInfo: { description: 'Micro-loans', loanToken: NATIVE } })

    expect(await fetchPoolMetadata(1, FACTORY, {})).toEqual({ description: 'Micro-loans', loanToken: NATIVE })
  })

  it('asks a token pool’s token for its symbol and decimals', async () => {
    mockChain({ poolInfo: { description: 'Stable circle', loanToken: TOKEN }, symbol: 'USDC', decimals: 6n })

    expect(await fetchPoolMetadata(1, FACTORY, {})).toEqual({
      description: 'Stable circle',
      loanToken: TOKEN,
      tokenSymbol: 'USDC',
      tokenDecimals: 6,
    })
  })

  it('does not ask a native pool’s non-existent token anything', async () => {
    mockChain({ poolInfo: { description: '', loanToken: NATIVE } })

    await fetchPoolMetadata(1, FACTORY, {})

    // One contract, the factory. Constructing an ERC-20 at the zero address
    // would be a guaranteed-failing call on every native pool ever swept.
    expect(Contract).toHaveBeenCalledTimes(1)
  })

  it('indexes the pool as native when the factory cannot be read', async () => {
    // Degrading to native rather than throwing: losing the pool entirely is
    // worse, and native is what all but the token pools are.
    mockChain({ poolInfoError: new Error('call reverted') })

    expect(await fetchPoolMetadata(1, FACTORY, {})).toEqual({ description: '', loanToken: NATIVE })
    expect(mockLogger.warn).toHaveBeenCalled()
  })

  it('returns no decimals rather than a guess when the token cannot be read', async () => {
    // The pool is still stored — losing it would be worse — but it reaches the
    // app as unsupported instead of being formatted with 18 decimals it may
    // not have.
    mockChain({ poolInfo: { description: 'Stable circle', loanToken: TOKEN }, tokenError: new Error('not a contract') })

    expect(await fetchPoolMetadata(1, FACTORY, {})).toEqual({ description: 'Stable circle', loanToken: TOKEN })
    expect(mockLogger.warn).toHaveBeenCalled()
  })

  it('treats a factory that has never heard of denominations as native', async () => {
    // A factory deployed before `PoolInfo.loanToken` existed returns a struct
    // without it. `undefined` there must not become `undefined` in Firestore.
    mockChain({ poolInfo: { description: 'An older pool' } })

    expect(await fetchPoolMetadata(1, FACTORY, {})).toEqual({ description: 'An older pool', loanToken: NATIVE })
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
    const mockCreate = docExists ? jest.fn().mockRejectedValue(alreadyExistsError()) : jest.fn().mockResolvedValue(undefined)
    // `get`/`update` for the already-exists path, which reads the document back
    // to fill in anything missing. See `buildMockFirestore` above.
    const mockDocRef = {
      create: mockCreate,
      get: jest.fn().mockResolvedValue({ exists: true, data: () => ({ searchTokens: [] }) }),
      update: jest.fn().mockResolvedValue(undefined),
    }
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

// ---------------------------------------------------------------------------
// Pool status reconciliation.
//
// `isActive` is written true when a pool is first indexed. Nothing else ever
// touched it, so a pool deactivated on chain was listed forever — these two are
// what closes that.
// ---------------------------------------------------------------------------

describe('fetchPoolActive', () => {
  const FACTORY_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'
  const defaultContract = Contract.getMockImplementation()

  afterEach(() => {
    Contract.mockImplementation(defaultContract)
  })

  it.each([
    ['active', true],
    ['inactive', false],
  ])('should return the factory answer for a pool that is %s', async (_name, isActive) => {
    // Arrange
    const mockIsPoolActive = jest.fn().mockResolvedValue(isActive)
    Contract.mockImplementation(() => ({ isPoolActive: mockIsPoolActive }))

    // Act
    const result = await fetchPoolActive(7, FACTORY_ADDRESS, {})

    // Assert
    expect(result).toBe(isActive)
    expect(mockIsPoolActive).toHaveBeenCalledWith(7)
  })

  it('should let a failed read surface rather than guessing a flag', async () => {
    // Arrange
    // Defaulting to `true` here would silently re-activate a deactivated pool;
    // the caller logs and skips instead, leaving the stored value alone.
    Contract.mockImplementation(() => ({ isPoolActive: jest.fn().mockRejectedValue(new Error('call reverted')) }))

    // Act & Assert
    await expect(fetchPoolActive(7, FACTORY_ADDRESS, {})).rejects.toThrow('call reverted')
  })
})

describe('updatePoolActive', () => {
  function buildMockFirestore(options: { exists?: boolean; storedIsActive?: boolean } = {}) {
    const { exists = true, storedIsActive = true } = options
    const mockUpdate = jest.fn().mockResolvedValue(undefined)
    const mockDocRef = {
      get: jest.fn().mockResolvedValue({ exists, data: () => (exists ? { isActive: storedIsActive } : null) }),
      update: mockUpdate,
    }
    const mockCollection = jest.fn().mockReturnValue({ doc: jest.fn().mockReturnValue(mockDocRef) })

    return { mockFs: { collection: mockCollection }, mockDocRef, mockCollection }
  }

  it('should write the new flag and report the change', async () => {
    // Arrange
    const { mockFs, mockDocRef } = buildMockFirestore({ storedIsActive: true })

    // Act
    const changed = await updatePoolActive(7, CHAIN_ID, false, mockFs)

    // Assert
    expect(changed).toBe(true)
    expect(mockDocRef.update).toHaveBeenCalledWith({ isActive: false })
  })

  it('should reactivate a pool that came back', async () => {
    // Arrange
    const { mockFs, mockDocRef } = buildMockFirestore({ storedIsActive: false })

    // Act
    const changed = await updatePoolActive(7, CHAIN_ID, true, mockFs)

    // Assert
    expect(changed).toBe(true)
    expect(mockDocRef.update).toHaveBeenCalledWith({ isActive: true })
  })

  it('should not write when the stored flag already agrees', async () => {
    // Arrange
    // Every sweep re-reads settled history; writing each time would make the
    // reported counts meaningless and cost a write per pool per run.
    const { mockFs, mockDocRef } = buildMockFirestore({ storedIsActive: false })

    // Act
    const changed = await updatePoolActive(7, CHAIN_ID, false, mockFs)

    // Assert
    expect(changed).toBe(false)
    expect(mockDocRef.update).not.toHaveBeenCalled()
  })

  it('should skip a pool that was never indexed rather than create a stub', async () => {
    // Arrange
    // The pool's creation predates the sync window. A status-only document
    // would put a pool with no name, owner or terms in front of the user.
    const { mockFs, mockDocRef } = buildMockFirestore({ exists: false })

    // Act
    const changed = await updatePoolActive(7, CHAIN_ID, false, mockFs)

    // Assert
    expect(changed).toBe(false)
    expect(mockDocRef.update).not.toHaveBeenCalled()
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Pool status changed for a pool that was never indexed; skipping',
      expect.objectContaining({ poolId: 7, chainId: CHAIN_ID })
    )
  })

  it('should address the document by chain and pool id', async () => {
    // Arrange
    const { mockFs, mockCollection } = buildMockFirestore()

    // Act
    await updatePoolActive(7, CHAIN_ID, false, mockFs)

    // Assert
    expect(mockCollection).toHaveBeenCalledWith('pools')
    expect(mockCollection.mock.results[0].value.doc).toHaveBeenCalledWith(`${CHAIN_ID}-7`)
  })
})
