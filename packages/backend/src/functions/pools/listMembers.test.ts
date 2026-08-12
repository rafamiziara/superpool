import { MemberInfo } from '@superpool/types'
import { mockLogger } from '../../__tests__/setup'

/**
 * A membership as Firestore stores it, which is not what the callable returns:
 * `joinedAt` is a Timestamp there and an ISO string on the wire, and `id` is
 * the document key rather than a field.
 */
type StoredMember = Omit<MemberInfo, 'joinedAt' | 'id'> & { id: string; joinedAt: Date }

const { firestore } = require('../../services')
const { listMembersHandler } = require('./listMembers')

const CHAIN_ID = 31337 // matches ACTIVE_CHAIN_CONFIG default
const ACCOUNT = '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc'

describe('listMembersHandler', () => {
  const mockMembers: StoredMember[] = [
    {
      id: `${CHAIN_ID}-1-${ACCOUNT}`,
      poolId: 1,
      poolAddress: '0xPoolAddress1',
      account: ACCOUNT,
      status: 'active',
      chainId: CHAIN_ID,
      transactionHash: '0xaaa',
      blockNumber: 100,
      joinedAt: new Date('2026-08-01T00:00:00.000Z'),
    },
    {
      id: `${CHAIN_ID}-2-0xanotherwallet`,
      poolId: 2,
      poolAddress: '0xPoolAddress2',
      account: '0xanotherwallet',
      status: 'removed',
      chainId: CHAIN_ID,
      transactionHash: '0xbbb',
      blockNumber: 101,
      joinedAt: new Date('2026-08-02T00:00:00.000Z'),
    },
  ]

  const createMockQuery = (docs: StoredMember[], totalCount: number) => {
    const mockDocs = docs.map((member) => ({
      id: member.id,
      data: () => ({ ...member, joinedAt: { toDate: () => member.joinedAt } }),
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
    mockQuery = createMockQuery(mockMembers, mockMembers.length)
    ;(firestore.collection as jest.Mock).mockReturnValue(mockQuery)
  })

  it('should reject an unauthenticated caller', async () => {
    // This says who belongs to whose private circle, which is the one thing a
    // permissioned pool exists to keep to itself.
    await expect(listMembersHandler(buildRequest({ auth: null }) as never)).rejects.toThrow(/must be authenticated to list members/)
  })

  it('should read from the memberships collection', async () => {
    await listMembersHandler(buildRequest() as never)

    expect(firestore.collection).toHaveBeenCalledWith('memberships')
  })

  it('should return the stored memberships with ISO dates', async () => {
    const result = await listMembersHandler(buildRequest() as never)

    expect(result.members).toHaveLength(2)
    expect(result.totalCount).toBe(2)
    // A Date cannot cross a callable — the encoder turns one into `{}`.
    expect(result.members[0].joinedAt).toBe('2026-08-01T00:00:00.000Z')
  })

  it('should keep departed addresses in the list', async () => {
    // A record is a standing, not an event, so it stays as history — which is
    // what lets the app tell "never asked" from "asked and turned down".
    const result = await listMembersHandler(buildRequest() as never)

    expect(result.members.some((member: MemberInfo) => member.status === 'removed')).toBe(true)
  })

  it('should order by when the address joined, newest first', async () => {
    await listMembersHandler(buildRequest() as never)

    expect(mockQuery.orderBy).toHaveBeenCalledWith('joinedAt', 'desc')
  })

  it('should always filter by chain', async () => {
    await listMembersHandler(buildRequest() as never)

    expect(mockQuery.where).toHaveBeenCalledWith('chainId', '==', CHAIN_ID)
  })

  it('should filter by pool when asked', async () => {
    await listMembersHandler(buildRequest({ data: { poolId: 3 } }) as never)

    expect(mockQuery.where).toHaveBeenCalledWith('poolId', '==', 3)
  })

  it('should lowercase the account filter', async () => {
    // The indexer lowercases what it stores, and wallets report addresses
    // checksummed — a raw filter would match nothing.
    await listMembersHandler(buildRequest({ data: { account: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc' } }) as never)

    expect(mockQuery.where).toHaveBeenCalledWith('account', '==', ACCOUNT)
  })

  it('should restrict to current members when activeOnly is set', async () => {
    await listMembersHandler(buildRequest({ data: { activeOnly: true } }) as never)

    expect(mockQuery.where).toHaveBeenCalledWith('status', '==', 'active')
  })

  it('should restrict to applicants awaiting the owner when pendingOnly is set', async () => {
    await listMembersHandler(buildRequest({ data: { pendingOnly: true } }) as never)

    expect(mockQuery.where).toHaveBeenCalledWith('status', '==', 'requested')
  })

  it('should not filter on status when neither narrowing is asked for', async () => {
    await listMembersHandler(buildRequest() as never)

    expect(mockQuery.where).not.toHaveBeenCalledWith('status', '==', 'active')
  })

  it('should cap the limit at what the security rules allow', async () => {
    await listMembersHandler(buildRequest({ data: { limit: 5000 } }) as never)

    expect(mockQuery.limit).toHaveBeenCalledWith(100)
  })

  it('should floor a nonsensical limit at one rather than query for none', async () => {
    await listMembersHandler(buildRequest({ data: { limit: -1 } }) as never)

    expect(mockQuery.limit).toHaveBeenCalledWith(1)
  })

  it('should fall back to the default limit when none is given', async () => {
    await listMembersHandler(buildRequest() as never)

    expect(mockQuery.limit).toHaveBeenCalledWith(50)
  })

  it('should report a failure as internal rather than leaking the query error', async () => {
    mockQuery.get.mockRejectedValue(new Error('FAILED_PRECONDITION: index required'))

    await expect(listMembersHandler(buildRequest() as never)).rejects.toMatchObject({ code: 'internal' })
    expect(mockLogger.error).toHaveBeenCalledWith('Error listing members', expect.objectContaining({ error: expect.any(String) }))
  })
})
