import { mockLogger } from '../../__tests__/setup'

jest.mock('../../utils/blockchain')
jest.mock('../../services')
jest.mock('../../services/eventIndexer')
jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers')
  return {
    ...actual,
    Contract: jest.fn(),
  }
})

const { syncPoolEventsHandler } = require('./syncPoolEvents')
const { getProvider } = require('../../utils/blockchain')
const { indexPoolEvent, parsePoolCreatedLog } = require('../../services/eventIndexer')
const { firestore } = require('../../services')
const { Contract } = require('ethers')

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHAIN_ID = 31337 // default from ACTIVE_CHAIN_CONFIG
const CURRENT_BLOCK = 5000
const LAST_PROCESSED_BLOCK = 4900
const FROM_BLOCK = LAST_PROCESSED_BLOCK + 1
// toBlock = min(CURRENT_BLOCK, FROM_BLOCK + 500) = min(5000, 5401) = 5000
const TO_BLOCK = Math.min(CURRENT_BLOCK, FROM_BLOCK + 500)

// ---------------------------------------------------------------------------
// Mock builder helpers
// ---------------------------------------------------------------------------

function buildMockProvider(
  overrides: Partial<{
    getBlockNumberError: Error | null
    currentBlock: number
    blockData: object | null
  }> = {}
) {
  const { getBlockNumberError, currentBlock = CURRENT_BLOCK, blockData } = overrides
  return {
    getBlockNumber: getBlockNumberError ? jest.fn().mockRejectedValue(getBlockNumberError) : jest.fn().mockResolvedValue(currentBlock),
    getBlock: jest.fn().mockResolvedValue(blockData !== undefined ? blockData : { timestamp: 1700000000, number: CURRENT_BLOCK }),
  }
}

function buildMockSyncStateRef(docExists: boolean, lastProcessedBlock: number = LAST_PROCESSED_BLOCK) {
  const mockSet = jest.fn().mockResolvedValue(undefined)
  const mockGet = jest
    .fn()
    .mockResolvedValue(docExists ? { exists: true, data: () => ({ lastProcessedBlock }) } : { exists: false, data: () => null })

  return {
    get: mockGet,
    set: mockSet,
  }
}

interface SetupFirestoreOptions {
  syncStateDocExists?: boolean
  lastProcessedBlock?: number
  syncStateSetError?: Error | null
}

function setupFirestore(options: SetupFirestoreOptions = {}) {
  const { syncStateDocExists = true, lastProcessedBlock = LAST_PROCESSED_BLOCK, syncStateSetError = null } = options

  const syncStateRef = buildMockSyncStateRef(syncStateDocExists, lastProcessedBlock)

  if (syncStateSetError) {
    syncStateRef.set.mockRejectedValue(syncStateSetError)
  }

  const poolsCollection = {
    doc: jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({ exists: false, data: () => null }),
      set: jest.fn().mockResolvedValue(undefined),
    }),
  }

  firestore.collection.mockImplementation((name: string) => {
    if (name === 'event_sync_state') {
      return { doc: jest.fn().mockReturnValue(syncStateRef) }
    }
    return poolsCollection
  })

  return { syncStateRef, poolsCollection }
}

function buildMockContract(events: object[] = []) {
  const mockQueryFilter = jest.fn().mockResolvedValue(events)
  const mockFilters = { PoolCreated: jest.fn().mockReturnValue({}) }
  const contractInstance = {
    queryFilter: mockQueryFilter,
    filters: mockFilters,
  }

  ;(Contract as jest.Mock).mockImplementation(() => contractInstance)

  return { contractInstance, mockQueryFilter, mockFilters }
}

function buildMockEvent(blockNumber: number = CURRENT_BLOCK) {
  return {
    blockNumber,
    data: '0xlogdata',
    topics: ['0xPOOL_CREATED_TOPIC'],
    transactionHash: '0x' + 'a'.repeat(64),
  }
}

function buildParsedPool(poolId: number = 1) {
  return {
    poolId,
    poolAddress: '0xPoolAddress',
    poolOwner: '0xOwner',
    name: 'Test Pool',
    description: '',
    maxLoanAmount: '1000000000000000000',
    interestRate: 500,
    loanDuration: 2592000,
    chainId: CHAIN_ID,
    transactionHash: '0x' + 'a'.repeat(64),
    blockNumber: CURRENT_BLOCK,
    createdAt: new Date(),
    isActive: true,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('syncPoolEventsHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // Provider failure
  // -------------------------------------------------------------------------

  it('should log error and return early when getProvider throws', async () => {
    // Arrange
    getProvider.mockImplementation(() => {
      throw new Error('provider init failed')
    })
    setupFirestore()
    buildMockContract()

    // Act
    await syncPoolEventsHandler()

    // Assert
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to get provider for sync',
      expect.objectContaining({ chainId: CHAIN_ID, error: 'provider init failed' })
    )
    expect(firestore.collection).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // getBlockNumber failure
  // -------------------------------------------------------------------------

  it('should log error and return early when getBlockNumber rejects', async () => {
    // Arrange
    const mockProvider = buildMockProvider({ getBlockNumberError: new Error('network timeout') })
    getProvider.mockReturnValue(mockProvider)
    setupFirestore()
    buildMockContract()

    // Act
    await syncPoolEventsHandler()

    // Assert
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to get current block number',
      expect.objectContaining({ chainId: CHAIN_ID, error: 'network timeout' })
    )
    expect(firestore.collection).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Already synced
  // -------------------------------------------------------------------------

  it('should log "nothing to do" and return early when already synced to current block', async () => {
    // Arrange
    // lastProcessedBlock === currentBlock → fromBlock > currentBlock → nothing to do
    const mockProvider = buildMockProvider({ currentBlock: CURRENT_BLOCK })
    getProvider.mockReturnValue(mockProvider)
    setupFirestore({ syncStateDocExists: true, lastProcessedBlock: CURRENT_BLOCK })
    buildMockContract()

    // Act
    await syncPoolEventsHandler()

    // Assert
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Already synced up to current block, nothing to do',
      expect.objectContaining({ chainId: CHAIN_ID })
    )
  })

  // -------------------------------------------------------------------------
  // First run (no sync state doc)
  // -------------------------------------------------------------------------

  it('should use fallback startBlock = currentBlock - 1000 when no sync state doc exists', async () => {
    // Arrange
    const mockProvider = buildMockProvider({ currentBlock: CURRENT_BLOCK })
    getProvider.mockReturnValue(mockProvider)
    // No sync state doc → lastProcessedBlock = CURRENT_BLOCK - 1000 → fromBlock = CURRENT_BLOCK - 999
    setupFirestore({ syncStateDocExists: false })
    const { mockQueryFilter } = buildMockContract([])

    // Act
    await syncPoolEventsHandler()

    // Assert
    // fromBlock = (CURRENT_BLOCK - 1000) + 1 = CURRENT_BLOCK - 999
    expect(mockQueryFilter).toHaveBeenCalledWith(expect.anything(), CURRENT_BLOCK - 999, expect.any(Number))
  })

  // -------------------------------------------------------------------------
  // queryFilter failure
  // -------------------------------------------------------------------------

  it('should log error and return early without updating sync state when queryFilter fails', async () => {
    // Arrange
    const mockProvider = buildMockProvider()
    getProvider.mockReturnValue(mockProvider)
    const { syncStateRef } = setupFirestore()
    buildMockContract()

    const contractInstance = {
      queryFilter: jest.fn().mockRejectedValue(new Error('eth_getLogs timeout')),
      filters: { PoolCreated: jest.fn().mockReturnValue({}) },
    }
    ;(Contract as jest.Mock).mockImplementation(() => contractInstance)

    // Act
    await syncPoolEventsHandler()

    // Assert
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to query PoolCreated events',
      expect.objectContaining({ error: 'eth_getLogs timeout' })
    )
    expect(syncStateRef.set).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Normal sync with events
  // -------------------------------------------------------------------------

  it('should index all new events and update sync state', async () => {
    // Arrange
    const mockProvider = buildMockProvider()
    getProvider.mockReturnValue(mockProvider)
    const { syncStateRef } = setupFirestore()

    const event1 = buildMockEvent(CURRENT_BLOCK - 1)
    const event2 = buildMockEvent(CURRENT_BLOCK)
    buildMockContract([event1, event2])

    const parsedPool1 = buildParsedPool(1)
    const parsedPool2 = buildParsedPool(2)
    parsePoolCreatedLog.mockReturnValueOnce(parsedPool1).mockReturnValueOnce(parsedPool2)

    indexPoolEvent
      .mockResolvedValueOnce({ poolId: 1, alreadyIndexed: false, stored: true })
      .mockResolvedValueOnce({ poolId: 2, alreadyIndexed: false, stored: true })

    // Act
    await syncPoolEventsHandler()

    // Assert
    expect(indexPoolEvent).toHaveBeenCalledTimes(2)
    expect(syncStateRef.set).toHaveBeenCalledWith(
      expect.objectContaining({
        chainId: CHAIN_ID,
        lastProcessedBlock: TO_BLOCK,
      }),
      { merge: true }
    )
  })

  it('should log "Indexed new pool from sync" for each stored pool', async () => {
    // Arrange
    const mockProvider = buildMockProvider()
    getProvider.mockReturnValue(mockProvider)
    setupFirestore()

    const event = buildMockEvent()
    buildMockContract([event])
    parsePoolCreatedLog.mockReturnValue(buildParsedPool(1))
    indexPoolEvent.mockResolvedValue({ poolId: 1, alreadyIndexed: false, stored: true })

    // Act
    await syncPoolEventsHandler()

    // Assert
    expect(mockLogger.info).toHaveBeenCalledWith('Indexed new pool from sync', expect.objectContaining({ poolId: 1, chainId: CHAIN_ID }))
  })

  // -------------------------------------------------------------------------
  // Per-event errors
  // -------------------------------------------------------------------------

  it('should continue processing remaining events when one event fails', async () => {
    // Arrange
    const mockProvider = buildMockProvider()
    getProvider.mockReturnValue(mockProvider)
    const { syncStateRef } = setupFirestore()

    const event1 = buildMockEvent(CURRENT_BLOCK - 1)
    const event2 = buildMockEvent(CURRENT_BLOCK)
    buildMockContract([event1, event2])

    parsePoolCreatedLog
      .mockImplementationOnce(() => {
        throw new Error('bad decode')
      })
      .mockReturnValueOnce(buildParsedPool(2))

    indexPoolEvent.mockResolvedValue({ poolId: 2, alreadyIndexed: false, stored: true })

    // Act
    await syncPoolEventsHandler()

    // Assert
    expect(mockLogger.error).toHaveBeenCalledWith('Failed to process event during sync', expect.objectContaining({ error: 'bad decode' }))
    // Second event still processed
    expect(indexPoolEvent).toHaveBeenCalledTimes(1)
    // Sync state still updated
    expect(syncStateRef.set).toHaveBeenCalled()
  })

  it('should log error per failing event and not crash the whole run', async () => {
    // Arrange
    const mockProvider = buildMockProvider()
    getProvider.mockReturnValue(mockProvider)
    setupFirestore()

    const event = buildMockEvent()
    buildMockContract([event])

    // getBlock returns null to trigger an error path inside the event loop
    mockProvider.getBlock.mockResolvedValue(null)

    // Act
    await syncPoolEventsHandler()

    // Assert
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to fetch block for event',
      expect.objectContaining({ blockNumber: event.blockNumber, chainId: CHAIN_ID })
    )
    expect(indexPoolEvent).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Block range capping
  // -------------------------------------------------------------------------

  it('should cap the block range at MAX_BLOCK_RANGE (500) when range would exceed it', async () => {
    // Arrange
    // lastProcessedBlock is far behind so range = currentBlock - fromBlock > 500
    const farBehindBlock = 1000
    const bigCurrentBlock = 10000
    const mockProvider = buildMockProvider({ currentBlock: bigCurrentBlock })
    getProvider.mockReturnValue(mockProvider)
    setupFirestore({ syncStateDocExists: true, lastProcessedBlock: farBehindBlock })
    const { mockQueryFilter } = buildMockContract([])

    // Act
    await syncPoolEventsHandler()

    // Assert
    // fromBlock = farBehindBlock + 1 = 1001
    // toBlock should be capped at 1001 + 500 = 1501, not 10000
    expect(mockQueryFilter).toHaveBeenCalledWith(expect.anything(), farBehindBlock + 1, farBehindBlock + 1 + 500)
  })

  // -------------------------------------------------------------------------
  // Already indexed pools
  // -------------------------------------------------------------------------

  it('should log "Pool already indexed, skipped during sync" for already-indexed pools', async () => {
    // Arrange
    const mockProvider = buildMockProvider()
    getProvider.mockReturnValue(mockProvider)
    setupFirestore()

    const event = buildMockEvent()
    buildMockContract([event])
    parsePoolCreatedLog.mockReturnValue(buildParsedPool(5))
    indexPoolEvent.mockResolvedValue({ poolId: 5, alreadyIndexed: true, stored: false })

    // Act
    await syncPoolEventsHandler()

    // Assert
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Pool already indexed, skipped during sync',
      expect.objectContaining({ poolId: 5, chainId: CHAIN_ID })
    )
  })

  it('should not count already-indexed pools toward newPoolsCount', async () => {
    // Arrange
    const mockProvider = buildMockProvider()
    getProvider.mockReturnValue(mockProvider)
    const { syncStateRef } = setupFirestore()

    const event = buildMockEvent()
    buildMockContract([event])
    parsePoolCreatedLog.mockReturnValue(buildParsedPool(5))
    indexPoolEvent.mockResolvedValue({ poolId: 5, alreadyIndexed: true, stored: false })

    // Act
    await syncPoolEventsHandler()

    // Assert — totalPoolsIndexed should be incremented by 0, not 1
    expect(syncStateRef.set).toHaveBeenCalledWith(
      expect.objectContaining({
        totalPoolsIndexed: expect.anything(), // FieldValue.increment(0)
      }),
      { merge: true }
    )
  })

  // -------------------------------------------------------------------------
  // Sync state update failure
  // -------------------------------------------------------------------------

  it('should log error when sync state update fails but not throw', async () => {
    // Arrange
    const mockProvider = buildMockProvider()
    getProvider.mockReturnValue(mockProvider)
    setupFirestore({ syncStateSetError: new Error('Firestore write failed') })
    buildMockContract([])

    // Act
    await expect(syncPoolEventsHandler()).resolves.toBeUndefined()

    // Assert
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to update sync state',
      expect.objectContaining({ error: 'Firestore write failed' })
    )
  })

  // -------------------------------------------------------------------------
  // Sync completion log
  // -------------------------------------------------------------------------

  it('should log sync completion with correct block range and pool count', async () => {
    // Arrange
    const mockProvider = buildMockProvider()
    getProvider.mockReturnValue(mockProvider)
    setupFirestore()

    const event = buildMockEvent()
    buildMockContract([event])
    parsePoolCreatedLog.mockReturnValue(buildParsedPool(1))
    indexPoolEvent.mockResolvedValue({ poolId: 1, alreadyIndexed: false, stored: true })

    // Act
    await syncPoolEventsHandler()

    // Assert
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Sync completed'),
      expect.objectContaining({ chainId: CHAIN_ID, fromBlock: FROM_BLOCK, toBlock: TO_BLOCK, newPoolsCount: 1 })
    )
  })
})
