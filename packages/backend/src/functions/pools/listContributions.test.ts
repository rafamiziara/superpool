import { ContributionInfo } from '@superpool/types'
import { mockLogger } from '../../__tests__/setup'

/**
 * A contribution as Firestore stores it, which is not what the callable
 * returns: `contributedAt` is a Timestamp there and an ISO string on the wire,
 * and `id` is the document key rather than a field.
 */
type StoredContribution = Omit<ContributionInfo, 'contributedAt' | 'id'> & { id: string; contributedAt: Date }

const { firestore } = require('../../services')
const { listContributionsHandler } = require('./listContributions')

const CHAIN_ID = 31337 // matches ACTIVE_CHAIN_CONFIG default
const CONTRIBUTOR = '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc'

describe('listContributionsHandler', () => {
  const mockContributions: StoredContribution[] = [
    {
      id: `${CHAIN_ID}-0xaaa-0`,
      poolId: 1,
      poolAddress: '0xPoolAddress1',
      contributor: CONTRIBUTOR,
      amount: '1000000000000000000',
      chainId: CHAIN_ID,
      transactionHash: '0xaaa',
      logIndex: 0,
      blockNumber: 100,
      contributedAt: new Date('2026-08-01T00:00:00.000Z'),
    },
    {
      id: `${CHAIN_ID}-0xbbb-0`,
      poolId: 2,
      poolAddress: '0xPoolAddress2',
      contributor: '0xanotherwallet',
      amount: '5000000000000000000',
      chainId: CHAIN_ID,
      transactionHash: '0xbbb',
      logIndex: 0,
      blockNumber: 101,
      contributedAt: new Date('2026-08-02T00:00:00.000Z'),
    },
  ]

  const createMockQuery = (docs: StoredContribution[], totalCount: number) => {
    const mockDocs = docs.map((contribution) => ({
      id: contribution.id,
      data: () => ({
        ...contribution,
        contributedAt: { toDate: () => contribution.contributedAt },
      }),
    }))

    return {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ docs: mockDocs }),
      count: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({ data: () => ({ count: totalCount }) }),
      }),
    }
  }

  function buildRequest(
    overrides: Partial<{
      auth: object | null
      data: Record<string, unknown>
    }> = {}
  ) {
    return {
      auth: overrides.auth !== undefined ? overrides.auth : { uid: 'user-123', token: {} },
      data: overrides.data !== undefined ? overrides.data : {},
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // Authentication
  // -------------------------------------------------------------------------

  it('should throw unauthenticated when the request has no auth', async () => {
    // Act & Assert
    await expect(listContributionsHandler(buildRequest({ auth: null }))).rejects.toHaveProperty('code', 'unauthenticated')
  })

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it('should list contributions for the default chain', async () => {
    // Arrange
    const query = createMockQuery(mockContributions, 2)
    firestore.collection.mockReturnValue(query)

    // Act
    const result = await listContributionsHandler(buildRequest())

    // Assert
    expect(firestore.collection).toHaveBeenCalledWith('contributions')
    expect(query.where).toHaveBeenCalledWith('chainId', '==', CHAIN_ID)
    expect(result.contributions).toHaveLength(2)
    expect(result.totalCount).toBe(2)
  })

  it('should use the document id as the contribution id', async () => {
    // Arrange
    const query = createMockQuery(mockContributions, 2)
    firestore.collection.mockReturnValue(query)

    // Act
    const result = await listContributionsHandler(buildRequest())

    // Assert
    expect(result.contributions[0].id).toBe(`${CHAIN_ID}-0xaaa-0`)
  })

  it('should return contributedAt as an ISO string, never a Date', async () => {
    // Arrange — a Date has no enumerable keys, so the callable encoder would
    // serialise it to `{}` on the wire.
    const query = createMockQuery(mockContributions, 2)
    firestore.collection.mockReturnValue(query)

    // Act
    const result = await listContributionsHandler(buildRequest())

    // Assert
    expect(result.contributions[0].contributedAt).toBe('2026-08-01T00:00:00.000Z')
  })

  it('should order by contributedAt descending, newest first', async () => {
    // Arrange
    const query = createMockQuery(mockContributions, 2)
    firestore.collection.mockReturnValue(query)

    // Act
    await listContributionsHandler(buildRequest())

    // Assert
    expect(query.orderBy).toHaveBeenCalledWith('contributedAt', 'desc')
  })

  // -------------------------------------------------------------------------
  // Filters
  // -------------------------------------------------------------------------

  it('should filter by poolId when one is given', async () => {
    // Arrange
    const query = createMockQuery([mockContributions[0]], 1)
    firestore.collection.mockReturnValue(query)

    // Act
    await listContributionsHandler(buildRequest({ data: { poolId: 1 } }))

    // Assert
    expect(query.where).toHaveBeenCalledWith('poolId', '==', 1)
  })

  it('should filter by poolId 0 rather than treating it as absent', async () => {
    // Arrange — a falsy check here would drop the filter. Pool ids start at 1,
    // so this should return nothing rather than everything.
    const query = createMockQuery([], 0)
    firestore.collection.mockReturnValue(query)

    // Act
    await listContributionsHandler(buildRequest({ data: { poolId: 0 } }))

    // Assert
    expect(query.where).toHaveBeenCalledWith('poolId', '==', 0)
  })

  it('should lowercase the contributor filter, since the indexer stores it lowercased', async () => {
    // Arrange — wallets report addresses checksummed; a verbatim filter matches nothing.
    const query = createMockQuery([mockContributions[0]], 1)
    firestore.collection.mockReturnValue(query)

    // Act
    await listContributionsHandler(buildRequest({ data: { contributor: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc' } }))

    // Assert
    expect(query.where).toHaveBeenCalledWith('contributor', '==', CONTRIBUTOR)
  })

  it('should not add a contributor filter when none is given', async () => {
    // Arrange
    const query = createMockQuery(mockContributions, 2)
    firestore.collection.mockReturnValue(query)

    // Act
    await listContributionsHandler(buildRequest())

    // Assert
    expect(query.where).not.toHaveBeenCalledWith('contributor', '==', expect.anything())
  })

  // -------------------------------------------------------------------------
  // Limits
  // -------------------------------------------------------------------------

  it('should default to a limit of 50', async () => {
    // Arrange
    const query = createMockQuery(mockContributions, 2)
    firestore.collection.mockReturnValue(query)

    // Act
    const result = await listContributionsHandler(buildRequest())

    // Assert
    expect(query.limit).toHaveBeenCalledWith(50)
    expect(result.limit).toBe(50)
  })

  it('should cap the limit at 100, matching the Firestore rules', async () => {
    // Arrange — the rules reject a `list` with a larger limit outright.
    const query = createMockQuery(mockContributions, 2)
    firestore.collection.mockReturnValue(query)

    // Act
    await listContributionsHandler(buildRequest({ data: { limit: 5000 } }))

    // Assert
    expect(query.limit).toHaveBeenCalledWith(100)
  })

  it('should refuse a negative limit rather than reinterpret it', async () => {
    // Arrange — it used to be floored at 1, which answered a request nobody
    // made. A page of minus three rows is a mistake, and saying so is the
    // whole point of validating the payload.
    const query = createMockQuery([], 0)
    firestore.collection.mockReturnValue(query)

    // Act & Assert
    await expect(listContributionsHandler(buildRequest({ data: { limit: -3 } }))).rejects.toThrow(/limit/i)
    expect(query.limit).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Failures
  // -------------------------------------------------------------------------

  it('should convert a query failure into an internal error', async () => {
    // Arrange
    firestore.collection.mockImplementation(() => {
      throw new Error('firestore unavailable')
    })

    // Act & Assert
    await expect(listContributionsHandler(buildRequest())).rejects.toHaveProperty('code', 'internal')
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Error listing contributions',
      expect.objectContaining({ error: 'firestore unavailable' })
    )
  })
})
