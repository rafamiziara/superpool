import { mockLogger } from '../../__tests__/setup'
import type { ParsedContributionEvent } from '../../services/contributionIndexer'

jest.mock('../../utils/blockchain')
jest.mock('../../services')
jest.mock('../../services/contributionIndexer', () => ({
  ...jest.requireActual('../../services/contributionIndexer'),
  indexContributionsByTxHash: jest.fn(),
}))

// `ACTIVE_CHAIN_CONFIG` reads the environment once, at module load. Set this
// before the requires below or every case fails on an unconfigured factory.
const FACTORY_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'
process.env.POOL_FACTORY_ADDRESS = FACTORY_ADDRESS

const { indexContributionHandler } = require('./indexContribution')
const { getProvider } = require('../../utils/blockchain')
const { indexContributionsByTxHash } = require('../../services/contributionIndexer')
const { HttpsError } = require('firebase-functions/v2/https')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_TX_HASH = '0x' + 'a'.repeat(64)
const SUPPORTED_CHAIN_ID = 31337 // matches ACTIVE_CHAIN_CONFIG default
const CONTRIBUTED_AT = new Date('2026-08-10T12:00:00.000Z')

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

function buildContribution(overrides: Partial<ParsedContributionEvent> = {}): ParsedContributionEvent {
  return {
    poolId: 1,
    poolAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    contributor: '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc',
    amount: '1000000000000000000',
    chainId: SUPPORTED_CHAIN_ID,
    transactionHash: VALID_TX_HASH,
    logIndex: 0,
    blockNumber: 100,
    contributedAt: CONTRIBUTED_AT,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('indexContributionHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    getProvider.mockReturnValue({ getTransactionReceipt: jest.fn(), getBlock: jest.fn() })

    indexContributionsByTxHash.mockResolvedValue({
      contributions: [buildContribution()],
      results: [{ id: 'doc-1', poolId: 1, alreadyIndexed: false, stored: true }],
    })
  })

  // -------------------------------------------------------------------------
  // Authentication and validation
  // -------------------------------------------------------------------------

  it('should throw unauthenticated when the request has no auth', async () => {
    // Act & Assert
    await expect(indexContributionHandler(buildRequest({ auth: null }))).rejects.toHaveProperty('code', 'unauthenticated')
  })

  it('should throw invalid-argument when txHash is missing', async () => {
    // Act & Assert
    await expect(indexContributionHandler(buildRequest({ data: {} }))).rejects.toHaveProperty('code', 'invalid-argument')
  })

  it('should throw invalid-argument when txHash is malformed', async () => {
    // Act & Assert
    await expect(indexContributionHandler(buildRequest({ data: { txHash: '0xnope' } }))).rejects.toHaveProperty('code', 'invalid-argument')
  })

  it('should throw invalid-argument for an unsupported chain', async () => {
    // Arrange — the backend resolves exactly one chain at a time.
    const request = buildRequest({ data: { txHash: VALID_TX_HASH, chainId: 999999 } })

    // Act & Assert
    await expect(indexContributionHandler(request)).rejects.toHaveProperty('code', 'invalid-argument')
  })

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it('should index the contributions in the transaction', async () => {
    // Act
    const result = await indexContributionHandler(buildRequest())

    // Assert
    expect(result.contributions).toHaveLength(1)
    expect(result.storedCount).toBe(1)
    expect(result.alreadyIndexed).toBe(false)
  })

  it('should pass the configured factory address to the indexer', async () => {
    // Arrange — the factory is what maps a pool address back to its id.
    // Act
    await indexContributionHandler(buildRequest())

    // Assert
    expect(indexContributionsByTxHash).toHaveBeenCalledWith(
      VALID_TX_HASH,
      SUPPORTED_CHAIN_ID,
      FACTORY_ADDRESS,
      expect.anything(),
      expect.anything()
    )
  })

  it('should return contributedAt as an ISO string, never a Date', async () => {
    // Arrange — a Date has no enumerable keys, so the callable encoder would
    // serialise it to `{}` on the wire.
    // Act
    const result = await indexContributionHandler(buildRequest())

    // Assert
    expect(result.contributions[0].contributedAt).toBe(CONTRIBUTED_AT.toISOString())
    expect(typeof result.contributions[0].contributedAt).toBe('string')
  })

  it('should build the document id from chainId, txHash and logIndex', async () => {
    // Arrange
    indexContributionsByTxHash.mockResolvedValue({
      contributions: [buildContribution({ logIndex: 4 })],
      results: [{ id: 'doc-1', poolId: 1, alreadyIndexed: false, stored: true }],
    })

    // Act
    const result = await indexContributionHandler(buildRequest())

    // Assert
    expect(result.contributions[0].id).toBe(`${SUPPORTED_CHAIN_ID}-${VALID_TX_HASH}-4`)
  })

  it('should report alreadyIndexed when nothing new was written', async () => {
    // Arrange — re-indexing a transaction the backend has already seen.
    indexContributionsByTxHash.mockResolvedValue({
      contributions: [buildContribution()],
      results: [{ id: 'doc-1', poolId: 1, alreadyIndexed: true, stored: false }],
    })

    // Act
    const result = await indexContributionHandler(buildRequest())

    // Assert
    expect(result.storedCount).toBe(0)
    expect(result.alreadyIndexed).toBe(true)
  })

  it('should not report alreadyIndexed when only some logs were already stored', async () => {
    // Arrange — a partially new transaction is not "already indexed".
    indexContributionsByTxHash.mockResolvedValue({
      contributions: [buildContribution({ logIndex: 0 }), buildContribution({ logIndex: 1 })],
      results: [
        { id: 'doc-0', poolId: 1, alreadyIndexed: true, stored: false },
        { id: 'doc-1', poolId: 1, alreadyIndexed: false, stored: true },
      ],
    })

    // Act
    const result = await indexContributionHandler(buildRequest())

    // Assert
    expect(result.storedCount).toBe(1)
    expect(result.alreadyIndexed).toBe(false)
    expect(result.contributions).toHaveLength(2)
  })

  // -------------------------------------------------------------------------
  // Failures
  // -------------------------------------------------------------------------

  it('should propagate an HttpsError from the indexer unchanged', async () => {
    // Arrange — "no FundsDeposited event" is a not-found the caller should see.
    indexContributionsByTxHash.mockRejectedValue(new HttpsError('not-found', 'No FundsDeposited event found'))

    // Act & Assert
    await expect(indexContributionHandler(buildRequest())).rejects.toHaveProperty('code', 'not-found')
  })

  it('should convert an unexpected failure into an internal error', async () => {
    // Arrange
    indexContributionsByTxHash.mockRejectedValue(new Error('socket hang up'))

    // Act & Assert
    await expect(indexContributionHandler(buildRequest())).rejects.toHaveProperty('code', 'internal')
    expect(mockLogger.error).toHaveBeenCalledWith('Failed to index contribution', expect.objectContaining({ error: 'socket hang up' }))
  })
})
