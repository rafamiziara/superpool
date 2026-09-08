import type { CallableRequest } from 'firebase-functions/v2/https'
import type { Mock } from 'vitest'
import { mockLogger } from '../../__tests__/setup'
import type { ParsedInterestClaimEvent } from '../../services/interestClaimIndexer'

vi.mock('../../utils/blockchain')
vi.mock('../../services')
vi.mock('../../services/interestClaimIndexer', async () => ({
  ...(await vi.importActual<typeof import('../../services/interestClaimIndexer')>('../../services/interestClaimIndexer')),
  indexInterestClaimsByTxHash: vi.fn(),
}))

// `ACTIVE_CHAIN_CONFIG` reads the environment once, at module load. Set this
// before the requires below or every case fails on an unconfigured factory.
// The chain registry reads process.env once, at module load. ESM hoists every import
// above ordinary statements, so this must run inside vi.hoisted to land first.
const { FACTORY_ADDRESS } = vi.hoisted(() => {
  const FACTORY_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'
  process.env.POOL_FACTORY_ADDRESS = FACTORY_ADDRESS
  return { FACTORY_ADDRESS }
})

import * as interestClaimIndexerMock from '../../services/interestClaimIndexer'
import * as blockchainMock from '../../utils/blockchain'
import { indexInterestClaimHandler } from './indexInterestClaim'

// These modules are mocked above; vi.mocked restores the mock types that the
// real signatures would otherwise hide.
const { indexInterestClaimsByTxHash } = vi.mocked(interestClaimIndexerMock)
const { getProvider } = vi.mocked(blockchainMock)
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_TX_HASH = `0x${'a'.repeat(64)}`
const SUPPORTED_CHAIN_ID = 31337 // matches ACTIVE_CHAIN_CONFIG default
const CLAIMED_AT = new Date('2026-08-12T12:00:00.000Z')

function buildRequest<T>(
  overrides: Partial<{
    auth: object | null
    data: Record<string, unknown>
  }> = {}
): CallableRequest<T> {
  return {
    auth: overrides.auth !== undefined ? overrides.auth : { uid: 'user-123', token: {} },
    data: overrides.data !== undefined ? overrides.data : { txHash: VALID_TX_HASH },
  } as unknown as CallableRequest<T>
}

function buildClaim(overrides: Partial<ParsedInterestClaimEvent> = {}): ParsedInterestClaimEvent {
  return {
    poolId: 1,
    poolAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    account: '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc',
    amount: '50000000000000000',
    chainId: SUPPORTED_CHAIN_ID,
    transactionHash: VALID_TX_HASH,
    logIndex: 0,
    blockNumber: 100,
    claimedAt: CLAIMED_AT,
    ...overrides,
  }
}

/** Makes the indexer resolve with the given claims, all newly stored. */
function resolveWith(claims: ParsedInterestClaimEvent[], stored = claims.map(() => true)) {
  ;(indexInterestClaimsByTxHash as Mock).mockResolvedValue({
    claims,
    results: claims.map((claim, i) => ({
      id: `${claim.chainId}-${claim.transactionHash}-${claim.logIndex}`,
      poolId: claim.poolId,
      alreadyIndexed: !stored[i],
      stored: stored[i],
    })),
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('indexInterestClaimHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(getProvider as Mock).mockReturnValue({})
    resolveWith([buildClaim()])
  })

  describe('authentication and arguments', () => {
    it('should reject an unauthenticated caller', async () => {
      // Act & Assert
      await expect(indexInterestClaimHandler(buildRequest({ auth: null }) as never)).rejects.toThrow(
        /must be authenticated to index interest claims/
      )
      expect(indexInterestClaimsByTxHash).not.toHaveBeenCalled()
    })

    it.each([
      ['a missing hash', {}],
      ['an empty hash', { txHash: '' }],
      ['a short hash', { txHash: '0xabc' }],
      ['a hash without the 0x prefix', { txHash: 'a'.repeat(64) }],
      ['a hash with non-hex characters', { txHash: `0x${'z'.repeat(64)}` }],
    ])('should reject %s', async (_label, data) => {
      // Act & Assert
      await expect(indexInterestClaimHandler(buildRequest({ data }) as never)).rejects.toThrow(/txHash/)
      expect(indexInterestClaimsByTxHash).not.toHaveBeenCalled()
    })

    it('should reject an unsupported chain', async () => {
      // Arrange — the backend resolves exactly one chain at a time.
      const request = buildRequest({ data: { txHash: VALID_TX_HASH, chainId: 999999 } })

      // Act & Assert
      await expect(indexInterestClaimHandler(request as never)).rejects.toThrow(/Unsupported chain ID: 999999/)
    })

    it('should fall back to the default chain when none is given', async () => {
      // Act
      await indexInterestClaimHandler(buildRequest() as never)

      // Assert
      expect(indexInterestClaimsByTxHash).toHaveBeenCalledWith(
        VALID_TX_HASH,
        SUPPORTED_CHAIN_ID,
        FACTORY_ADDRESS,
        expect.anything(),
        expect.anything()
      )
    })
  })

  describe('the happy path', () => {
    it('should return the indexed claims', async () => {
      // Act
      const result = await indexInterestClaimHandler(buildRequest() as never)

      // Assert
      expect(result.claims).toHaveLength(1)
      expect(result.claims[0].account).toBe('0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc')
      expect(result.claims[0].amount).toBe('50000000000000000')
      expect(result.storedCount).toBe(1)
      expect(result.alreadyIndexed).toBe(false)
    })

    it('should return claimedAt as an ISO string, since a Date cannot cross a callable', async () => {
      // Arrange — the callable encoder maps objects by their enumerable keys,
      // and a Date has none, so returning one serialises it to `{}`.
      // Act
      const result = await indexInterestClaimHandler(buildRequest() as never)

      // Assert
      expect(result.claims[0].claimedAt).toBe(CLAIMED_AT.toISOString())
      expect(typeof result.claims[0].claimedAt).toBe('string')
    })

    it('should key each claim on its log position', async () => {
      // Arrange
      resolveWith([buildClaim({ logIndex: 0 }), buildClaim({ logIndex: 1 })])

      // Act
      const result = await indexInterestClaimHandler(buildRequest() as never)

      // Assert
      expect(result.claims.map((claim: { id: string }) => claim.id)).toEqual([
        `${SUPPORTED_CHAIN_ID}-${VALID_TX_HASH}-0`,
        `${SUPPORTED_CHAIN_ID}-${VALID_TX_HASH}-1`,
      ])
    })

    it('should report alreadyIndexed only when nothing at all was written', async () => {
      // Arrange
      resolveWith([buildClaim()], [false])

      // Act
      const result = await indexInterestClaimHandler(buildRequest() as never)

      // Assert
      expect(result.storedCount).toBe(0)
      expect(result.alreadyIndexed).toBe(true)
    })
  })

  describe('failures', () => {
    it('should pass an HttpsError through unchanged', async () => {
      // Arrange — "no InterestClaimed event" is a real answer, not an outage.
      const { HttpsError } = await import('firebase-functions/v2/https')
      ;(indexInterestClaimsByTxHash as Mock).mockRejectedValue(new HttpsError('not-found', 'No InterestClaimed event found'))

      // Act & Assert
      await expect(indexInterestClaimHandler(buildRequest() as never)).rejects.toThrow(/No InterestClaimed event found/)
    })

    it('should hide an unexpected failure behind a generic message', async () => {
      // Arrange
      ;(indexInterestClaimsByTxHash as Mock).mockRejectedValue(new Error('socket hang up'))

      // Act & Assert
      await expect(indexInterestClaimHandler(buildRequest() as never)).rejects.toThrow(/Failed to index interest claim/)
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to index interest claim', expect.anything())
    })
  })
})
