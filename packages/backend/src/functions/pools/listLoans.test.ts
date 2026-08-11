import { LoanInfo } from '@superpool/types'
import { mockLogger } from '../../__tests__/setup'

/**
 * A loan as Firestore stores it, which is not what the callable returns:
 * `startedAt` is a Timestamp there and an ISO string on the wire, and `id` is
 * the document key rather than a field.
 */
type StoredLoan = Omit<LoanInfo, 'startedAt' | 'id'> & { id: string; startedAt: Date }

const { firestore } = require('../../services')
const { listLoansHandler } = require('./listLoans')

const CHAIN_ID = 31337 // matches ACTIVE_CHAIN_CONFIG default
const BORROWER = '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc'

describe('listLoansHandler', () => {
  const mockLoans: StoredLoan[] = [
    {
      id: `${CHAIN_ID}-1-1`,
      loanId: 1,
      poolId: 1,
      poolAddress: '0xPoolAddress1',
      borrower: BORROWER,
      amount: '5000000000000000000',
      interestRate: 500,
      duration: 2_592_000,
      isRepaid: false,
      status: 'disbursed',
      chainId: CHAIN_ID,
      transactionHash: '0xaaa',
      blockNumber: 100,
      startedAt: new Date('2026-08-01T00:00:00.000Z'),
    },
    {
      id: `${CHAIN_ID}-2-1`,
      loanId: 1,
      poolId: 2,
      poolAddress: '0xPoolAddress2',
      borrower: '0xanotherwallet',
      amount: '1000000000000000000',
      interestRate: 750,
      duration: 1_209_600,
      isRepaid: true,
      status: 'disbursed',
      chainId: CHAIN_ID,
      transactionHash: '0xbbb',
      blockNumber: 101,
      startedAt: new Date('2026-08-02T00:00:00.000Z'),
    },
  ]

  const createMockQuery = (docs: StoredLoan[], totalCount: number) => {
    const mockDocs = docs.map((loan) => ({
      id: loan.id,
      data: () => ({ ...loan, startedAt: { toDate: () => loan.startedAt } }),
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

  function buildRequest(overrides: Partial<{ auth: object | null; data: Record<string, unknown> }> = {}) {
    return {
      auth: overrides.auth !== undefined ? overrides.auth : { uid: 'user-123', token: {} },
      data: overrides.data !== undefined ? overrides.data : {},
    }
  }

  let mockQuery: ReturnType<typeof createMockQuery>

  beforeEach(() => {
    jest.clearAllMocks()
    mockQuery = createMockQuery(mockLoans, mockLoans.length)
    ;(firestore.collection as jest.Mock).mockReturnValue(mockQuery)
  })

  it('should reject an unauthenticated caller', async () => {
    // This ties a wallet to a debt; serving it anonymously would make the
    // collection trivially scrapeable in one request.
    await expect(listLoansHandler(buildRequest({ auth: null }) as never)).rejects.toThrow(/must be authenticated to list loans/)
  })

  it('should read from the loans collection', async () => {
    await listLoansHandler(buildRequest() as never)

    expect(firestore.collection).toHaveBeenCalledWith('loans')
  })

  it('should return the stored loans with ISO dates', async () => {
    const result = await listLoansHandler(buildRequest() as never)

    expect(result.loans).toHaveLength(2)
    expect(result.totalCount).toBe(2)
    expect(result.loans[0].id).toBe(`${CHAIN_ID}-1-1`)
    // A Date cannot cross a callable — the encoder turns one into `{}`.
    expect(result.loans[0].startedAt).toBe('2026-08-01T00:00:00.000Z')
  })

  it('should keep repaid loans in the list', async () => {
    // A record is the loan's state, not an event, so a settled loan stays as
    // history; `activeOnly` is how a caller asks for outstanding debt only.
    const result = await listLoansHandler(buildRequest() as never)

    expect(result.loans.some((loan: LoanInfo) => loan.isRepaid)).toBe(true)
  })

  it('should order by when the loan started, newest first', async () => {
    await listLoansHandler(buildRequest() as never)

    expect(mockQuery.orderBy).toHaveBeenCalledWith('startedAt', 'desc')
  })

  it('should always filter by chain', async () => {
    await listLoansHandler(buildRequest() as never)

    expect(mockQuery.where).toHaveBeenCalledWith('chainId', '==', CHAIN_ID)
  })

  it('should filter by pool when asked', async () => {
    await listLoansHandler(buildRequest({ data: { poolId: 3 } }) as never)

    expect(mockQuery.where).toHaveBeenCalledWith('poolId', '==', 3)
  })

  it('should lowercase the borrower filter', async () => {
    // The indexer lowercases what it stores, and wallets report addresses
    // checksummed — a raw filter would match nothing.
    await listLoansHandler(buildRequest({ data: { borrower: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc' } }) as never)

    expect(mockQuery.where).toHaveBeenCalledWith('borrower', '==', BORROWER)
  })

  it('should restrict to outstanding loans when activeOnly is set', async () => {
    // Both halves: a pending request is not repaid either, so filtering on
    // `isRepaid` alone would report unfunded requests as active debt.
    await listLoansHandler(buildRequest({ data: { activeOnly: true } }) as never)

    expect(mockQuery.where).toHaveBeenCalledWith('status', '==', 'disbursed')
    expect(mockQuery.where).toHaveBeenCalledWith('isRepaid', '==', false)
  })

  it('should restrict to requests awaiting the owner when pendingOnly is set', async () => {
    await listLoansHandler(buildRequest({ data: { pendingOnly: true } }) as never)

    expect(mockQuery.where).toHaveBeenCalledWith('status', '==', 'requested')
  })

  it('should read a record stored before the approval step as disbursed', async () => {
    // Those loans have no `status` field at all, and every one was disbursed.
    mockQuery.get.mockResolvedValue({
      docs: [{ id: '31337-1-1', data: () => ({ ...mockLoans[0], status: undefined, startedAt: { toDate: () => new Date() } }) }],
    })

    const result = await listLoansHandler(buildRequest() as never)

    expect(result.loans[0].status).toBe('disbursed')
  })

  it('should not filter on isRepaid when activeOnly is absent', async () => {
    await listLoansHandler(buildRequest() as never)

    expect(mockQuery.where).not.toHaveBeenCalledWith('isRepaid', '==', false)
  })

  it('should cap the limit at what the security rules allow', async () => {
    await listLoansHandler(buildRequest({ data: { limit: 5000 } }) as never)

    expect(mockQuery.limit).toHaveBeenCalledWith(100)
  })

  it('should floor a nonsensical limit at one rather than query for none', async () => {
    // A negative limit is truthy, so it reaches the clamp rather than the
    // default — which floors it to 1 instead of asking Firestore for -1 docs.
    await listLoansHandler(buildRequest({ data: { limit: -1 } }) as never)

    expect(mockQuery.limit).toHaveBeenCalledWith(1)
  })

  it('should fall back to the default limit when none is given', async () => {
    await listLoansHandler(buildRequest() as never)

    expect(mockQuery.limit).toHaveBeenCalledWith(50)
  })

  it('should report a failure as internal rather than leaking the query error', async () => {
    mockQuery.get.mockRejectedValue(new Error('FAILED_PRECONDITION: index required'))

    await expect(listLoansHandler(buildRequest() as never)).rejects.toMatchObject({ code: 'internal' })
    expect(mockLogger.error).toHaveBeenCalledWith('Error listing loans', expect.objectContaining({ error: expect.any(String) }))
  })
})
