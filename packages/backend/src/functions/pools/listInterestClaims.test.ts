import { InterestClaimInfo } from '@superpool/types'
import { mockLogger } from '../../__tests__/setup'

/**
 * A claim as Firestore stores it, which is not what the callable returns:
 * `claimedAt` is a Timestamp there and an ISO string on the wire, and `id` is
 * the document key rather than a field.
 */
type StoredInterestClaim = Omit<InterestClaimInfo, 'claimedAt' | 'id'> & { id: string; claimedAt: Date }

const { firestore } = require('../../services')
const { listInterestClaimsHandler } = require('./listInterestClaims')

const CHAIN_ID = 31337 // matches ACTIVE_CHAIN_CONFIG default
const ACCOUNT = '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc'

describe('listInterestClaimsHandler', () => {
  const mockClaims: StoredInterestClaim[] = [
    {
      id: `${CHAIN_ID}-0xaaa-0`,
      poolId: 1,
      poolAddress: '0xPoolAddress1',
      account: ACCOUNT,
      amount: '50000000000000000',
      chainId: CHAIN_ID,
      transactionHash: '0xaaa',
      logIndex: 0,
      blockNumber: 100,
      claimedAt: new Date('2026-08-01T00:00:00.000Z'),
    },
    {
      id: `${CHAIN_ID}-0xbbb-0`,
      poolId: 2,
      poolAddress: '0xPoolAddress2',
      account: '0xanotherwallet',
      amount: '25000000000000000',
      chainId: CHAIN_ID,
      transactionHash: '0xbbb',
      logIndex: 0,
      blockNumber: 101,
      claimedAt: new Date('2026-08-02T00:00:00.000Z'),
    },
  ]

  const createMockQuery = (docs: StoredInterestClaim[], totalCount: number) => {
    const mockDocs = docs.map((claim) => ({
      id: claim.id,
      data: () => ({
        ...claim,
        claimedAt: { toDate: () => claim.claimedAt },
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

  let mockQuery: ReturnType<typeof createMockQuery>

  beforeEach(() => {
    jest.clearAllMocks()
    mockQuery = createMockQuery(mockClaims, mockClaims.length)
    ;(firestore.collection as jest.Mock).mockReturnValue(mockQuery)
  })

  it('should reject an unauthenticated caller', async () => {
    // Arrange — this ties a wallet address to an amount; serving it anonymously
    // would make the collection trivially scrapeable in one request.
    // Act & Assert
    await expect(listInterestClaimsHandler(buildRequest({ auth: null }) as never)).rejects.toThrow(
      /must be authenticated to list interest claims/
    )
  })

  it('should read from the interest_claims collection', async () => {
    // Act
    await listInterestClaimsHandler(buildRequest() as never)

    // Assert
    expect(firestore.collection).toHaveBeenCalledWith('interest_claims')
  })

  it('should return the stored claims with ISO dates', async () => {
    // Act
    const result = await listInterestClaimsHandler(buildRequest() as never)

    // Assert
    expect(result.claims).toHaveLength(2)
    expect(result.totalCount).toBe(2)
    expect(result.claims[0].id).toBe(`${CHAIN_ID}-0xaaa-0`)
    expect(result.claims[0].account).toBe(ACCOUNT)
    // A Date cannot cross a callable — the encoder turns one into `{}`.
    expect(result.claims[0].claimedAt).toBe('2026-08-01T00:00:00.000Z')
  })

  it('should filter by chain', async () => {
    // Act
    await listInterestClaimsHandler(buildRequest({ data: { chainId: 80002 } }) as never)

    // Assert
    expect(mockQuery.where).toHaveBeenCalledWith('chainId', '==', 80002)
  })

  it('should filter by pool when asked', async () => {
    // Act
    await listInterestClaimsHandler(buildRequest({ data: { poolId: 7 } }) as never)

    // Assert
    expect(mockQuery.where).toHaveBeenCalledWith('poolId', '==', 7)
  })

  it('should filter by pool 0 rather than treating it as absent', async () => {
    // Arrange — `poolId` is checked against undefined, not for truthiness.
    // Act
    await listInterestClaimsHandler(buildRequest({ data: { poolId: 0 } }) as never)

    // Assert
    expect(mockQuery.where).toHaveBeenCalledWith('poolId', '==', 0)
  })

  it('should lowercase the account filter, since the indexer lowercases what it stores', async () => {
    // Arrange — wallets report addresses checksummed, which would match nothing.
    // Act
    await listInterestClaimsHandler(buildRequest({ data: { account: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc' } }) as never)

    // Assert
    expect(mockQuery.where).toHaveBeenCalledWith('account', '==', ACCOUNT)
  })

  it('should order newest first', async () => {
    // Act
    await listInterestClaimsHandler(buildRequest() as never)

    // Assert
    expect(mockQuery.orderBy).toHaveBeenCalledWith('claimedAt', 'desc')
  })

  it('should apply the default limit', async () => {
    // Act
    const result = await listInterestClaimsHandler(buildRequest() as never)

    // Assert
    expect(mockQuery.limit).toHaveBeenCalledWith(50)
    expect(result.limit).toBe(50)
  })

  it('should cap the limit at what the Firestore rules allow', async () => {
    // Act
    await listInterestClaimsHandler(buildRequest({ data: { limit: 5000 } }) as never)

    // Assert
    expect(mockQuery.limit).toHaveBeenCalledWith(100)
  })

  it('should report an empty collection rather than failing', async () => {
    // Arrange
    mockQuery = createMockQuery([], 0)
    ;(firestore.collection as jest.Mock).mockReturnValue(mockQuery)

    // Act
    const result = await listInterestClaimsHandler(buildRequest() as never)

    // Assert
    expect(result.claims).toEqual([])
    expect(result.totalCount).toBe(0)
  })

  it('should hide a query failure behind a generic message', async () => {
    // Arrange
    mockQuery.get.mockRejectedValue(new Error('index missing'))

    // Act & Assert
    await expect(listInterestClaimsHandler(buildRequest() as never)).rejects.toThrow(/Failed to list interest claims/)
    expect(mockLogger.error).toHaveBeenCalledWith('Error listing interest claims', expect.anything())
  })
})
