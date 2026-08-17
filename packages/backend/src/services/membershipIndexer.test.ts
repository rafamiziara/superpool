import { Interface } from 'ethers'
import { mockLogger } from '../__tests__/setup'
import { LendingPoolABI } from '../constants'

const mockMembership = jest.fn()
const mockGetPoolId = jest.fn()

// Mock ethers BEFORE importing the module: it builds a top-level Interface and
// reads six topic hashes from it at load time.
jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers')
  return {
    ...actual,
    Contract: jest.fn().mockImplementation(() => ({ membership: mockMembership, getPoolId: mockGetPoolId })),
  }
})

/**
 * Notifications are dispatched from `indexMembershipFromLog`, so the sweep
 * notifies as well as the callable. Mocked here to keep this suite about
 * indexing — `poolNotifications.test.ts` covers what it decides to send.
 */
const mockNotifyMembershipRequested = jest.fn()

jest.mock('./poolNotifications', () => ({
  ...jest.requireActual('./poolNotifications'),
  notifyMembershipRequested: (...args: unknown[]) => mockNotifyMembershipRequested(...args),
}))

const {
  fetchMembership,
  indexMembership,
  indexMembershipFromLog,
  indexMembershipsByTxHash,
  membershipDocId,
  parseAccountFromLog,
  MEMBERSHIP_REQUESTED_TOPIC,
  MEMBERSHIP_APPROVED_TOPIC,
  MEMBER_JOINED_TOPIC,
  MEMBERSHIP_TOPICS,
} = require('./membershipIndexer')

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHAIN_ID = 31337
const POOL_ID = 7
const POOL_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3'
const FACTORY_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'
const ACCOUNT = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc'
const TX_HASH = `0x${'a'.repeat(64)}`
const BLOCK_TIME = 1_700_000_000

/** Real topic hashes, so the fixtures agree with the shipped ABI rather than with the test. */
const REAL_REQUESTED_TOPIC = new Interface([...LendingPoolABI]).getEvent('MembershipRequested')!.topicHash

// The contract enum, by ordinal.
const NONE = 0
const REQUESTED = 1
const ACTIVE = 2
const REMOVED = 4

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildLog(overrides: Partial<{ topic: string; account: string; address: string; blockNumber: number }> = {}) {
  const { topic = MEMBERSHIP_REQUESTED_TOPIC, account = ACCOUNT, address = POOL_ADDRESS, blockNumber = 120 } = overrides

  return {
    address,
    blockNumber,
    transactionHash: TX_HASH,
    index: 0,
    // The only parameter is indexed, so `data` is empty and the address is topic 1.
    data: '0x',
    topics: [topic, `0x${'0'.repeat(24)}${account.slice(2)}`],
  }
}

function buildFirestore(options: { exists?: boolean; storedStatus?: string } = {}) {
  const { exists = false, storedStatus = 'active' } = options
  const mockSet = jest.fn().mockResolvedValue(undefined)
  const mockDocRef = {
    get: jest.fn().mockResolvedValue({ exists, data: () => (exists ? { status: storedStatus } : null) }),
    set: mockSet,
  }
  const mockDoc = jest.fn().mockReturnValue(mockDocRef)
  const mockCollection = jest.fn().mockReturnValue({ doc: mockDoc })

  return { mockFs: { collection: mockCollection }, mockDocRef, mockDoc, mockCollection }
}

function buildProvider(receipt: object | null = null) {
  return {
    getTransactionReceipt: jest.fn().mockResolvedValue(receipt),
    getBlock: jest.fn().mockResolvedValue({ timestamp: BLOCK_TIME }),
  }
}

const parsedMembership = {
  poolId: POOL_ID,
  poolAddress: POOL_ADDRESS,
  account: ACCOUNT.toLowerCase(),
  status: 'active' as const,
  joinedAt: new Date(BLOCK_TIME * 1000),
  chainId: CHAIN_ID,
  transactionHash: TX_HASH,
  blockNumber: 120,
}

beforeEach(() => {
  mockMembership.mockResolvedValue(BigInt(ACTIVE))
  mockGetPoolId.mockResolvedValue(BigInt(POOL_ID))
  mockNotifyMembershipRequested.mockReset()
  mockNotifyMembershipRequested.mockResolvedValue(undefined)
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('topic hashes', () => {
  it('should come from the shipped ABI', () => {
    // A hand-written hash would make every routing test agree with itself.
    expect(MEMBERSHIP_REQUESTED_TOPIC).toBe(REAL_REQUESTED_TOPIC)
    expect(MEMBERSHIP_APPROVED_TOPIC).not.toBe(MEMBERSHIP_REQUESTED_TOPIC)
  })

  it('should cover all six membership events', () => {
    // A missing topic is invisible: the sweep simply never sees that event, and
    // the register silently stops tracking one kind of change.
    expect(new Set(MEMBERSHIP_TOPICS).size).toBe(6)
  })
})

describe('membershipDocId', () => {
  it('should key on the pool as well as the address', () => {
    // The same wallet belongs to several pools independently.
    expect(membershipDocId(CHAIN_ID, 7, ACCOUNT)).toBe(`31337-7-${ACCOUNT.toLowerCase()}`)
    expect(membershipDocId(CHAIN_ID, 8, ACCOUNT)).not.toBe(membershipDocId(CHAIN_ID, 7, ACCOUNT))
  })

  it('should lowercase the address however the caller cased it', () => {
    expect(membershipDocId(CHAIN_ID, 7, ACCOUNT.toUpperCase().replace('0X', '0x'))).toBe(membershipDocId(CHAIN_ID, 7, ACCOUNT))
  })
})

describe('parseAccountFromLog', () => {
  it('should read the address out of topic 1', () => {
    expect(parseAccountFromLog(buildLog())).toBe(ACCOUNT.toLowerCase())
  })

  it('should read it identically from every event', () => {
    // All six declare one indexed address, which is what lets one path serve them.
    expect(parseAccountFromLog(buildLog({ topic: MEMBER_JOINED_TOPIC }))).toBe(ACCOUNT.toLowerCase())
  })
})

describe('fetchMembership', () => {
  it('should return the chain state, not the log', async () => {
    mockMembership.mockResolvedValue(BigInt(REQUESTED))

    expect(await fetchMembership(ACCOUNT, POOL_ADDRESS, {})).toBe('requested')
    expect(mockMembership).toHaveBeenCalledWith(ACCOUNT)
  })

  it('should read the enum zero as none', async () => {
    // Unlike LoanStatus, zero here means what it says.
    mockMembership.mockResolvedValue(BigInt(NONE))

    expect(await fetchMembership(ACCOUNT, POOL_ADDRESS, {})).toBe('none')
  })

  it('should throw on an ordinal this build does not know', async () => {
    // Reading it as `none` would quietly drop somebody out of their pool.
    mockMembership.mockResolvedValue(99n)

    await expect(fetchMembership(ACCOUNT, POOL_ADDRESS, {})).rejects.toThrow('Unknown Membership ordinal')
  })
})

describe('indexMembership', () => {
  it('should write a membership that has never been indexed', async () => {
    const { mockFs, mockDocRef, mockDoc } = buildFirestore({ exists: false })

    const result = await indexMembership(parsedMembership, mockFs)

    expect(mockDoc).toHaveBeenCalledWith(`31337-7-${ACCOUNT.toLowerCase()}`)
    expect(mockDocRef.set).toHaveBeenCalledWith(expect.objectContaining({ account: ACCOUNT.toLowerCase(), status: 'active' }), {
      merge: true,
    })
    expect(result).toMatchObject({ alreadyIndexed: false, stored: true })
  })

  it('should stamp joinedAt when creating the record', async () => {
    const { mockFs, mockDocRef } = buildFirestore({ exists: false })

    await indexMembership(parsedMembership, mockFs)

    expect(mockDocRef.set).toHaveBeenCalledWith(expect.objectContaining({ joinedAt: parsedMembership.joinedAt }), { merge: true })
  })

  it('should not restamp joinedAt when the standing changes', async () => {
    // A removal must not read as if they joined the day they were thrown out.
    const { mockFs, mockDocRef } = buildFirestore({ exists: true, storedStatus: 'active' })

    await indexMembership({ ...parsedMembership, status: 'removed' }, mockFs)

    expect(mockDocRef.set).toHaveBeenCalledWith(expect.not.objectContaining({ joinedAt: expect.anything() }), { merge: true })
  })

  it('should rewrite the record when the standing changed', async () => {
    const { mockFs, mockDocRef } = buildFirestore({ exists: true, storedStatus: 'requested' })

    const result = await indexMembership(parsedMembership, mockFs)

    expect(mockDocRef.set).toHaveBeenCalled()
    expect(result).toMatchObject({ alreadyIndexed: false, stored: true })
  })

  it('should do nothing when the stored record already matches the chain', async () => {
    // What keeps a re-scan of settled history free.
    const { mockFs, mockDocRef } = buildFirestore({ exists: true, storedStatus: 'active' })

    const result = await indexMembership(parsedMembership, mockFs)

    expect(mockDocRef.set).not.toHaveBeenCalled()
    expect(result).toMatchObject({ alreadyIndexed: true, stored: false })
  })
})

describe('indexMembershipFromLog', () => {
  it('should resolve a log all the way to a stored record', async () => {
    const { mockFs } = buildFirestore({ exists: false })

    const indexed = await indexMembershipFromLog(buildLog(), CHAIN_ID, FACTORY_ADDRESS, buildProvider(), mockFs)

    expect(indexed).not.toBeNull()
    expect(indexed.membership).toMatchObject({ poolId: POOL_ID, account: ACCOUNT.toLowerCase(), status: 'active' })
  })

  it('should report the chain state rather than the event that arrived', async () => {
    // A request swept after its approval must still read as active.
    const { mockFs } = buildFirestore({ exists: false })
    mockMembership.mockResolvedValue(BigInt(REMOVED))

    const indexed = await indexMembershipFromLog(
      buildLog({ topic: MEMBERSHIP_APPROVED_TOPIC }),
      CHAIN_ID,
      FACTORY_ADDRESS,
      buildProvider(),
      mockFs
    )

    expect(indexed.membership.status).toBe('removed')
  })

  it('should skip a contract the factory does not know', async () => {
    // Anyone can emit an identically-shaped event; indexing one would put a
    // stranger's pool in a user's list.
    const { mockFs } = buildFirestore({ exists: false })
    mockGetPoolId.mockResolvedValue(0n)

    expect(await indexMembershipFromLog(buildLog(), CHAIN_ID, FACTORY_ADDRESS, buildProvider(), mockFs)).toBeNull()
  })
})

describe('indexMembershipsByTxHash', () => {
  it('should index every membership event in the transaction', async () => {
    const { mockFs } = buildFirestore({ exists: false })
    const receipt = { status: 1, logs: [buildLog(), buildLog({ topic: MEMBER_JOINED_TOPIC, account: FACTORY_ADDRESS })] }

    const { members, results } = await indexMembershipsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, buildProvider(receipt), mockFs)

    expect(members).toHaveLength(2)
    expect(results).toHaveLength(2)
  })

  it('should ignore logs that are not membership events', async () => {
    const { mockFs } = buildFirestore({ exists: false })
    const receipt = { status: 1, logs: [{ ...buildLog(), topics: [`0x${'f'.repeat(64)}`] }, buildLog()] }

    const { members } = await indexMembershipsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, buildProvider(receipt), mockFs)

    expect(members).toHaveLength(1)
  })

  it('should reject a transaction with no membership event', async () => {
    const { mockFs } = buildFirestore({ exists: false })
    const receipt = { status: 1, logs: [] }

    await expect(indexMembershipsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, buildProvider(receipt), mockFs)).rejects.toThrow(
      'No membership event found'
    )
  })

  it('should reject a reverted transaction', async () => {
    const { mockFs } = buildFirestore({ exists: false })

    await expect(
      indexMembershipsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, buildProvider({ status: 0, logs: [buildLog()] }), mockFs)
    ).rejects.toThrow('reverted')
  })

  it('should reject a missing receipt', async () => {
    const { mockFs } = buildFirestore({ exists: false })

    await expect(indexMembershipsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, buildProvider(null), mockFs)).rejects.toThrow(
      'receipt not found'
    )
  })
})

// ---------------------------------------------------------------------------
// Transitions.
//
// What the notification service triggers on, and deliberately not `stored`:
// a write is a bookkeeping fact, a transition is the news. Getting this wrong
// produces visibly wrong notifications rather than none.
// ---------------------------------------------------------------------------

describe('indexMembership transitions', () => {
  it('reports a request from an address with no record', async () => {
    mockMembership.mockResolvedValue(BigInt(REQUESTED))
    const { mockFs } = buildFirestore({ exists: false })

    const result = await indexMembership({ ...parsedMembership, status: 'requested' }, mockFs)

    expect(result.transition).toBe('requested')
  })

  it('reports nothing when a deposit enrolled somebody automatically', async () => {
    // `MemberJoined` on an open pool: absent → active, with nobody deciding
    // anything. An owner notified about this would be told about a member they
    // never had the chance to admit or refuse.
    const { mockFs } = buildFirestore({ exists: false })

    const result = await indexMembership({ ...parsedMembership, status: 'active' }, mockFs)

    expect(result.transition).toBeNull()
  })

  it('reports the owner admitting an applicant', async () => {
    const { mockFs } = buildFirestore({ exists: true, storedStatus: 'requested' })

    const result = await indexMembership({ ...parsedMembership, status: 'active' }, mockFs)

    expect(result.transition).toBe('active')
  })

  it('reports the owner turning an applicant down', async () => {
    const { mockFs } = buildFirestore({ exists: true, storedStatus: 'requested' })

    const result = await indexMembership({ ...parsedMembership, status: 'rejected' }, mockFs)

    expect(result.transition).toBe('rejected')
  })

  it('reports a removal', async () => {
    const { mockFs } = buildFirestore({ exists: true, storedStatus: 'active' })

    const result = await indexMembership({ ...parsedMembership, status: 'removed' }, mockFs)

    expect(result.transition).toBe('removed')
  })

  it('reports nothing when the standing is unchanged', async () => {
    // The re-scan case. This is the one that must stay silent however many
    // times the sweep passes over the same block.
    const { mockFs } = buildFirestore({ exists: true, storedStatus: 'active' })

    const result = await indexMembership({ ...parsedMembership, status: 'active' }, mockFs)

    expect(result).toMatchObject({ alreadyIndexed: true, stored: false, transition: null })
  })

  it('reports nothing for an address arriving at none', async () => {
    // The contract's zero value for somebody nobody has heard of. Arriving at
    // it is not something that happened to anyone.
    const { mockFs } = buildFirestore({ exists: true, storedStatus: 'active' })

    const result = await indexMembership({ ...parsedMembership, status: 'none' }, mockFs)

    expect(result.transition).toBeNull()
  })

  it('treats a stored none as no record at all', async () => {
    const { mockFs } = buildFirestore({ exists: true, storedStatus: 'none' })

    const result = await indexMembership({ ...parsedMembership, status: 'requested' }, mockFs)

    expect(result.transition).toBe('requested')
  })
})

// ---------------------------------------------------------------------------
// Notification dispatch.
//
// Wired into `indexMembershipFromLog` rather than into the callable, so a
// request made while the app was closed — which only the sweep will see — still
// reaches the owner.
// ---------------------------------------------------------------------------

describe('indexMembershipFromLog notifications', () => {
  it('offers every indexed membership to the notification service', async () => {
    mockMembership.mockResolvedValue(BigInt(REQUESTED))
    const { mockFs } = buildFirestore({ exists: false })

    await indexMembershipFromLog(buildLog(), CHAIN_ID, FACTORY_ADDRESS, buildProvider(), mockFs)

    expect(mockNotifyMembershipRequested).toHaveBeenCalledWith(
      expect.objectContaining({ transition: 'requested' }),
      expect.objectContaining({ account: ACCOUNT.toLowerCase() }),
      mockFs
    )
  })

  it('indexes the membership even when the notification fails', async () => {
    // Indexing is the job; push is an enhancement.
    mockNotifyMembershipRequested.mockRejectedValue(new Error('expo unreachable'))
    const { mockFs, mockDocRef } = buildFirestore({ exists: false })

    const indexed = await indexMembershipFromLog(buildLog(), CHAIN_ID, FACTORY_ADDRESS, buildProvider(), mockFs)

    expect(indexed).not.toBeNull()
    expect(indexed!.result.stored).toBe(true)
    expect(mockDocRef.set).toHaveBeenCalled()
    expect(mockLogger.error).toHaveBeenCalled()
  })

  it('logs a notification failure that was not thrown as an Error', async () => {
    mockNotifyMembershipRequested.mockRejectedValue('expo unreachable')
    const { mockFs } = buildFirestore({ exists: false })

    const indexed = await indexMembershipFromLog(buildLog(), CHAIN_ID, FACTORY_ADDRESS, buildProvider(), mockFs)

    expect(indexed!.result.stored).toBe(true)
    expect(mockLogger.error).toHaveBeenCalled()
  })

  it('does not reach the notification service for a contract the factory disowns', async () => {
    mockGetPoolId.mockResolvedValue(BigInt(0))
    const { mockFs } = buildFirestore({ exists: false })

    await expect(indexMembershipFromLog(buildLog(), CHAIN_ID, FACTORY_ADDRESS, buildProvider(), mockFs)).resolves.toBeNull()
    expect(mockNotifyMembershipRequested).not.toHaveBeenCalled()
  })
})

describe('indexMembershipsByTxHash guards', () => {
  it('should reject a membership from a pool this factory did not deploy', async () => {
    // Anyone can emit an identically-shaped event; indexing one would put a
    // stranger's pool in a user's register.
    mockGetPoolId.mockResolvedValue(BigInt(0))
    const { mockFs } = buildFirestore({ exists: false })
    const provider = buildProvider({ status: 1, logs: [buildLog()] })

    await expect(indexMembershipsByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, provider, mockFs)).rejects.toMatchObject({
      code: 'not-found',
    })
  })
})
