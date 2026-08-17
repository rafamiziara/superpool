import { LoanRepaymentInfo } from '@superpool/types'
import { mockLogger } from '../../__tests__/setup'

/**
 * A payment as Firestore stores it, which is not what the callable returns:
 * `repaidAt` is a Timestamp there and an ISO string on the wire, and `id` is
 * the document key rather than a field.
 */
type StoredLoanRepayment = Omit<LoanRepaymentInfo, 'repaidAt' | 'id'> & { id: string; repaidAt: Date }

const { firestore } = require('../../services')
const { listLoanRepaymentsHandler } = require('./listLoanRepayments')

const CHAIN_ID = 31337 // matches ACTIVE_CHAIN_CONFIG default
const BORROWER = '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc'

describe('listLoanRepaymentsHandler', () => {
  const mockRepayments: StoredLoanRepayment[] = [
    {
      id: `${CHAIN_ID}-0xaaa-0`,
      loanId: 1,
      poolId: 1,
      poolAddress: '0xPoolAddress1',
      borrower: BORROWER,
      amount: '2000000000000000000',
      chainId: CHAIN_ID,
      transactionHash: '0xaaa',
      logIndex: 0,
      blockNumber: 100,
      repaidAt: new Date('2026-08-01T00:00:00.000Z'),
    },
    {
      // The same loan, paid down a second time. Two documents, because a
      // payment is a log — keying these on the loan would keep only the last.
      id: `${CHAIN_ID}-0xbbb-0`,
      loanId: 1,
      poolId: 1,
      poolAddress: '0xPoolAddress1',
      borrower: BORROWER,
      amount: '3250000000000000000',
      chainId: CHAIN_ID,
      transactionHash: '0xbbb',
      logIndex: 0,
      blockNumber: 140,
      repaidAt: new Date('2026-08-05T00:00:00.000Z'),
    },
  ]

  const createMockQuery = (docs: StoredLoanRepayment[], totalCount: number) => {
    const mockDocs = docs.map((repayment) => ({
      id: repayment.id,
      data: () => ({
        ...repayment,
        repaidAt: { toDate: () => repayment.repaidAt },
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
    mockQuery = createMockQuery(mockRepayments, mockRepayments.length)
    ;(firestore.collection as jest.Mock).mockReturnValue(mockQuery)
  })

  it('should reject an unauthenticated caller', async () => {
    // Arrange — this ties a wallet address to an amount; serving it anonymously
    // would make the collection trivially scrapeable in one request.
    // Act & Assert
    await expect(listLoanRepaymentsHandler(buildRequest({ auth: null }) as never)).rejects.toThrow(
      /must be authenticated to list loan repayments/
    )
  })

  it('should read from the loan_repayments collection', async () => {
    // Act
    await listLoanRepaymentsHandler(buildRequest() as never)

    // Assert
    expect(firestore.collection).toHaveBeenCalledWith('loan_repayments')
  })

  it('should return each instalment separately, with ISO dates', async () => {
    // Act
    const result = await listLoanRepaymentsHandler(buildRequest() as never)

    // Assert — two payments towards one loan, each carrying what it paid
    // rather than a running total.
    expect(result.repayments).toHaveLength(2)
    expect(result.totalCount).toBe(2)
    expect(result.repayments.map((repayment: LoanRepaymentInfo) => repayment.amount)).toEqual([
      '2000000000000000000',
      '3250000000000000000',
    ])
    // A Date cannot cross a callable — the encoder turns one into `{}`.
    expect(result.repayments[0].repaidAt).toBe('2026-08-01T00:00:00.000Z')
  })

  it('should filter by chain', async () => {
    // Act
    await listLoanRepaymentsHandler(buildRequest({ data: { chainId: 80002 } }) as never)

    // Assert
    expect(mockQuery.where).toHaveBeenCalledWith('chainId', '==', 80002)
  })

  it('should filter by pool when asked', async () => {
    // Act
    await listLoanRepaymentsHandler(buildRequest({ data: { poolId: 7 } }) as never)

    // Assert
    expect(mockQuery.where).toHaveBeenCalledWith('poolId', '==', 7)
  })

  it('should filter by loan when asked', async () => {
    // Act
    await listLoanRepaymentsHandler(buildRequest({ data: { poolId: 7, loanId: 3 } }) as never)

    // Assert
    expect(mockQuery.where).toHaveBeenCalledWith('loanId', '==', 3)
  })

  it('should filter by loan 0 rather than treating it as absent', async () => {
    // Arrange — checked against undefined, not for truthiness. No pool counts
    // its loans from 0, but the same slip on `poolId` is a real one.
    // Act
    await listLoanRepaymentsHandler(buildRequest({ data: { loanId: 0 } }) as never)

    // Assert
    expect(mockQuery.where).toHaveBeenCalledWith('loanId', '==', 0)
  })

  it('should lowercase the borrower filter, since the indexer lowercases what it stores', async () => {
    // Arrange — wallets report addresses checksummed, which would match nothing.
    // Act
    await listLoanRepaymentsHandler(buildRequest({ data: { borrower: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc' } }) as never)

    // Assert
    expect(mockQuery.where).toHaveBeenCalledWith('borrower', '==', BORROWER)
  })

  it('should order newest first', async () => {
    // Act
    await listLoanRepaymentsHandler(buildRequest() as never)

    // Assert
    expect(mockQuery.orderBy).toHaveBeenCalledWith('repaidAt', 'desc')
  })

  it('should apply the default limit', async () => {
    // Act
    const result = await listLoanRepaymentsHandler(buildRequest() as never)

    // Assert
    expect(mockQuery.limit).toHaveBeenCalledWith(50)
    expect(result.limit).toBe(50)
  })

  it('should cap the limit at what the Firestore rules allow', async () => {
    // Act
    await listLoanRepaymentsHandler(buildRequest({ data: { limit: 5000 } }) as never)

    // Assert
    expect(mockQuery.limit).toHaveBeenCalledWith(100)
  })

  it('should report an empty collection rather than failing', async () => {
    // Arrange
    mockQuery = createMockQuery([], 0)
    ;(firestore.collection as jest.Mock).mockReturnValue(mockQuery)

    // Act
    const result = await listLoanRepaymentsHandler(buildRequest() as never)

    // Assert
    expect(result.repayments).toEqual([])
    expect(result.totalCount).toBe(0)
  })

  it('should hide a query failure behind a generic message', async () => {
    // Arrange
    mockQuery.get.mockRejectedValue(new Error('index missing'))

    // Act & Assert
    await expect(listLoanRepaymentsHandler(buildRequest() as never)).rejects.toThrow(/Failed to list loan repayments/)
    expect(mockLogger.error).toHaveBeenCalledWith('Error listing loan repayments', expect.anything())
  })
})
