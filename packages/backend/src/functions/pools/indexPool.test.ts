import { mockLogger } from '../../__tests__/setup'

jest.mock('../../utils/blockchain')
jest.mock('../../services')
jest.mock('../../services/eventIndexer')

const { indexPoolHandler } = require('./indexPool')
const { getProvider } = require('../../utils/blockchain')
const { indexPoolByTxHash } = require('../../services/eventIndexer')
const { firestore } = require('../../services')
const { HttpsError } = require('firebase-functions/v2/https')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_TX_HASH = '0x' + 'a'.repeat(64)
const SUPPORTED_CHAIN_ID = 31337 // matches ACTIVE_CHAIN_CONFIG default

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('indexPoolHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    // Default: getProvider returns a mock provider object
    getProvider.mockReturnValue({
      getTransactionReceipt: jest.fn(),
      getBlock: jest.fn(),
    })

    // Default: indexPoolByTxHash resolves with a new pool result
    indexPoolByTxHash.mockResolvedValue({ poolId: 1, alreadyIndexed: false, stored: true })
  })

  // -------------------------------------------------------------------------
  // Authentication
  // -------------------------------------------------------------------------

  it('should throw unauthenticated when request has no auth', async () => {
    // Arrange
    const request = buildRequest({ auth: null })

    // Act & Assert
    await expect(indexPoolHandler(request)).rejects.toHaveProperty('code', 'unauthenticated')
  })

  it('should throw unauthenticated when request auth is undefined', async () => {
    // Arrange
    const request = { data: { txHash: VALID_TX_HASH } } // auth property absent

    // Act & Assert
    await expect(indexPoolHandler(request)).rejects.toHaveProperty('code', 'unauthenticated')
  })

  // -------------------------------------------------------------------------
  // txHash validation
  // -------------------------------------------------------------------------

  it('should throw invalid-argument when txHash is missing', async () => {
    // Arrange
    const request = buildRequest({ data: {} })

    // Act & Assert
    await expect(indexPoolHandler(request)).rejects.toHaveProperty('code', 'invalid-argument')
  })

  it('should throw invalid-argument when txHash is missing the 0x prefix', async () => {
    // Arrange
    const request = buildRequest({ data: { txHash: 'a'.repeat(64) } })

    // Act & Assert
    await expect(indexPoolHandler(request)).rejects.toHaveProperty('code', 'invalid-argument')
  })

  it('should throw invalid-argument when txHash is too short', async () => {
    // Arrange
    const request = buildRequest({ data: { txHash: '0x' + 'a'.repeat(60) } })

    // Act & Assert
    await expect(indexPoolHandler(request)).rejects.toHaveProperty('code', 'invalid-argument')
  })

  it('should throw invalid-argument when txHash is too long', async () => {
    // Arrange
    const request = buildRequest({ data: { txHash: '0x' + 'a'.repeat(66) } })

    // Act & Assert
    await expect(indexPoolHandler(request)).rejects.toHaveProperty('code', 'invalid-argument')
  })

  it('should throw invalid-argument when txHash contains non-hex characters', async () => {
    // Arrange
    const request = buildRequest({ data: { txHash: '0x' + 'g'.repeat(64) } })

    // Act & Assert
    await expect(indexPoolHandler(request)).rejects.toHaveProperty('code', 'invalid-argument')
  })

  // -------------------------------------------------------------------------
  // chainId validation
  // -------------------------------------------------------------------------

  it('should throw invalid-argument for an unsupported chainId', async () => {
    // Arrange
    const request = buildRequest({ data: { txHash: VALID_TX_HASH, chainId: 999999 } })

    // Act & Assert
    await expect(indexPoolHandler(request)).rejects.toHaveProperty('code', 'invalid-argument')
  })

  it('should use the default chainId (31337) when none is provided', async () => {
    // Arrange
    const request = buildRequest({ data: { txHash: VALID_TX_HASH } })
    indexPoolByTxHash.mockResolvedValue({ poolId: 2, alreadyIndexed: false, stored: true })

    // Act
    await indexPoolHandler(request)

    // Assert
    expect(indexPoolByTxHash).toHaveBeenCalledWith(VALID_TX_HASH, SUPPORTED_CHAIN_ID, expect.anything(), firestore)
  })

  // -------------------------------------------------------------------------
  // Error propagation from indexPoolByTxHash
  // -------------------------------------------------------------------------

  it('should re-throw HttpsError not-found from indexPoolByTxHash', async () => {
    // Arrange
    const request = buildRequest({ data: { txHash: VALID_TX_HASH } })
    indexPoolByTxHash.mockRejectedValue(new HttpsError('not-found', 'Receipt not found'))

    // Act & Assert
    await expect(indexPoolHandler(request)).rejects.toHaveProperty('code', 'not-found')
  })

  it('should re-throw HttpsError failed-precondition from indexPoolByTxHash', async () => {
    // Arrange
    const request = buildRequest({ data: { txHash: VALID_TX_HASH } })
    indexPoolByTxHash.mockRejectedValue(new HttpsError('failed-precondition', 'Tx reverted'))

    // Act & Assert
    await expect(indexPoolHandler(request)).rejects.toHaveProperty('code', 'failed-precondition')
  })

  it('should throw HttpsError internal for generic non-HttpsErrors', async () => {
    // Arrange
    const request = buildRequest({ data: { txHash: VALID_TX_HASH } })
    indexPoolByTxHash.mockRejectedValue(new Error('unexpected network error'))

    // Act & Assert
    await expect(indexPoolHandler(request)).rejects.toHaveProperty('code', 'internal')
  })

  it('should log error details when a generic error is thrown', async () => {
    // Arrange
    const request = buildRequest({ data: { txHash: VALID_TX_HASH } })
    indexPoolByTxHash.mockRejectedValue(new Error('rpc timeout'))

    // Act
    await expect(indexPoolHandler(request)).rejects.toHaveProperty('code', 'internal')

    // Assert
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to index pool',
      expect.objectContaining({
        txHash: VALID_TX_HASH,
        chainId: SUPPORTED_CHAIN_ID,
        error: 'rpc timeout',
      })
    )
  })

  // -------------------------------------------------------------------------
  // Success paths
  // -------------------------------------------------------------------------

  it('should return poolId, alreadyIndexed:false, stored:true for a new pool', async () => {
    // Arrange
    const request = buildRequest({ data: { txHash: VALID_TX_HASH } })
    indexPoolByTxHash.mockResolvedValue({ poolId: 42, alreadyIndexed: false, stored: true })

    // Act
    const result = await indexPoolHandler(request)

    // Assert
    expect(result).toEqual({ poolId: 42, alreadyIndexed: false, stored: true })
  })

  it('should return poolId, alreadyIndexed:true, stored:false for an already-indexed pool', async () => {
    // Arrange
    const request = buildRequest({ data: { txHash: VALID_TX_HASH } })
    indexPoolByTxHash.mockResolvedValue({ poolId: 7, alreadyIndexed: true, stored: false })

    // Act
    const result = await indexPoolHandler(request)

    // Assert
    expect(result).toEqual({ poolId: 7, alreadyIndexed: true, stored: false })
  })

  it('should log indexing completion on success', async () => {
    // Arrange
    const request = buildRequest({ data: { txHash: VALID_TX_HASH } })
    indexPoolByTxHash.mockResolvedValue({ poolId: 3, alreadyIndexed: false, stored: true })

    // Act
    await indexPoolHandler(request)

    // Assert
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Pool indexing completed',
      expect.objectContaining({ txHash: VALID_TX_HASH, chainId: SUPPORTED_CHAIN_ID, poolId: 3 })
    )
  })

  it('should pass the firestore instance to indexPoolByTxHash', async () => {
    // Arrange
    const request = buildRequest({ data: { txHash: VALID_TX_HASH } })
    indexPoolByTxHash.mockResolvedValue({ poolId: 1, alreadyIndexed: false, stored: true })

    // Act
    await indexPoolHandler(request)

    // Assert
    expect(indexPoolByTxHash).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), firestore)
  })

  it('should pass the explicitly provided chainId when it matches the active chain', async () => {
    // Arrange
    const request = buildRequest({ data: { txHash: VALID_TX_HASH, chainId: SUPPORTED_CHAIN_ID } })
    indexPoolByTxHash.mockResolvedValue({ poolId: 1, alreadyIndexed: false, stored: true })

    // Act
    await indexPoolHandler(request)

    // Assert
    expect(indexPoolByTxHash).toHaveBeenCalledWith(VALID_TX_HASH, SUPPORTED_CHAIN_ID, expect.anything(), firestore)
  })
})
