import { Interface } from 'ethers'
import { mockLogger } from '../__tests__/setup'
import { PoolFactoryABI, SampleLendingPoolABI } from '../constants'

// The three indexers are covered by their own suites; what is under test here
// is how the sweep drives them — ordering, filtering, caching and containment.
jest.mock('./eventIndexer')
jest.mock('./contributionIndexer')
jest.mock('./withdrawalIndexer')

// ethers is deliberately NOT mocked: the sweep routes on topic hashes derived
// from the shipped ABIs, and a stubbed Interface would agree with whatever the
// test invented rather than with the contracts.
const { sweepBlockRange } = require('./eventSweeper')
const { fetchPoolDescription, indexPoolEvent, parsePoolCreatedLog } = require('./eventIndexer')
const { indexContributionEvent, parseFundsDepositedLog, resolvePoolId } = require('./contributionIndexer')
const { indexWithdrawalEvent, parseFundsWithdrawnLog } = require('./withdrawalIndexer')

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHAIN_ID = 31337
const FACTORY_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'
const POOL_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3'
const OTHER_POOL_ADDRESS = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0'
const FROM_BLOCK = 100
const TO_BLOCK = 599
const BLOCK_TIMESTAMP = 1700000000

const POOL_CREATED_TOPIC = new Interface([...PoolFactoryABI]).getEvent('PoolCreated')!.topicHash
const FUNDS_DEPOSITED_TOPIC = new Interface([...SampleLendingPoolABI]).getEvent('FundsDeposited')!.topicHash
const FUNDS_WITHDRAWN_TOPIC = new Interface([...SampleLendingPoolABI]).getEvent('FundsWithdrawn')!.topicHash

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildLog(overrides: Partial<{ blockNumber: number; address: string; index: number; transactionHash: string }> = {}) {
  return {
    blockNumber: overrides.blockNumber ?? 120,
    address: overrides.address ?? POOL_ADDRESS,
    index: overrides.index ?? 0,
    transactionHash: overrides.transactionHash ?? `0x${'a'.repeat(64)}`,
    data: '0x',
    topics: ['0xtopic'],
  }
}

interface ProviderLogs {
  pools?: object[]
  deposits?: object[]
  withdrawals?: object[]
}

/**
 * A provider that answers each `getLogs` by the topic it was asked for, rather
 * than by call order — the sweep is free to reorder its queries, and a test
 * that pinned them to a sequence would pass for the wrong reason.
 */
function buildMockProvider(logs: ProviderLogs = {}, options: { blockTimestamp?: number } = {}) {
  const byTopic: Record<string, object[]> = {
    [POOL_CREATED_TOPIC]: logs.pools ?? [],
    [FUNDS_DEPOSITED_TOPIC]: logs.deposits ?? [],
    [FUNDS_WITHDRAWN_TOPIC]: logs.withdrawals ?? [],
  }

  return {
    getLogs: jest.fn().mockImplementation((filter: { topics: string[] }) => Promise.resolve(byTopic[filter.topics[0]] ?? [])),
    getBlock: jest.fn().mockResolvedValue({ timestamp: options.blockTimestamp ?? BLOCK_TIMESTAMP }),
  }
}

function buildFirestore() {
  return { collection: jest.fn() }
}

function sweep(provider: object, firestore: object = buildFirestore()) {
  return sweepBlockRange({
    provider,
    firestore,
    chainId: CHAIN_ID,
    factoryAddress: FACTORY_ADDRESS,
    fromBlock: FROM_BLOCK,
    toBlock: TO_BLOCK,
  })
}

/** The `getLogs` filter the provider was given for one topic. */
function filterFor(provider: { getLogs: jest.Mock }, topic: string) {
  const call = provider.getLogs.mock.calls.find(([filter]: [{ topics: string[] }]) => filter.topics[0] === topic)

  return call?.[0]
}

beforeEach(() => {
  parsePoolCreatedLog.mockImplementation(() => ({ poolId: 1, description: '' }))
  fetchPoolDescription.mockResolvedValue('a description')
  indexPoolEvent.mockResolvedValue({ poolId: 1, alreadyIndexed: false, stored: true })

  parseFundsDepositedLog.mockImplementation(() => ({ poolAddress: POOL_ADDRESS, contributor: '0xabc', amount: '1' }))
  indexContributionEvent.mockResolvedValue({ id: 'c1', poolId: 1, alreadyIndexed: false, stored: true })

  parseFundsWithdrawnLog.mockImplementation(() => ({ poolAddress: POOL_ADDRESS, member: '0xabc', amount: '1' }))
  indexWithdrawalEvent.mockResolvedValue({ id: 'w1', poolId: 1, alreadyIndexed: false, stored: true })

  resolvePoolId.mockResolvedValue(7)
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sweepBlockRange', () => {
  describe('counting', () => {
    it('should index all three feeds and report how many documents were written', async () => {
      // Arrange
      const provider = buildMockProvider({
        pools: [buildLog(), buildLog({ index: 1 })],
        deposits: [buildLog({ index: 2 })],
        withdrawals: [buildLog({ index: 3 }), buildLog({ index: 4 }), buildLog({ index: 5 })],
      })

      // Act
      const counts = await sweep(provider)

      // Assert
      expect(counts).toEqual({ pools: 2, contributions: 1, withdrawals: 3 })
    })

    it('should return zeroes when the range holds no events', async () => {
      // Arrange
      const provider = buildMockProvider()

      // Act
      const counts = await sweep(provider)

      // Assert
      expect(counts).toEqual({ pools: 0, contributions: 0, withdrawals: 0 })
      expect(indexPoolEvent).not.toHaveBeenCalled()
    })

    it('should not count logs that were already indexed', async () => {
      // Arrange
      // A re-scan is the normal case, not an exception: the sweep overlaps every
      // on-demand index. Counting those as new would report phantom progress.
      const provider = buildMockProvider({ pools: [buildLog()], deposits: [buildLog()], withdrawals: [buildLog()] })
      indexPoolEvent.mockResolvedValue({ poolId: 1, alreadyIndexed: true, stored: false })
      indexContributionEvent.mockResolvedValue({ id: 'c1', poolId: 1, alreadyIndexed: true, stored: false })
      indexWithdrawalEvent.mockResolvedValue({ id: 'w1', poolId: 1, alreadyIndexed: true, stored: false })

      // Act
      const counts = await sweep(provider)

      // Assert
      expect(counts).toEqual({ pools: 0, contributions: 0, withdrawals: 0 })
      expect(indexPoolEvent).toHaveBeenCalledTimes(1)
    })
  })

  describe('log queries', () => {
    it('should query PoolCreated against the factory only', async () => {
      // Arrange
      const provider = buildMockProvider()

      // Act
      await sweep(provider)

      // Assert
      expect(filterFor(provider, POOL_CREATED_TOPIC)).toEqual({
        address: FACTORY_ADDRESS,
        fromBlock: FROM_BLOCK,
        toBlock: TO_BLOCK,
        topics: [POOL_CREATED_TOPIC],
      })
    })

    it.each([
      ['FundsDeposited', FUNDS_DEPOSITED_TOPIC],
      ['FundsWithdrawn', FUNDS_WITHDRAWN_TOPIC],
    ])('should query %s by topic with no address filter', async (_name, topic) => {
      // Arrange
      // These are emitted by each pool contract, and the set of pools is what
      // the sweep is still discovering — an address filter would miss deposits
      // into a pool created in the same range.
      const provider = buildMockProvider()

      // Act
      await sweep(provider)

      // Assert
      expect(filterFor(provider, topic)).toEqual({ fromBlock: FROM_BLOCK, toBlock: TO_BLOCK, topics: [topic] })
    })

    it('should sweep pools before contributions and withdrawals', async () => {
      // Arrange
      // A reader polling mid-sweep must never see a contribution pointing at a
      // pool that is not in Firestore yet.
      const order: string[] = []
      const provider = buildMockProvider({ pools: [buildLog()], deposits: [buildLog()], withdrawals: [buildLog()] })
      indexPoolEvent.mockImplementation(async () => {
        order.push('pool')
        return { poolId: 1, alreadyIndexed: false, stored: true }
      })
      indexContributionEvent.mockImplementation(async () => {
        order.push('contribution')
        return { id: 'c1', poolId: 1, alreadyIndexed: false, stored: true }
      })
      indexWithdrawalEvent.mockImplementation(async () => {
        order.push('withdrawal')
        return { id: 'w1', poolId: 1, alreadyIndexed: false, stored: true }
      })

      // Act
      await sweep(provider)

      // Assert
      expect(order).toEqual(['pool', 'contribution', 'withdrawal'])
    })

    it('should propagate a getLogs failure so the caller can retry the range', async () => {
      // Arrange
      // Swallowing this would advance the sync cursor past blocks that were
      // never read, losing their events permanently.
      const provider = buildMockProvider()
      provider.getLogs.mockRejectedValue(new Error('RPC rate limited'))

      // Act & Assert
      await expect(sweep(provider)).rejects.toThrow('RPC rate limited')
    })
  })

  describe('foreign contracts', () => {
    it.each([
      ['deposits', 'deposits' as const, () => indexContributionEvent],
      ['withdrawals', 'withdrawals' as const, () => indexWithdrawalEvent],
    ])('should skip %s emitted by a contract the factory does not know', async (_name, feed, getIndexer) => {
      // Arrange
      // Anyone can emit an identically-shaped event. Indexing one would attach
      // money movement to a pool it has nothing to do with.
      const provider = buildMockProvider({ [feed]: [buildLog()] })
      resolvePoolId.mockResolvedValue(0)

      // Act
      const counts = await sweep(provider)

      // Assert
      expect(getIndexer()).not.toHaveBeenCalled()
      expect(counts).toEqual({ pools: 0, contributions: 0, withdrawals: 0 })
    })

    it('should skip foreign logs silently rather than as errors', async () => {
      // Arrange
      // A sweep sees other contracts' logs as a matter of course; the on-demand
      // callable raises them because a user asked about that exact transaction.
      const provider = buildMockProvider({ deposits: [buildLog()] })
      resolvePoolId.mockResolvedValue(0)

      // Act
      await sweep(provider)

      // Assert
      expect(mockLogger.error).not.toHaveBeenCalled()
    })
  })

  describe('caching', () => {
    it('should fetch each block only once across all three feeds', async () => {
      // Arrange
      const provider = buildMockProvider({
        pools: [buildLog({ blockNumber: 200 }), buildLog({ blockNumber: 200, index: 1 })],
        deposits: [buildLog({ blockNumber: 200, index: 2 })],
        withdrawals: [buildLog({ blockNumber: 201 })],
      })

      // Act
      await sweep(provider)

      // Assert
      expect(provider.getBlock).toHaveBeenCalledTimes(2)
      expect(provider.getBlock).toHaveBeenCalledWith(200)
      expect(provider.getBlock).toHaveBeenCalledWith(201)
    })

    it('should resolve each pool address only once', async () => {
      // Arrange
      parseFundsDepositedLog
        .mockReturnValueOnce({ poolAddress: POOL_ADDRESS })
        .mockReturnValueOnce({ poolAddress: POOL_ADDRESS })
        .mockReturnValueOnce({ poolAddress: OTHER_POOL_ADDRESS })
      const provider = buildMockProvider({ deposits: [buildLog(), buildLog({ index: 1 }), buildLog({ index: 2 })] })

      // Act
      await sweep(provider)

      // Assert
      expect(resolvePoolId).toHaveBeenCalledTimes(2)
    })

    it('should treat pool addresses case-insensitively when caching', async () => {
      // Arrange
      // The factory returns checksummed addresses and logs carry them lowercased
      // depending on the provider; a case-sensitive cache key would double the
      // RPC calls without being wrong.
      parseFundsDepositedLog
        .mockReturnValueOnce({ poolAddress: POOL_ADDRESS })
        .mockReturnValueOnce({ poolAddress: POOL_ADDRESS.toLowerCase() })
      const provider = buildMockProvider({ deposits: [buildLog(), buildLog({ index: 1 })] })

      // Act
      await sweep(provider)

      // Assert
      expect(resolvePoolId).toHaveBeenCalledTimes(1)
    })
  })

  describe('per-log failures', () => {
    it('should keep sweeping after a log fails to decode', async () => {
      // Arrange
      // One undecodable event must not wedge the sweep forever: the cursor would
      // never pass its block.
      parsePoolCreatedLog.mockImplementationOnce(() => {
        throw new Error('Failed to decode PoolCreated log')
      })
      const provider = buildMockProvider({ pools: [buildLog(), buildLog({ index: 1 })] })

      // Act
      const counts = await sweep(provider)

      // Assert
      expect(counts.pools).toBe(1)
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to sweep PoolCreated log', expect.objectContaining({ chainId: CHAIN_ID }))
    })

    it('should keep sweeping after a block fetch fails', async () => {
      // Arrange
      const provider = buildMockProvider({ deposits: [buildLog({ blockNumber: 300 }), buildLog({ blockNumber: 301 })] })
      provider.getBlock.mockResolvedValueOnce(null)

      // Act
      const counts = await sweep(provider)

      // Assert
      expect(counts.contributions).toBe(1)
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to sweep FundsDeposited log', expect.objectContaining({ chainId: CHAIN_ID }))
    })

    it('should keep sweeping after a withdrawal fails to index', async () => {
      // Arrange
      indexWithdrawalEvent.mockRejectedValueOnce(new Error('Firestore unavailable'))
      const provider = buildMockProvider({ withdrawals: [buildLog(), buildLog({ index: 1 })] })

      // Act
      const counts = await sweep(provider)

      // Assert
      expect(counts.withdrawals).toBe(1)
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to sweep FundsWithdrawn log',
        expect.objectContaining({ error: 'Firestore unavailable' })
      )
    })

    it('should index a pool without its description when the factory read fails', async () => {
      // Arrange
      // `fetchPoolDescription` already degrades to '' internally; this pins that
      // the sweep does not treat a cosmetic miss as a reason to drop the pool.
      fetchPoolDescription.mockResolvedValue('')
      const provider = buildMockProvider({ pools: [buildLog()] })

      // Act
      const counts = await sweep(provider)

      // Assert
      expect(counts.pools).toBe(1)
      expect(indexPoolEvent).toHaveBeenCalledWith(expect.objectContaining({ description: '' }), expect.anything())
    })
  })
})
