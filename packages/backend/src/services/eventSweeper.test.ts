import { Interface } from 'ethers'
import { mockLogger } from '../__tests__/setup'
import { PoolFactoryABI, SampleLendingPoolABI } from '../constants'

// The three indexers are covered by their own suites; what is under test here
// is how the sweep drives them — ordering, filtering, caching and containment.
jest.mock('./eventIndexer')
jest.mock('./contributionIndexer')
jest.mock('./withdrawalIndexer')
jest.mock('./loanIndexer', () => {
  // The topics are real: the sweep routes on them, and stubbing them would let
  // the test agree with itself rather than with the shipped ABI.
  const actual = jest.requireActual('./loanIndexer')
  return { ...actual, indexLoanFromLog: jest.fn() }
})

// ethers is deliberately NOT mocked: the sweep routes on topic hashes derived
// from the shipped ABIs, and a stubbed Interface would agree with whatever the
// test invented rather than with the contracts.
const { sweepBlockRange } = require('./eventSweeper')
const { fetchPoolActive, fetchPoolDescription, indexPoolEvent, parsePoolCreatedLog, updatePoolActive } = require('./eventIndexer')
const { indexContributionEvent, parseFundsDepositedLog, resolvePoolId } = require('./contributionIndexer')
const { indexWithdrawalEvent, parseFundsWithdrawnLog } = require('./withdrawalIndexer')
const { indexLoanFromLog, LOAN_CREATED_TOPIC, LOAN_REPAID_TOPIC, LOAN_TOPICS } = require('./loanIndexer')

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
const POOL_DEACTIVATED_TOPIC = new Interface([...PoolFactoryABI]).getEvent('PoolDeactivated')!.topicHash
const POOL_REACTIVATED_TOPIC = new Interface([...PoolFactoryABI]).getEvent('PoolReactivated')!.topicHash

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

/**
 * A `PoolDeactivated` / `PoolReactivated` log. `poolId` is the first indexed
 * parameter of both, so it lives in topic 1 and the sweep reads it from there.
 */
function buildStatusLog(poolId: number, topic: string = POOL_DEACTIVATED_TOPIC, blockNumber = 120) {
  return {
    ...buildLog({ blockNumber, address: FACTORY_ADDRESS }),
    topics: [topic, `0x${poolId.toString(16).padStart(64, '0')}`],
  }
}

interface ProviderLogs {
  pools?: object[]
  deposits?: object[]
  withdrawals?: object[]
  status?: object[]
  loans?: object[]
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
    // `topics[0]` is an array for the status query — a topic-OR — so it is
    // matched by shape rather than by key.
    getLogs: jest.fn().mockImplementation((filter: { topics: (string | string[])[] }) => {
      const topic = filter.topics[0]

      // Two topic-OR queries now — pool status and loans — told apart by which
      // topics they ask for rather than by call order.
      if (Array.isArray(topic)) {
        return Promise.resolve(topic.includes(LOAN_CREATED_TOPIC) ? (logs.loans ?? []) : (logs.status ?? []))
      }

      return Promise.resolve(byTopic[topic as string] ?? [])
    }),
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

  fetchPoolActive.mockResolvedValue(false)
  updatePoolActive.mockResolvedValue(true)

  indexLoanFromLog.mockResolvedValue({ loan: { loanId: 1, poolId: 7 }, result: { stored: true } })

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
      expect(counts).toEqual({ pools: 2, contributions: 1, withdrawals: 3, loans: 0, memberships: 0, statusUpdates: 0 })
    })

    it('should return zeroes when the range holds no events', async () => {
      // Arrange
      const provider = buildMockProvider()

      // Act
      const counts = await sweep(provider)

      // Assert
      expect(counts).toEqual({ pools: 0, contributions: 0, withdrawals: 0, loans: 0, memberships: 0, statusUpdates: 0 })
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
      expect(counts).toEqual({ pools: 0, contributions: 0, withdrawals: 0, loans: 0, memberships: 0, statusUpdates: 0 })
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
      expect(counts).toEqual({ pools: 0, contributions: 0, withdrawals: 0, loans: 0, memberships: 0, statusUpdates: 0 })
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

  describe('pool status', () => {
    it('should correct a pool whose stored flag disagrees with the chain', async () => {
      // Arrange
      // Nothing else ever touches `isActive` after a pool is first indexed, so
      // without this a pool deactivated on chain is listed forever.
      const provider = buildMockProvider({ status: [buildStatusLog(7)] })

      // Act
      const counts = await sweep(provider)

      // Assert
      expect(counts.statusUpdates).toBe(1)
      expect(updatePoolActive).toHaveBeenCalledWith(7, CHAIN_ID, false, expect.anything())
    })

    it('should read the flag from the factory rather than infer it from the event', async () => {
      // Arrange
      // `PoolDeactivated` carries no state. Asking the chain makes the result
      // independent of the order the logs are processed in.
      fetchPoolActive.mockResolvedValue(true)
      const provider = buildMockProvider({ status: [buildStatusLog(7, POOL_DEACTIVATED_TOPIC)] })

      // Act
      await sweep(provider)

      // Assert
      expect(fetchPoolActive).toHaveBeenCalledWith(7, FACTORY_ADDRESS, provider)
      expect(updatePoolActive).toHaveBeenCalledWith(7, CHAIN_ID, true, expect.anything())
    })

    it('should look a pool up once however many times it toggled', async () => {
      // Arrange
      // The end state is the same whichever order the toggles came in, so the
      // pool only needs asking about once.
      const provider = buildMockProvider({
        status: [
          buildStatusLog(7, POOL_DEACTIVATED_TOPIC, 120),
          buildStatusLog(7, POOL_REACTIVATED_TOPIC, 121),
          buildStatusLog(7, POOL_DEACTIVATED_TOPIC, 122),
        ],
      })

      // Act
      const counts = await sweep(provider)

      // Assert
      expect(fetchPoolActive).toHaveBeenCalledTimes(1)
      expect(counts.statusUpdates).toBe(1)
    })

    it('should handle several pools changing in one range', async () => {
      // Arrange
      const provider = buildMockProvider({ status: [buildStatusLog(7), buildStatusLog(9), buildStatusLog(11)] })

      // Act
      const counts = await sweep(provider)

      // Assert
      expect(counts.statusUpdates).toBe(3)
      expect(fetchPoolActive.mock.calls.map((call: [number]) => call[0])).toEqual([7, 9, 11])
    })

    it('should count only the pools whose stored flag actually changed', async () => {
      // Arrange
      // Re-scanning settled history must report no work, the same guarantee
      // `create()` gives the other feeds.
      updatePoolActive.mockResolvedValue(false)
      const provider = buildMockProvider({ status: [buildStatusLog(7)] })

      // Act
      const counts = await sweep(provider)

      // Assert
      expect(counts.statusUpdates).toBe(0)
    })

    it('should fetch both status events in one query against the factory', async () => {
      // Arrange
      const provider = buildMockProvider()

      // Act
      await sweep(provider)

      // Assert
      const call = provider.getLogs.mock.calls.find(([f]: [{ topics: unknown[] }]) => Array.isArray(f.topics[0]))
      expect(call?.[0]).toEqual({
        address: FACTORY_ADDRESS,
        fromBlock: FROM_BLOCK,
        toBlock: TO_BLOCK,
        topics: [[POOL_DEACTIVATED_TOPIC, POOL_REACTIVATED_TOPIC]],
      })
    })

    it('should keep sweeping after one pool status update fails', async () => {
      // Arrange
      updatePoolActive.mockRejectedValueOnce(new Error('Firestore unavailable'))
      const provider = buildMockProvider({ status: [buildStatusLog(7), buildStatusLog(9)] })

      // Act
      const counts = await sweep(provider)

      // Assert
      expect(counts.statusUpdates).toBe(1)
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to sweep pool status change',
        expect.objectContaining({ poolId: 7, error: 'Firestore unavailable' })
      )
    })

    it('should index a pool before reconciling its status', async () => {
      // Arrange
      // A pool created and deactivated inside one range must exist in Firestore
      // before the flag is applied, or the update finds nothing to correct.
      const order: string[] = []
      indexPoolEvent.mockImplementation(async () => {
        order.push('create')
        return { poolId: 7, alreadyIndexed: false, stored: true }
      })
      updatePoolActive.mockImplementation(async () => {
        order.push('status')
        return true
      })
      const provider = buildMockProvider({ pools: [buildLog()], status: [buildStatusLog(7)] })

      // Act
      await sweep(provider)

      // Assert
      expect(order).toEqual(['create', 'status'])
    })
  })
  describe('loans', () => {
    it('should index every loan log in the range', async () => {
      // Arrange
      const provider = buildMockProvider({ loans: [buildLog(), buildLog({ index: 1 })] })

      // Act
      const counts = await sweep(provider)

      // Assert
      expect(counts.loans).toBe(2)
      expect(indexLoanFromLog).toHaveBeenCalledTimes(2)
    })

    it('should fetch borrows and repayments in one query, with no address filter', async () => {
      // Arrange
      // Emitted by each pool contract, so there is no single address; the
      // indexer proves the emitter is ours.
      const provider = buildMockProvider()

      // Act
      await sweep(provider)

      // Assert
      const call = provider.getLogs.mock.calls.find(
        ([f]: [{ topics: unknown[] }]) => Array.isArray(f.topics[0]) && (f.topics[0] as string[]).includes(LOAN_CREATED_TOPIC)
      )
      expect(call?.[0]).toEqual({
        fromBlock: FROM_BLOCK,
        toBlock: TO_BLOCK,
        // All five loan events, since every one of them takes the same path.
        topics: [[...LOAN_TOPICS]],
      })
    })

    it('should take the same path for a borrow and a repayment', async () => {
      // Arrange
      // The record written is the loan's state afterwards either way, so
      // nothing in the sweep needs to know which event it is looking at.
      const provider = buildMockProvider({
        loans: [
          { ...buildLog(), topics: [LOAN_CREATED_TOPIC, '0x01'] },
          { ...buildLog({ index: 1 }), topics: [LOAN_REPAID_TOPIC, '0x01'] },
        ],
      })

      // Act
      const counts = await sweep(provider)

      // Assert
      expect(counts.loans).toBe(2)
    })

    it('should skip a loan from a contract the factory does not know', async () => {
      // Arrange
      // `indexLoanFromLog` returns null for one, the same silent skip deposits get.
      indexLoanFromLog.mockResolvedValue(null)
      const provider = buildMockProvider({ loans: [buildLog()] })

      // Act
      const counts = await sweep(provider)

      // Assert
      expect(counts.loans).toBe(0)
      expect(mockLogger.error).not.toHaveBeenCalled()
    })

    it('should not count a loan whose record was already current', async () => {
      // Arrange
      // A sweep re-reads the `LoanCreated` log on every pass, long after the
      // loan was repaid; counting that would report phantom work forever.
      indexLoanFromLog.mockResolvedValue({ loan: { loanId: 1 }, result: { stored: false } })
      const provider = buildMockProvider({ loans: [buildLog()] })

      // Act
      const counts = await sweep(provider)

      // Assert
      expect(counts.loans).toBe(0)
    })

    it('should keep sweeping after one loan fails', async () => {
      // Arrange
      indexLoanFromLog.mockRejectedValueOnce(new Error('getLoan reverted'))
      const provider = buildMockProvider({ loans: [buildLog(), buildLog({ index: 1 })] })

      // Act
      const counts = await sweep(provider)

      // Assert
      expect(counts.loans).toBe(1)
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to sweep loan log', expect.objectContaining({ error: 'getLoan reverted' }))
    })
  })
})
