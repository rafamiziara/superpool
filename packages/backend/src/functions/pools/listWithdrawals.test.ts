import { WithdrawalInfo } from '@superpool/types'
import { mockLogger } from '../../__tests__/setup'

/**
 * A withdrawal as Firestore stores it, which is not what the callable returns:
 * `withdrawnAt` is a Timestamp there and an ISO string on the wire, and `id` is
 * the document key rather than a field.
 */
type StoredWithdrawal = Omit<WithdrawalInfo, 'withdrawnAt' | 'id'> & { id: string; withdrawnAt: Date }

const { firestore } = require('../../services')
const { listWithdrawalsHandler } = require('./listWithdrawals')

const CHAIN_ID = 31337 // matches ACTIVE_CHAIN_CONFIG default
const MEMBER = '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc'

describe('listWithdrawalsHandler', () => {
  const mockWithdrawals: StoredWithdrawal[] = [
    {
      id: `${CHAIN_ID}-0xaaa-0`,
      poolId: 1,
      poolAddress: '0xPoolAddress1',
      member: MEMBER,
      amount: '1000000000000000000',
      chainId: CHAIN_ID,
      transactionHash: '0xaaa',
      logIndex: 0,
      blockNumber: 100,
      withdrawnAt: new Date('2026-08-01T00:00:00.000Z'),
    },
    {
      id: `${CHAIN_ID}-0xbbb-0`,
      poolId: 2,
      poolAddress: '0xPoolAddress2',
      member: '0xanotherwallet',
      amount: '5000000000000000000',
      chainId: CHAIN_ID,
      transactionHash: '0xbbb',
      logIndex: 0,
      blockNumber: 101,
      withdrawnAt: new Date('2026-08-02T00:00:00.000Z'),
    },
  ]

  const createMockQuery = (docs: StoredWithdrawal[], totalCount: number) => {
    const mockDocs = docs.map((withdrawal) => ({
      id: withdrawal.id,
      data: () => ({
        ...withdrawal,
        withdrawnAt: { toDate: () => withdrawal.withdrawnAt },
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
    mockQuery = createMockQuery(mockWithdrawals, mockWithdrawals.length)
    ;(firestore.collection as jest.Mock).mockReturnValue(mockQuery)
  })

  it('should reject an unauthenticated caller', async () => {
    // Arrange — this ties a wallet address to an amount; serving it anonymously
    // would make the collection trivially scrapeable in one request.
    // Act & Assert
    await expect(listWithdrawalsHandler(buildRequest({ auth: null }) as never)).rejects.toThrow(/must be authenticated to list withdrawals/)
  })

  it('should read from the withdrawals collection', async () => {
    // Act
    await listWithdrawalsHandler(buildRequest() as never)

    // Assert
    expect(firestore.collection).toHaveBeenCalledWith('withdrawals')
  })

  it('should return the stored withdrawals with ISO dates', async () => {
    // Act
    const result = await listWithdrawalsHandler(buildRequest() as never)

    // Assert
    expect(result.withdrawals).toHaveLength(2)
    expect(result.totalCount).toBe(2)
    expect(result.withdrawals[0].id).toBe(`${CHAIN_ID}-0xaaa-0`)
    expect(result.withdrawals[0].member).toBe(MEMBER)
    // A Date cannot cross a callable — the encoder turns one into `{}`.
    expect(result.withdrawals[0].withdrawnAt).toBe('2026-08-01T00:00:00.000Z')
  })

  it('should filter by chain', async () => {
    // Act
    await listWithdrawalsHandler(buildRequest({ data: { chainId: 80002 } }) as never)

    // Assert
    expect(mockQuery.where).toHaveBeenCalledWith('chainId', '==', 80002)
  })

  it('should filter by pool when asked', async () => {
    // Act
    await listWithdrawalsHandler(buildRequest({ data: { poolId: 7 } }) as never)

    // Assert
    expect(mockQuery.where).toHaveBeenCalledWith('poolId', '==', 7)
  })

  it('should not filter by pool when none is given', async () => {
    // Act
    await listWithdrawalsHandler(buildRequest() as never)

    // Assert
    expect(mockQuery.where).not.toHaveBeenCalledWith('poolId', expect.anything(), expect.anything())
  })

  it('should filter by pool 0 rather than treating it as absent', async () => {
    // Arrange — `poolId` is checked against undefined, not for truthiness.
    // Act
    await listWithdrawalsHandler(buildRequest({ data: { poolId: 0 } }) as never)

    // Assert
    expect(mockQuery.where).toHaveBeenCalledWith('poolId', '==', 0)
  })

  it('should lowercase the member filter, since the indexer lowercases what it stores', async () => {
    // Arrange — wallets report addresses checksummed, which would match nothing.
    // Act
    await listWithdrawalsHandler(buildRequest({ data: { member: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc' } }) as never)

    // Assert
    expect(mockQuery.where).toHaveBeenCalledWith('member', '==', MEMBER)
  })

  it('should order newest first', async () => {
    // Act
    await listWithdrawalsHandler(buildRequest() as never)

    // Assert
    expect(mockQuery.orderBy).toHaveBeenCalledWith('withdrawnAt', 'desc')
  })

  it('should apply the default limit', async () => {
    // Act
    const result = await listWithdrawalsHandler(buildRequest() as never)

    // Assert
    expect(mockQuery.limit).toHaveBeenCalledWith(50)
    expect(result.limit).toBe(50)
  })

  it('should cap the limit at what the Firestore rules allow', async () => {
    // Act
    await listWithdrawalsHandler(buildRequest({ data: { limit: 5000 } }) as never)

    // Assert
    expect(mockQuery.limit).toHaveBeenCalledWith(100)
  })

  it('should raise a negative limit to one rather than the default', async () => {
    // Arrange — a negative number is truthy, so it survives the `|| DEFAULT`
    // and is clamped by the Math.max instead. Matches listContributions.
    // Act
    await listWithdrawalsHandler(buildRequest({ data: { limit: -5 } }) as never)

    // Assert
    expect(mockQuery.limit).toHaveBeenCalledWith(1)
  })

  it('should use the default limit when given zero', async () => {
    // Arrange — zero is falsy, so it falls through to the default.
    // Act
    await listWithdrawalsHandler(buildRequest({ data: { limit: 0 } }) as never)

    // Assert
    expect(mockQuery.limit).toHaveBeenCalledWith(50)
  })

  it('should report an empty collection rather than failing', async () => {
    // Arrange
    mockQuery = createMockQuery([], 0)
    ;(firestore.collection as jest.Mock).mockReturnValue(mockQuery)

    // Act
    const result = await listWithdrawalsHandler(buildRequest() as never)

    // Assert
    expect(result.withdrawals).toEqual([])
    expect(result.totalCount).toBe(0)
  })

  it('should hide a query failure behind a generic message', async () => {
    // Arrange
    mockQuery.get.mockRejectedValue(new Error('index missing'))

    // Act & Assert
    await expect(listWithdrawalsHandler(buildRequest() as never)).rejects.toThrow(/Failed to list withdrawals/)
    expect(mockLogger.error).toHaveBeenCalledWith('Error listing withdrawals', expect.anything())
  })
})
