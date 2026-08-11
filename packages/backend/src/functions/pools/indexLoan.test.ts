import { mockLogger } from '../../__tests__/setup'
import type { ParsedLoan } from '../../services/loanIndexer'

jest.mock('../../utils/blockchain')
jest.mock('../../services')
jest.mock('../../services/loanIndexer', () => ({
  ...jest.requireActual('../../services/loanIndexer'),
  indexLoansByTxHash: jest.fn(),
}))

// `ACTIVE_CHAIN_CONFIG` reads the environment once, at module load. Set this
// before the requires below or every case fails on an unconfigured factory.
const FACTORY_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'
process.env.POOL_FACTORY_ADDRESS = FACTORY_ADDRESS

const { indexLoanHandler } = require('./indexLoan')
const { getProvider } = require('../../utils/blockchain')
const { indexLoansByTxHash } = require('../../services/loanIndexer')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_TX_HASH = '0x' + 'a'.repeat(64)
const SUPPORTED_CHAIN_ID = 31337 // matches ACTIVE_CHAIN_CONFIG default
const STARTED_AT = new Date('2026-08-11T12:00:00.000Z')

function buildRequest(overrides: Partial<{ auth: object | null; data: Record<string, unknown> }> = {}) {
  return {
    auth: overrides.auth !== undefined ? overrides.auth : { uid: 'user-123', token: {} },
    data: overrides.data !== undefined ? overrides.data : { txHash: VALID_TX_HASH },
  }
}

function buildLoan(overrides: Partial<ParsedLoan> = {}): ParsedLoan {
  return {
    loanId: 3,
    poolId: 7,
    poolAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    borrower: '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc',
    amount: '5000000000000000000',
    interestRate: 500,
    duration: 2_592_000,
    startedAt: STARTED_AT,
    isRepaid: false,
    chainId: SUPPORTED_CHAIN_ID,
    transactionHash: VALID_TX_HASH,
    blockNumber: 120,
    ...overrides,
  }
}

function resolveWith(loans: ParsedLoan[], stored: boolean[] = loans.map(() => true)) {
  indexLoansByTxHash.mockResolvedValue({
    loans,
    results: loans.map((loan, i) => ({
      id: `${loan.chainId}-${loan.poolId}-${loan.loanId}`,
      loanId: loan.loanId,
      poolId: loan.poolId,
      alreadyIndexed: !stored[i],
      stored: stored[i],
    })),
  })
}

beforeEach(() => {
  getProvider.mockReturnValue({})
  resolveWith([buildLoan()])
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('indexLoanHandler', () => {
  describe('validation', () => {
    it('should reject an unauthenticated caller', async () => {
      await expect(indexLoanHandler(buildRequest({ auth: null }) as never)).rejects.toMatchObject({ code: 'unauthenticated' })
      expect(indexLoansByTxHash).not.toHaveBeenCalled()
    })

    it.each([
      ['missing', undefined],
      ['too short', '0xabc'],
      ['not hex', `0x${'z'.repeat(64)}`],
    ])('should reject a %s transaction hash', async (_name, txHash) => {
      await expect(indexLoanHandler(buildRequest({ data: { txHash } }) as never)).rejects.toMatchObject({ code: 'invalid-argument' })
    })

    it('should reject a chain that is not configured', async () => {
      await expect(indexLoanHandler(buildRequest({ data: { txHash: VALID_TX_HASH, chainId: 999 } }) as never)).rejects.toMatchObject({
        code: 'invalid-argument',
      })
    })
  })

  describe('indexing', () => {
    it('should return the loan and the number of records written', async () => {
      const result = await indexLoanHandler(buildRequest() as never)

      expect(result.storedCount).toBe(1)
      expect(result.alreadyIndexed).toBe(false)
      expect(result.loans[0]).toMatchObject({ id: '31337-7-3', loanId: 3, poolId: 7, isRepaid: false })
    })

    it('should send a Date across the wire as an ISO string', async () => {
      // The callable encoder maps objects by enumerable keys, and a Date has
      // none — it would arrive as `{}`.
      const result = await indexLoanHandler(buildRequest() as never)

      expect(result.loans[0].startedAt).toBe(STARTED_AT.toISOString())
    })

    it('should treat a repayment exactly like a borrow', async () => {
      // Both directions write the loan's state afterwards, so the callable has
      // no branch for which event it was.
      resolveWith([buildLoan({ isRepaid: true })])

      const result = await indexLoanHandler(buildRequest() as never)

      expect(result.loans[0].isRepaid).toBe(true)
      expect(result.storedCount).toBe(1)
    })

    it('should report alreadyIndexed when nothing changed', async () => {
      // The app re-indexes a transaction it has already indexed whenever
      // startup recovery drains the same hash.
      resolveWith([buildLoan()], [false])

      const result = await indexLoanHandler(buildRequest() as never)

      expect(result.storedCount).toBe(0)
      expect(result.alreadyIndexed).toBe(true)
    })

    it('should not call itself already indexed when one of several was new', async () => {
      resolveWith([buildLoan(), buildLoan({ loanId: 4 })], [false, true])

      const result = await indexLoanHandler(buildRequest() as never)

      expect(result.storedCount).toBe(1)
      expect(result.alreadyIndexed).toBe(false)
    })

    it('should default to the active chain', async () => {
      await indexLoanHandler(buildRequest() as never)

      expect(indexLoansByTxHash).toHaveBeenCalledWith(
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
      // Re-wrapping would turn "that was not a SuperPool pool" into a generic
      // "try again", which is not something retrying fixes.
      const { HttpsError } = require('firebase-functions/v2/https')
      indexLoansByTxHash.mockRejectedValue(new HttpsError('not-found', 'No loan event found'))

      await expect(indexLoanHandler(buildRequest() as never)).rejects.toMatchObject({ code: 'not-found' })
    })

    it('should wrap an unexpected failure as internal', async () => {
      indexLoansByTxHash.mockRejectedValue(new Error('socket hang up'))

      await expect(indexLoanHandler(buildRequest() as never)).rejects.toMatchObject({ code: 'internal' })
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to index loan', expect.objectContaining({ txHash: VALID_TX_HASH }))
    })
  })
})
