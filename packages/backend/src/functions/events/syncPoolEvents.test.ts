// The chain registry reads the environment once, at module load, and the
// handler refuses to run without a factory address — so these must be set
// before the first require below. Two chains, because sweeping more than one is
// the behaviour that matters most here.
process.env.POOL_FACTORY_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'
process.env.POOL_FACTORY_ADDRESS_80002 = '0x0Aa731eD9C24B6f8E3d15C97a40Fb2D6E8391B55'
process.env.RPC_URL_80002 = 'https://rpc-amoy.example/'

import { mockLogger } from '../../__tests__/setup'

jest.mock('../../utils/blockchain')
jest.mock('../../services')
jest.mock('../../services/eventSweeper')

const { syncPoolEventsHandler, syncAllChainsHandler, resolveInitialFromBlock } = require('./syncPoolEvents')
const { getProvider } = require('../../utils/blockchain')
const { sweepBlockRange } = require('../../services/eventSweeper')
const { firestore } = require('../../services')

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHAIN_ID = 31337 // DEFAULT_CHAIN_ID
const SECOND_CHAIN_ID = 80002
const SECOND_FACTORY_ADDRESS = '0x0Aa731eD9C24B6f8E3d15C97a40Fb2D6E8391B55'
const FACTORY_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'
const CURRENT_BLOCK = 5000
const LAST_PROCESSED_BLOCK = 4900
const MAX_BLOCK_RANGE = 500

/**
 * Mirrors `CONFIRMATIONS` in the handler. A sweep of a real chain stops this
 * far short of the head, because a log read from a block that is later
 * orphaned is written once and never revisited — the cursor has moved past it.
 * A local chain has no reorgs and is swept to the head.
 */
const CONFIRMATIONS = 128
const SAFE_HEAD = CURRENT_BLOCK - CONFIRMATIONS

const NO_COUNTS = { pools: 0, contributions: 0, withdrawals: 0, statusUpdates: 0 }

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

  const doc = jest.fn().mockReturnValue(syncStateRef)

  firestore.collection.mockReturnValue({ doc })

  return { syncStateRef, doc }
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
        .mockResolvedValueOnce({ pools: 2, contributions: 3, withdrawals: 1, statusUpdates: 1 })
        .mockResolvedValueOnce({ pools: 1, contributions: 0, withdrawals: 4, statusUpdates: 2 })

      // Act
      const result = await syncPoolEventsHandler({ fromBlock: 0 })

      // Assert
      expect(result).toMatchObject({ pools: 3, contributions: 3, withdrawals: 5, statusUpdates: 3, caughtUp: true })
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
      sweepBlockRange.mockResolvedValue({ pools: 1, contributions: 2, withdrawals: 3, statusUpdates: 4 })

      // Act
      await syncPoolEventsHandler()

      // Assert
      expect(syncStateRef.set).toHaveBeenCalledWith(
        expect.objectContaining({
          chainId: CHAIN_ID,
          totalPoolsIndexed: expect.anything(),
          totalContributionsIndexed: expect.anything(),
          totalWithdrawalsIndexed: expect.anything(),
          totalPoolStatusUpdates: expect.anything(),
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
      sweepBlockRange
        .mockResolvedValueOnce({ pools: 1, contributions: 0, withdrawals: 0, statusUpdates: 0 })
        .mockRejectedValueOnce(new Error('RPC down'))

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
      sweepBlockRange
        .mockResolvedValueOnce({ pools: 2, contributions: 1, withdrawals: 0, statusUpdates: 0 })
        .mockRejectedValueOnce(new Error('RPC down'))

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

  // -------------------------------------------------------------------------
  // More than one chain.
  //
  // The backend used to sweep exactly one: `getChainConfig` matched only the
  // configured chain, so localhost and Amoy could not be served at once and the
  // app's network picker was presentational.
  // -------------------------------------------------------------------------

  describe('a named chain', () => {
    it('is swept instead of the default', async () => {
      // A cursor far enough back that there is confirmed work to do: chain
      // 80002 is not local, so the sweep stops `CONFIRMATIONS` short of the
      // head and the default cursor of 4900 is already past that.
      setupFirestore({ lastProcessedBlock: CURRENT_BLOCK - 500 })

      await syncPoolEventsHandler({ chainId: SECOND_CHAIN_ID })

      expect(sweepBlockRange).toHaveBeenCalledWith(
        expect.objectContaining({ chainId: SECOND_CHAIN_ID, factoryAddress: SECOND_FACTORY_ADDRESS })
      )
    })

    it('stops short of the head, leaving the unconfirmed tail alone', async () => {
      setupFirestore({ lastProcessedBlock: CURRENT_BLOCK - 500 })

      const result = await syncPoolEventsHandler({ chainId: SECOND_CHAIN_ID })

      expect(result.toBlock).toBe(SAFE_HEAD)
      expect(result.currentBlock).toBe(CURRENT_BLOCK)
      expect(result.caughtUp).toBe(true)
    })

    it('does nothing when the head has not moved a confirmation depth yet', async () => {
      // The ordinary case on a quiet chain, and the one that must not be
      // mistaken for an error: everything settled has already been read.
      setupFirestore({ lastProcessedBlock: SAFE_HEAD })

      const result = await syncPoolEventsHandler({ chainId: SECOND_CHAIN_ID })

      expect(result).toMatchObject({ caughtUp: true })
      expect(sweepBlockRange).not.toHaveBeenCalled()
    })

    it('keeps its own cursor', async () => {
      // The sync state is keyed by chain id, so two chains cannot advance each
      // other's position — one lagging chain would otherwise skip the other's
      // history wholesale.
      const { doc } = setupFirestore()

      await syncPoolEventsHandler({ chainId: SECOND_CHAIN_ID })

      expect(firestore.collection).toHaveBeenCalledWith('event_sync_state')
      expect(doc).toHaveBeenCalledWith(String(SECOND_CHAIN_ID))
    })

    it('is refused when this backend does not serve it', async () => {
      setupFirestore()

      await expect(syncPoolEventsHandler({ chainId: 999 })).rejects.toThrow('Unsupported chain ID: 999')
      expect(sweepBlockRange).not.toHaveBeenCalled()
    })
  })

  describe('syncAllChainsHandler', () => {
    it('sweeps every configured chain', async () => {
      setupFirestore()

      const results = await syncAllChainsHandler()

      expect(results.map((result: { chainId: number }) => result.chainId).sort()).toEqual([SECOND_CHAIN_ID, CHAIN_ID].sort())
    })

    // An unreachable RPC is the ordinary case on a public testnet. Letting it
    // abort the run would mean a flaky Amoy endpoint silently stopping
    // localhost indexing too.
    it('carries on after one chain fails', async () => {
      setupFirestore()
      getProvider.mockImplementation((chainId: number) => {
        if (chainId === SECOND_CHAIN_ID) throw new Error('amoy unreachable')

        return buildMockProvider()
      })

      const results = await syncAllChainsHandler()

      expect(results.map((result: { chainId: number }) => result.chainId)).toEqual([CHAIN_ID])
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Event sync failed for chain; continuing with the rest',
        expect.objectContaining({ chainId: SECOND_CHAIN_ID })
      )
    })
  })
})
