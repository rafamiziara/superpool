import type { ParsedMembership } from '../../services/membershipIndexer'

jest.mock('../../utils/blockchain')
jest.mock('../../services')
jest.mock('../../services/membershipIndexer', () => ({
  ...jest.requireActual('../../services/membershipIndexer'),
  indexMembershipsByTxHash: jest.fn(),
}))

// `ACTIVE_CHAIN_CONFIG` reads the environment once, at module load. Set this
// before the requires below or every case fails on an unconfigured factory.
const FACTORY_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'
process.env.POOL_FACTORY_ADDRESS = FACTORY_ADDRESS

const { indexMembershipHandler } = require('./indexMembership')
const { getProvider } = require('../../utils/blockchain')
const { indexMembershipsByTxHash } = require('../../services/membershipIndexer')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_TX_HASH = '0x' + 'a'.repeat(64)
const SUPPORTED_CHAIN_ID = 31337 // matches ACTIVE_CHAIN_CONFIG default
const ACCOUNT = '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc'
const JOINED_AT = new Date('2026-08-11T12:00:00.000Z')

function buildRequest(overrides: Partial<{ auth: object | null; data: Record<string, unknown> }> = {}) {
  return {
    auth: overrides.auth !== undefined ? overrides.auth : { uid: 'user-123', token: {} },
    data: overrides.data !== undefined ? overrides.data : { txHash: VALID_TX_HASH },
  }
}

function buildMembership(overrides: Partial<ParsedMembership> = {}): ParsedMembership {
  return {
    poolId: 7,
    poolAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    account: ACCOUNT,
    status: 'requested',
    joinedAt: JOINED_AT,
    chainId: SUPPORTED_CHAIN_ID,
    transactionHash: VALID_TX_HASH,
    blockNumber: 120,
    ...overrides,
  }
}

function resolveWith(members: ParsedMembership[], stored: boolean[] = members.map(() => true)) {
  indexMembershipsByTxHash.mockResolvedValue({
    members,
    results: members.map((member, i) => ({
      id: `${member.chainId}-${member.poolId}-${member.account}`,
      poolId: member.poolId,
      account: member.account,
      alreadyIndexed: !stored[i],
      stored: stored[i],
      transition: stored[i] ? 'requested' : null,
    })),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  getProvider.mockReturnValue({})
  resolveWith([buildMembership()])
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('indexMembershipHandler', () => {
  describe('validation', () => {
    it('should reject an unauthenticated caller', async () => {
      await expect(indexMembershipHandler(buildRequest({ auth: null }) as never)).rejects.toMatchObject({ code: 'unauthenticated' })
      expect(indexMembershipsByTxHash).not.toHaveBeenCalled()
    })

    it.each([
      ['missing', undefined],
      ['too short', '0xabc'],
      ['not hex', `0x${'z'.repeat(64)}`],
    ])('should reject a %s transaction hash', async (_name, txHash) => {
      await expect(indexMembershipHandler(buildRequest({ data: { txHash } }) as never)).rejects.toMatchObject({ code: 'invalid-argument' })
    })

    it('should reject a chain that is not configured', async () => {
      await expect(indexMembershipHandler(buildRequest({ data: { txHash: VALID_TX_HASH, chainId: 999 } }) as never)).rejects.toMatchObject({
        code: 'invalid-argument',
      })
    })
  })

  describe('indexing', () => {
    it('should return the membership and the number of records written', async () => {
      const result = await indexMembershipHandler(buildRequest() as never)

      expect(result.storedCount).toBe(1)
      expect(result.alreadyIndexed).toBe(false)
      expect(result.members[0]).toMatchObject({ id: `31337-7-${ACCOUNT}`, poolId: 7, account: ACCOUNT, status: 'requested' })
    })

    it('should send a Date across the wire as an ISO string', async () => {
      // The callable encoder maps objects by enumerable keys, and a Date has
      // none — it would arrive as `{}`.
      const result = await indexMembershipHandler(buildRequest() as never)

      expect(result.members[0].joinedAt).toBe(JOINED_AT.toISOString())
    })

    it('should carry every standing across the wire', async () => {
      // The app has to tell a rejected applicant from a stranger, so the
      // callable must not flatten these into a boolean.
      resolveWith([buildMembership({ status: 'rejected' })])

      const result = await indexMembershipHandler(buildRequest() as never)

      expect(result.members[0].status).toBe('rejected')
    })

    it('should treat a removal exactly like an admission', async () => {
      // Every direction writes the address's standing afterwards, so the
      // callable has no branch for which event it was.
      resolveWith([buildMembership({ status: 'removed' })])

      const result = await indexMembershipHandler(buildRequest() as never)

      expect(result.members[0].status).toBe('removed')
      expect(result.storedCount).toBe(1)
    })

    it('should report alreadyIndexed when nothing changed', async () => {
      // The app re-indexes a hash whenever startup recovery drains the same one.
      resolveWith([buildMembership()], [false])

      const result = await indexMembershipHandler(buildRequest() as never)

      expect(result.storedCount).toBe(0)
      expect(result.alreadyIndexed).toBe(true)
    })

    it('should index every membership a transaction touched', async () => {
      // A deposit into an open pool carries `MemberJoined` alongside its
      // `FundsDeposited`, and an owner can act on more than one address.
      resolveWith([buildMembership(), buildMembership({ account: '0x0000000000000000000000000000000000000042' })])

      const result = await indexMembershipHandler(buildRequest() as never)

      expect(result.members).toHaveLength(2)
      expect(result.storedCount).toBe(2)
    })

    it('should default to the configured chain', async () => {
      await indexMembershipHandler(buildRequest() as never)

      expect(indexMembershipsByTxHash).toHaveBeenCalledWith(
        VALID_TX_HASH,
        SUPPORTED_CHAIN_ID,
        FACTORY_ADDRESS,
        expect.anything(),
        expect.anything()
      )
    })
  })

  describe('failures', () => {
    it('should pass an HttpsError through untouched', async () => {
      // "No membership event in this transaction" is worth the caller seeing;
      // flattening it to `internal` would lose why.
      const { HttpsError } = require('firebase-functions/v2/https')
      indexMembershipsByTxHash.mockRejectedValue(new HttpsError('not-found', 'No membership event found'))

      await expect(indexMembershipHandler(buildRequest() as never)).rejects.toMatchObject({ code: 'not-found' })
    })

    it('should report an unexpected failure as internal rather than leaking it', async () => {
      indexMembershipsByTxHash.mockRejectedValue(new Error('rpc exploded'))

      await expect(indexMembershipHandler(buildRequest() as never)).rejects.toMatchObject({ code: 'internal' })
    })

    it('should report a non-Error failure without crashing on it', async () => {
      indexMembershipsByTxHash.mockRejectedValue('rpc exploded')

      await expect(indexMembershipHandler(buildRequest() as never)).rejects.toMatchObject({ code: 'internal' })
    })
  })
})
