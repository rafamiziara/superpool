import { LoanDecisionInfo } from '@superpool/types'
import { mockLogger } from '../../__tests__/setup'

/**
 * A decision as Firestore stores it, which is not what the callable returns:
 * `decidedAt` is a Timestamp there and an ISO string on the wire, and `id` is
 * the document key rather than a field.
 */
type StoredLoanDecision = Omit<LoanDecisionInfo, 'decidedAt' | 'id'> & { id: string; decidedAt: Date }

const { firestore } = require('../../services')
const { listLoanDecisionsHandler } = require('./listLoanDecisions')

const CHAIN_ID = 31337 // matches ACTIVE_CHAIN_CONFIG default
const BORROWER = '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc'
const OWNER = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8'

describe('listLoanDecisionsHandler', () => {
  const mockDecisions: StoredLoanDecision[] = [
    {
      id: `${CHAIN_ID}-0xaaa-0`,
      loanId: 1,
      poolId: 1,
      poolAddress: '0xPoolAddress1',
      borrower: BORROWER,
      amount: '2000000000000000000',
      outcome: 'approved',
      decidedBy: OWNER,
      chainId: CHAIN_ID,
      transactionHash: '0xaaa',
      logIndex: 0,
      blockNumber: 100,
      decidedAt: new Date('2026-08-01T00:00:00.000Z'),
    },
    {
      // The same loan, months later. Two documents, because a decision is a
      // log — keying these on the loan would let the declaration overwrite the
      // approval and lose the earlier half of the story.
      id: `${CHAIN_ID}-0xbbb-0`,
      loanId: 1,
      poolId: 1,
      poolAddress: '0xPoolAddress1',
      borrower: BORROWER,
      amount: '2140000000000000000',
      outcome: 'defaulted',
      decidedBy: OWNER,
      chainId: CHAIN_ID,
      transactionHash: '0xbbb',
      logIndex: 0,
      blockNumber: 900,
      decidedAt: new Date('2026-08-05T00:00:00.000Z'),
    },
  ]

  const createMockQuery = (docs: StoredLoanDecision[], totalCount: number) => {
    const mockDocs = docs.map((decision) => ({
      id: decision.id,
      data: () => ({
        ...decision,
        decidedAt: { toDate: () => decision.decidedAt },
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
    mockQuery = createMockQuery(mockDecisions, mockDecisions.length)
    ;(firestore.collection as jest.Mock).mockReturnValue(mockQuery)
  })

  it('should reject an unauthenticated caller', async () => {
    // Act & Assert
    await expect(listLoanDecisionsHandler(buildRequest({ auth: null }) as never)).rejects.toThrow(
      /must be authenticated to list loan decisions/
    )
  })

  it('should read from the loan_decisions collection', async () => {
    // Act
    await listLoanDecisionsHandler(buildRequest() as never)

    // Assert
    expect(firestore.collection).toHaveBeenCalledWith('loan_decisions')
  })

  it('should return every decision about a loan, not just its last', async () => {
    // Act
    const result = await listLoanDecisionsHandler(buildRequest() as never)

    // Assert — one loan, approved and later declared in default. The loan
    // record can only say `defaulted`; the approval survives here.
    expect(result.decisions).toHaveLength(2)
    expect(result.totalCount).toBe(2)
    expect(result.decisions.map((decision: LoanDecisionInfo) => decision.outcome)).toEqual(['approved', 'defaulted'])
    // A Date cannot cross a callable — the encoder turns one into `{}`.
    expect(result.decisions[0].decidedAt).toBe('2026-08-01T00:00:00.000Z')
  })

  it('should carry who decided, which no loan event does', async () => {
    // Act
    const result = await listLoanDecisionsHandler(buildRequest() as never)

    // Assert
    expect(result.decisions[0].decidedBy).toBe(OWNER)
  })

  it('should filter by chain', async () => {
    // Act
    await listLoanDecisionsHandler(buildRequest({ data: { chainId: 80002 } }) as never)

    // Assert
    expect(mockQuery.where).toHaveBeenCalledWith('chainId', '==', 80002)
  })

  it('should filter by pool when asked', async () => {
    // Act
    await listLoanDecisionsHandler(buildRequest({ data: { poolId: 7 } }) as never)

    // Assert
    expect(mockQuery.where).toHaveBeenCalledWith('poolId', '==', 7)
  })

  it('should filter by loan when asked', async () => {
    // Act
    await listLoanDecisionsHandler(buildRequest({ data: { poolId: 7, loanId: 3 } }) as never)

    // Assert
    expect(mockQuery.where).toHaveBeenCalledWith('loanId', '==', 3)
  })

  it('should filter by loan 0 rather than treating it as absent', async () => {
    // Arrange — checked against undefined, not for truthiness.
    // Act
    await listLoanDecisionsHandler(buildRequest({ data: { loanId: 0 } }) as never)

    // Assert
    expect(mockQuery.where).toHaveBeenCalledWith('loanId', '==', 0)
  })

  it('should lowercase the borrower filter, since the indexer lowercases what it stores', async () => {
    // Act
    await listLoanDecisionsHandler(buildRequest({ data: { borrower: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc' } }) as never)

    // Assert
    expect(mockQuery.where).toHaveBeenCalledWith('borrower', '==', BORROWER)
  })

  it('should lowercase the decider filter too', async () => {
    // Arrange — a different question from the borrower's: this is what one
    // wallet decided, across everyone it lent to.
    // Act
    await listLoanDecisionsHandler(buildRequest({ data: { decidedBy: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' } }) as never)

    // Assert
    expect(mockQuery.where).toHaveBeenCalledWith('decidedBy', '==', OWNER)
  })

  it('should filter by outcome when asked', async () => {
    // Act
    await listLoanDecisionsHandler(buildRequest({ data: { outcome: 'rejected' } }) as never)

    // Assert — `rejected` and `cancelled` are separate outcomes, so asking for
    // refusals never returns the requests borrowers withdrew themselves.
    expect(mockQuery.where).toHaveBeenCalledWith('outcome', '==', 'rejected')
  })

  it('should order newest first', async () => {
    // Act
    await listLoanDecisionsHandler(buildRequest() as never)

    // Assert
    expect(mockQuery.orderBy).toHaveBeenCalledWith('decidedAt', 'desc')
  })

  it('should apply the default limit', async () => {
    // Act
    const result = await listLoanDecisionsHandler(buildRequest() as never)

    // Assert
    expect(mockQuery.limit).toHaveBeenCalledWith(50)
    expect(result.limit).toBe(50)
  })

  it('should cap the limit at what the Firestore rules allow', async () => {
    // Act
    await listLoanDecisionsHandler(buildRequest({ data: { limit: 5000 } }) as never)

    // Assert
    expect(mockQuery.limit).toHaveBeenCalledWith(100)
  })

  it('should report an empty collection rather than failing', async () => {
    // Arrange — a pool that lends on demand decides nothing, and that is an
    // answer rather than a gap.
    mockQuery = createMockQuery([], 0)
    ;(firestore.collection as jest.Mock).mockReturnValue(mockQuery)

    // Act
    const result = await listLoanDecisionsHandler(buildRequest() as never)

    // Assert
    expect(result.decisions).toEqual([])
    expect(result.totalCount).toBe(0)
  })

  it('should wrap a query failure as internal', async () => {
    // Arrange
    mockQuery.get.mockRejectedValue(new Error('firestore unavailable'))

    // Act & Assert
    await expect(listLoanDecisionsHandler(buildRequest() as never)).rejects.toThrow(/Failed to list loan decisions/)
    expect(mockLogger.error).toHaveBeenCalledWith('Error listing loan decisions', expect.any(Object))
  })
})
