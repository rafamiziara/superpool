import { mockLogger } from '../../__tests__/setup'
import type { ParsedWithdrawalEvent } from '../../services/withdrawalIndexer'

jest.mock('../../utils/blockchain')
jest.mock('../../services')
jest.mock('../../services/withdrawalIndexer', () => ({
  ...jest.requireActual('../../services/withdrawalIndexer'),
  indexWithdrawalsByTxHash: jest.fn(),
}))

// `ACTIVE_CHAIN_CONFIG` reads the environment once, at module load. Set this
// before the requires below or every case fails on an unconfigured factory.
const FACTORY_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'
process.env.POOL_FACTORY_ADDRESS = FACTORY_ADDRESS

const { indexWithdrawalHandler } = require('./indexWithdrawal')
const { getProvider } = require('../../utils/blockchain')
const { indexWithdrawalsByTxHash } = require('../../services/withdrawalIndexer')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_TX_HASH = '0x' + 'a'.repeat(64)
const SUPPORTED_CHAIN_ID = 31337 // matches ACTIVE_CHAIN_CONFIG default
const WITHDRAWN_AT = new Date('2026-08-11T12:00:00.000Z')

function buildRequest(
  overrides: Partial<{
    auth: object | null
    data: Record<string, unknown>
  }> = {}
) {
  return {
    auth: overrides.auth !== undefined ? overrides.auth : { uid: 'user-123', token: {} },
    data: overrides.data !== undefined ? overrides.data : { txHash: VALID_TX_HASH },
  }
}

function buildWithdrawal(overrides: Partial<ParsedWithdrawalEvent> = {}): ParsedWithdrawalEvent {
  return {
    poolId: 1,
    poolAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    member: '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc',
    amount: '1000000000000000000',
    chainId: SUPPORTED_CHAIN_ID,
    transactionHash: VALID_TX_HASH,
    logIndex: 0,
    blockNumber: 100,
    withdrawnAt: WITHDRAWN_AT,
    ...overrides,
  }
}

/** Makes the indexer resolve with the given withdrawals, all newly stored. */
function resolveWith(withdrawals: ParsedWithdrawalEvent[], stored = withdrawals.map(() => true)) {
  ;(indexWithdrawalsByTxHash as jest.Mock).mockResolvedValue({
    withdrawals,
    results: withdrawals.map((withdrawal, i) => ({
      id: `${withdrawal.chainId}-${withdrawal.transactionHash}-${withdrawal.logIndex}`,
      poolId: withdrawal.poolId,
      alreadyIndexed: !stored[i],
      stored: stored[i],
    })),
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('indexWithdrawalHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getProvider as jest.Mock).mockReturnValue({})
    resolveWith([buildWithdrawal()])
  })

  describe('authentication and arguments', () => {
    it('should reject an unauthenticated caller', async () => {
      // Act & Assert
      await expect(indexWithdrawalHandler(buildRequest({ auth: null }) as never)).rejects.toThrow(
        /must be authenticated to index withdrawals/
      )
      expect(indexWithdrawalsByTxHash).not.toHaveBeenCalled()
    })

    it.each([
      ['a missing hash', {}],
      ['an empty hash', { txHash: '' }],
      ['a short hash', { txHash: '0xabc' }],
      ['a hash without the 0x prefix', { txHash: 'a'.repeat(64) }],
      ['a hash with non-hex characters', { txHash: '0x' + 'z'.repeat(64) }],
    ])('should reject %s', async (_label, data) => {
      // Act & Assert
      await expect(indexWithdrawalHandler(buildRequest({ data }) as never)).rejects.toThrow(/Invalid transaction hash format/)
      expect(indexWithdrawalsByTxHash).not.toHaveBeenCalled()
    })

    it('should reject an unsupported chain', async () => {
      // Arrange — the backend resolves exactly one chain at a time.
      const request = buildRequest({ data: { txHash: VALID_TX_HASH, chainId: 999999 } })

      // Act & Assert
      await expect(indexWithdrawalHandler(request as never)).rejects.toThrow(/Unsupported chain ID: 999999/)
    })

    it('should fall back to the default chain when none is given', async () => {
      // Act
      await indexWithdrawalHandler(buildRequest() as never)

      // Assert
      expect(indexWithdrawalsByTxHash).toHaveBeenCalledWith(
        VALID_TX_HASH,
        SUPPORTED_CHAIN_ID,
        FACTORY_ADDRESS,
        expect.anything(),
        expect.anything()
      )
    })
  })

  describe('the happy path', () => {
    it('should return the indexed withdrawals', async () => {
      // Act
      const result = await indexWithdrawalHandler(buildRequest() as never)

      // Assert
      expect(result.withdrawals).toHaveLength(1)
      expect(result.withdrawals[0].member).toBe('0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc')
      expect(result.withdrawals[0].amount).toBe('1000000000000000000')
      expect(result.storedCount).toBe(1)
      expect(result.alreadyIndexed).toBe(false)
    })

    it('should return withdrawnAt as an ISO string, since a Date cannot cross a callable', async () => {
      // Arrange — the callable encoder maps objects by their enumerable keys,
      // and a Date has none, so returning one serialises it to `{}`.
      // Act
      const result = await indexWithdrawalHandler(buildRequest() as never)

      // Assert
      expect(result.withdrawals[0].withdrawnAt).toBe(WITHDRAWN_AT.toISOString())
      expect(typeof result.withdrawals[0].withdrawnAt).toBe('string')
    })

    it('should key each withdrawal on its log position', async () => {
      // Arrange
      resolveWith([buildWithdrawal({ logIndex: 0 }), buildWithdrawal({ logIndex: 1 })])

      // Act
      const result = await indexWithdrawalHandler(buildRequest() as never)

      // Assert
      expect(result.withdrawals.map((w: { id: string }) => w.id)).toEqual([
        `${SUPPORTED_CHAIN_ID}-${VALID_TX_HASH}-0`,
        `${SUPPORTED_CHAIN_ID}-${VALID_TX_HASH}-1`,
      ])
    })

    it('should report alreadyIndexed only when nothing at all was written', async () => {
      // Arrange
      resolveWith([buildWithdrawal()], [false])

      // Act
      const result = await indexWithdrawalHandler(buildRequest() as never)

      // Assert
      expect(result.storedCount).toBe(0)
      expect(result.alreadyIndexed).toBe(true)
    })

    it('should not report alreadyIndexed when one of several logs was new', async () => {
      // Arrange — a partially new transaction is not "already indexed" in any
      // useful sense.
      resolveWith([buildWithdrawal({ logIndex: 0 }), buildWithdrawal({ logIndex: 1 })], [false, true])

      // Act
      const result = await indexWithdrawalHandler(buildRequest() as never)

      // Assert
      expect(result.storedCount).toBe(1)
      expect(result.alreadyIndexed).toBe(false)
    })
  })

  describe('failures', () => {
    it('should pass an HttpsError through unchanged', async () => {
      // Arrange — "no FundsWithdrawn event" is a real answer, not an outage.
      const { HttpsError } = require('firebase-functions/v2/https')
      ;(indexWithdrawalsByTxHash as jest.Mock).mockRejectedValue(new HttpsError('not-found', 'No FundsWithdrawn event found'))

      // Act & Assert
      await expect(indexWithdrawalHandler(buildRequest() as never)).rejects.toThrow(/No FundsWithdrawn event found/)
    })

    it('should hide an unexpected failure behind a generic message', async () => {
      // Arrange
      ;(indexWithdrawalsByTxHash as jest.Mock).mockRejectedValue(new Error('socket hang up'))

      // Act & Assert
      await expect(indexWithdrawalHandler(buildRequest() as never)).rejects.toThrow(/Failed to index withdrawal/)
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to index withdrawal', expect.anything())
    })
  })
})
