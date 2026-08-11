// `ACTIVE_CHAIN_CONFIG` reads the environment once, at module load, and the
// handler refuses to run without a factory address — so this must be set before
// the first require below.
process.env.POOL_FACTORY_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'

import { mockLogger } from '../../__tests__/setup'

jest.mock('../../utils/blockchain')
jest.mock('../../services')
jest.mock('../../services/eventSweeper')

const { syncPoolEventsHandler, resolveInitialFromBlock } = require('./syncPoolEvents')
const { getProvider } = require('../../utils/blockchain')
const { sweepBlockRange } = require('../../services/eventSweeper')
const { firestore } = require('../../services')

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHAIN_ID = 31337 // default from ACTIVE_CHAIN_CONFIG
const FACTORY_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'
const CURRENT_BLOCK = 5000
const LAST_PROCESSED_BLOCK = 4900
const MAX_BLOCK_RANGE = 500

const NO_COUNTS = { pools: 0, contributions: 0, withdrawals: 0 }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildMockProvider(currentBlock: number = CURRENT_BLOCK) {
  return { getBlockNumber: jest.fn().mockResolvedValue(currentBlock) }
}

interface FirestoreOptions {
  syncStateExists?: boolean
  lastProcessedBlock?: number
  setError?: Error
}

function setupFirestore(options: FirestoreOptions = {}) {
  const { syncStateExists = true, lastProcessedBlock = LAST_PROCESSED_BLOCK, setError } = options

  const syncStateRef = {
    get: jest.fn().mockResolvedValue({
      exists: syncStateExists,
      data: () => (syncStateExists ? { lastProcessedBlock } : null),
    }),
    set: setError ? jest.fn().mockRejectedValue(setError) : jest.fn().mockResolvedValue(undefined),
  }

  firestore.collection.mockReturnValue({ doc: jest.fn().mockReturnValue(syncStateRef) })

  return { syncStateRef }
}

/** The ranges `sweepBlockRange` was asked for, in order. */
function sweptRanges(): [number, number][] {
  return sweepBlockRange.mock.calls.map(([options]: [{ fromBlock: number; toBlock: number }]) => [options.fromBlock, options.toBlock])
}

beforeEach(() => {
  delete process.env.START_BLOCK
  getProvider.mockReturnValue(buildMockProvider())
  sweepBlockRange.mockResolvedValue({ ...NO_COUNTS })
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveInitialFromBlock', () => {
  it('should honour START_BLOCK when it is set', async () => {
    // Arrange
    process.env.START_BLOCK = '12345'

    // Act
    const fromBlock = resolveInitialFromBlock(CURRENT_BLOCK, 80002)

    // Assert
    expect(fromBlock).toBe(12345)
  })

  it('should sweep a local chain from genesis', async () => {
    // Arrange
    // A Hardhat node is a few dozen blocks deep and every block is ours; a
    // lookback window would leave the seeded pools permanently invisible.

    // Act
    const fromBlock = resolveInitialFromBlock(CURRENT_BLOCK, 31337)

    // Assert
    expect(fromBlock).toBe(0)
  })

  it('should fall back to a short lookback on other chains and warn about it', async () => {
    // Act
    const fromBlock = resolveInitialFromBlock(CURRENT_BLOCK, 80002)

    // Assert
    expect(fromBlock).toBe(CURRENT_BLOCK - 1000)
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('START_BLOCK'), expect.objectContaining({ chainId: 80002 }))
  })

  it('should not return a negative block on a chain shorter than the lookback', async () => {
    // Act
    const fromBlock = resolveInitialFromBlock(10, 80002)

    // Assert
    expect(fromBlock).toBe(0)
  })
})

describe('syncPoolEventsHandler', () => {
  describe('where the sweep starts', () => {
    it('should resume from the block after the stored cursor', async () => {
      // Arrange
      setupFirestore({ lastProcessedBlock: LAST_PROCESSED_BLOCK })

      // Act
      const result = await syncPoolEventsHandler()

      // Assert
      expect(result.fromBlock).toBe(LAST_PROCESSED_BLOCK + 1)
      expect(sweptRanges()).toEqual([[LAST_PROCESSED_BLOCK + 1, CURRENT_BLOCK]])
    })

    it('should sweep a local chain from genesis when there is no stored cursor', async () => {
      // Arrange
      setupFirestore({ syncStateExists: false })

      // Act
      const result = await syncPoolEventsHandler()

      // Assert
      expect(result.fromBlock).toBe(0)
    })

    it('should let an explicit fromBlock override the stored cursor', async () => {
      // Arrange
      // This is how a backfill is run without deleting the sync state; every
      // indexer keys on the log, so re-scanning writes nothing twice.
      setupFirestore({ lastProcessedBlock: LAST_PROCESSED_BLOCK })

      // Act
      const result = await syncPoolEventsHandler({ fromBlock: 0 })

      // Assert
      expect(result.fromBlock).toBe(0)
      expect(sweptRanges()[0]).toEqual([0, MAX_BLOCK_RANGE - 1])
    })

    it('should clamp a negative fromBlock to genesis', async () => {
      // Arrange
      setupFirestore()

      // Act
      const result = await syncPoolEventsHandler({ fromBlock: -50 })

      // Assert
      expect(result.fromBlock).toBe(0)
    })

    it('should do nothing when the cursor is already at the chain head', async () => {
      // Arrange
      setupFirestore({ lastProcessedBlock: CURRENT_BLOCK })

      // Act
      const result = await syncPoolEventsHandler()

      // Assert
      expect(sweepBlockRange).not.toHaveBeenCalled()
      expect(result).toMatchObject({ caughtUp: true, toBlock: CURRENT_BLOCK, ...NO_COUNTS })
    })
  })

  describe('chunking', () => {
    it('should split a long gap into ranges of at most MAX_BLOCK_RANGE blocks', async () => {
      // Arrange
      // Public RPCs cap the span of a single `getLogs`, so the gap has to be
      // walked rather than asked for in one query.
      setupFirestore({ lastProcessedBlock: -1 })
      getProvider.mockReturnValue(buildMockProvider(1200))

      // Act
      await syncPoolEventsHandler({ fromBlock: 0 })

      // Assert
      expect(sweptRanges()).toEqual([
        [0, 499],
        [500, 999],
        [1000, 1200],
      ])
    })

    it('should stop at the chain head rather than sweeping past it', async () => {
      // Arrange
      setupFirestore({ lastProcessedBlock: CURRENT_BLOCK - 10 })

      // Act
      await syncPoolEventsHandler()

      // Assert
      expect(sweptRanges()).toEqual([[CURRENT_BLOCK - 9, CURRENT_BLOCK]])
    })

    it('should stop on its range budget and report that it has not caught up', async () => {
      // Arrange
      // 100 ranges of 500 blocks. A first run on a long chain must return
      // rather than run past the function timeout; the next run continues.
      setupFirestore({ syncStateExists: false })
      getProvider.mockReturnValue(buildMockProvider(1_000_000))

      // Act
      const result = await syncPoolEventsHandler({ fromBlock: 0 })

      // Assert
      expect(sweepBlockRange).toHaveBeenCalledTimes(100)
      expect(result.toBlock).toBe(49_999)
      expect(result.caughtUp).toBe(false)
    })

    it('should accumulate counts across every range it sweeps', async () => {
      // Arrange
      setupFirestore({ lastProcessedBlock: -1 })
      getProvider.mockReturnValue(buildMockProvider(600))
      sweepBlockRange
        .mockResolvedValueOnce({ pools: 2, contributions: 3, withdrawals: 1 })
        .mockResolvedValueOnce({ pools: 1, contributions: 0, withdrawals: 4 })

      // Act
      const result = await syncPoolEventsHandler({ fromBlock: 0 })

      // Assert
      expect(result).toMatchObject({ pools: 3, contributions: 3, withdrawals: 5, caughtUp: true })
    })
  })

  describe('sync state', () => {
    it('should persist the cursor after every range, not once at the end', async () => {
      // Arrange
      // A run that dies mid-backfill must keep what it has already indexed.
      const { syncStateRef } = setupFirestore({ lastProcessedBlock: -1 })
      getProvider.mockReturnValue(buildMockProvider(1200))

      // Act
      await syncPoolEventsHandler({ fromBlock: 0 })

      // Assert
      expect(syncStateRef.set).toHaveBeenCalledTimes(3)
      expect(syncStateRef.set).toHaveBeenLastCalledWith(expect.objectContaining({ lastProcessedBlock: 1200 }), { merge: true })
    })

    it('should increment a counter per feed', async () => {
      // Arrange
      const { syncStateRef } = setupFirestore()
      sweepBlockRange.mockResolvedValue({ pools: 1, contributions: 2, withdrawals: 3 })

      // Act
      await syncPoolEventsHandler()

      // Assert
      expect(syncStateRef.set).toHaveBeenCalledWith(
        expect.objectContaining({
          chainId: CHAIN_ID,
          totalPoolsIndexed: expect.anything(),
          totalContributionsIndexed: expect.anything(),
          totalWithdrawalsIndexed: expect.anything(),
        }),
        { merge: true }
      )
    })

    it('should not rewind the stored cursor when re-scanning older blocks', async () => {
      // Arrange
      // A `fromBlock: 0` backfill is idempotent, but letting it move the cursor
      // backwards would make the scheduled sweep redo everything in between.
      const { syncStateRef } = setupFirestore({ lastProcessedBlock: 4900 })

      // Act
      await syncPoolEventsHandler({ fromBlock: 0 })

      // Assert
      const written = syncStateRef.set.mock.calls.map(([data]: [{ lastProcessedBlock: number }]) => data.lastProcessedBlock)
      expect(Math.min(...written)).toBe(4900)
    })

    it('should keep sweeping when the cursor cannot be written', async () => {
      // Arrange
      // The events are indexed either way; a repeated range costs nothing.
      setupFirestore({ lastProcessedBlock: -1, setError: new Error('Firestore unavailable') })
      getProvider.mockReturnValue(buildMockProvider(1200))

      // Act
      const result = await syncPoolEventsHandler({ fromBlock: 0 })

      // Assert
      expect(sweepBlockRange).toHaveBeenCalledTimes(3)
      expect(result.caughtUp).toBe(true)
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to update sync state', expect.objectContaining({ chainId: CHAIN_ID }))
    })
  })

  describe('failures', () => {
    it('should throw when no factory address is configured', async () => {
      // Arrange
      // Without it there is no way to tell a pool of ours from any other
      // contract, so sweeping would index strangers' events.
      jest.resetModules()
      const previous = process.env.POOL_FACTORY_ADDRESS
      delete process.env.POOL_FACTORY_ADDRESS

      // Act & Assert
      try {
        const { syncPoolEventsHandler: handler } = require('./syncPoolEvents')
        await expect(handler()).rejects.toThrow('PoolFactory address not configured')
      } finally {
        process.env.POOL_FACTORY_ADDRESS = previous
      }
    })

    it('should throw when the provider cannot be built', async () => {
      // Arrange
      getProvider.mockImplementation(() => {
        throw new Error('Unsupported chain ID: 31337')
      })

      // Act & Assert
      await expect(syncPoolEventsHandler()).rejects.toThrow('Unsupported chain ID')
    })

    it('should throw when the chain head cannot be read', async () => {
      // Arrange
      getProvider.mockReturnValue({ getBlockNumber: jest.fn().mockRejectedValue(new Error('network timeout')) })

      // Act & Assert
      await expect(syncPoolEventsHandler()).rejects.toThrow('network timeout')
    })

    it('should stop at the failed range and keep the cursor behind it', async () => {
      // Arrange
      // Advancing past blocks that were never read would lose their events for
      // good — nothing revisits them.
      const { syncStateRef } = setupFirestore({ lastProcessedBlock: -1 })
      getProvider.mockReturnValue(buildMockProvider(1200))
      sweepBlockRange.mockResolvedValueOnce({ pools: 1, contributions: 0, withdrawals: 0 }).mockRejectedValueOnce(new Error('RPC down'))

      // Act
      const result = await syncPoolEventsHandler({ fromBlock: 0 })

      // Assert
      expect(sweepBlockRange).toHaveBeenCalledTimes(2)
      expect(result.toBlock).toBe(499)
      expect(result.caughtUp).toBe(false)
      expect(syncStateRef.set).toHaveBeenCalledTimes(1)
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to sweep block range; stopping this run',
        expect.objectContaining({ fromBlock: 500, toBlock: 999 })
      )
    })

    it('should report what it indexed before the failure', async () => {
      // Arrange
      setupFirestore({ lastProcessedBlock: -1 })
      getProvider.mockReturnValue(buildMockProvider(1200))
      sweepBlockRange.mockResolvedValueOnce({ pools: 2, contributions: 1, withdrawals: 0 }).mockRejectedValueOnce(new Error('RPC down'))

      // Act
      const result = await syncPoolEventsHandler({ fromBlock: 0 })

      // Assert
      expect(result).toMatchObject({ pools: 2, contributions: 1, withdrawals: 0 })
    })
  })

  it('should pass the chain and factory through to every sweep', async () => {
    // Arrange
    setupFirestore()

    // Act
    await syncPoolEventsHandler()

    // Assert
    expect(sweepBlockRange).toHaveBeenCalledWith(expect.objectContaining({ chainId: CHAIN_ID, factoryAddress: FACTORY_ADDRESS }))
  })
})
