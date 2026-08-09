import { mockLogger } from '../../__tests__/setup'

jest.mock('../../utils')
jest.mock('../../services')

const { preparePoolCreationHandler } = require('./preparePoolCreation')
const { isWalletWhitelisted, isWhitelistModeEnabled, whitelistWallet } = require('../../utils')
const { firestore } = require('../../services')
const { DEFAULT_CHAIN_ID, WHITELISTING_LOGS_COLLECTION } = require('../../constants')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Checksummed: ethers' isAddress() rejects mixed-case addresses with a bad checksum.
const WALLET = '0x7C3ed3a184BAAb1DaF35f5387bA23736C7CD18a6'
const TX_HASH = '0x' + 'b'.repeat(64)

function buildRequest(
  overrides: Partial<{
    auth: object | null
    data: Record<string, unknown>
  }> = {}
) {
  return {
    auth: overrides.auth !== undefined ? overrides.auth : { uid: WALLET, token: {} },
    data: overrides.data !== undefined ? overrides.data : {},
  }
}

/** Captures the audit-log document written to the whitelisting collection. */
function mockAuditLog() {
  const add = jest.fn().mockResolvedValue({ id: 'log-1' })
  firestore.collection.mockReturnValue({ add })
  return add
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('preparePoolCreationHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuditLog()
    isWhitelistModeEnabled.mockResolvedValue(true)
    isWalletWhitelisted.mockResolvedValue(false)
    whitelistWallet.mockResolvedValue({ transactionHash: TX_HASH, gasCost: '21000' })
  })

  // -------------------------------------------------------------------------
  // Authentication and validation
  // -------------------------------------------------------------------------

  it('should throw unauthenticated when the request has no auth', async () => {
    await expect(preparePoolCreationHandler(buildRequest({ auth: null }))).rejects.toHaveProperty('code', 'unauthenticated')
  })

  it('should throw invalid-argument when the uid is not an address', async () => {
    const request = buildRequest({ auth: { uid: 'not-an-address', token: {} } })

    await expect(preparePoolCreationHandler(request)).rejects.toHaveProperty('code', 'invalid-argument')
  })

  it('should not attempt whitelisting when the address is invalid', async () => {
    const request = buildRequest({ auth: { uid: 'not-an-address', token: {} } })

    await expect(preparePoolCreationHandler(request)).rejects.toThrow()
    expect(whitelistWallet).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Chain selection
  // -------------------------------------------------------------------------

  it('should default to the configured chain when none is supplied', async () => {
    await preparePoolCreationHandler(buildRequest())

    expect(isWhitelistModeEnabled).toHaveBeenCalledWith(DEFAULT_CHAIN_ID)
  })

  it('should use the requested chain when supplied', async () => {
    await preparePoolCreationHandler(buildRequest({ data: { chainId: 80002 } }))

    expect(isWhitelistModeEnabled).toHaveBeenCalledWith(80002)
    expect(isWalletWhitelisted).toHaveBeenCalledWith(WALLET, 80002)
  })

  // -------------------------------------------------------------------------
  // Whitelist mode
  // -------------------------------------------------------------------------

  it('should throw failed-precondition when whitelist mode is disabled', async () => {
    isWhitelistModeEnabled.mockResolvedValue(false)

    await expect(preparePoolCreationHandler(buildRequest())).rejects.toHaveProperty('code', 'failed-precondition')
    expect(whitelistWallet).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Lazy whitelisting
  // -------------------------------------------------------------------------

  it('should short-circuit when the wallet is already whitelisted', async () => {
    isWalletWhitelisted.mockResolvedValue(true)

    const result = await preparePoolCreationHandler(buildRequest())

    expect(result).toEqual({ isWhitelisted: true, wasAlreadyWhitelisted: true })
    expect(whitelistWallet).not.toHaveBeenCalled()
  })

  it('should whitelist the wallet and return the transaction details', async () => {
    const result = await preparePoolCreationHandler(buildRequest())

    expect(whitelistWallet).toHaveBeenCalledWith(WALLET, DEFAULT_CHAIN_ID)
    expect(result).toEqual({
      isWhitelisted: true,
      wasAlreadyWhitelisted: false,
      transactionHash: TX_HASH,
      gasCost: '21000',
    })
  })

  // -------------------------------------------------------------------------
  // Audit trail
  // -------------------------------------------------------------------------

  it('should write a success entry to the audit log', async () => {
    const add = mockAuditLog()

    await preparePoolCreationHandler(buildRequest())

    expect(firestore.collection).toHaveBeenCalledWith(WHITELISTING_LOGS_COLLECTION)
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ walletAddress: WALLET, transactionHash: TX_HASH, gasCost: '21000', success: true })
    )
  })

  it('should still succeed when writing the audit log fails', async () => {
    firestore.collection.mockReturnValue({ add: jest.fn().mockRejectedValue(new Error('firestore down')) })

    const result = await preparePoolCreationHandler(buildRequest())

    expect(result.isWhitelisted).toBe(true)
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to log whitelisting operation',
      expect.objectContaining({ walletAddress: WALLET })
    )
  })

  it('should write a failure entry when whitelisting throws', async () => {
    const add = mockAuditLog()
    whitelistWallet.mockRejectedValue(new Error('insufficient funds'))

    await expect(preparePoolCreationHandler(buildRequest())).rejects.toThrow()
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'insufficient funds' }))
  })

  it('should not mask a logging failure that happens during error handling', async () => {
    whitelistWallet.mockRejectedValue(new Error('chain unreachable'))
    firestore.collection.mockReturnValue({ add: jest.fn().mockRejectedValue(new Error('firestore down')) })

    await expect(preparePoolCreationHandler(buildRequest())).rejects.toHaveProperty('code', 'internal')
    expect(mockLogger.error).toHaveBeenCalledWith('Failed to log whitelisting error', expect.anything())
  })

  // -------------------------------------------------------------------------
  // Error propagation
  // -------------------------------------------------------------------------

  it('should wrap unexpected errors as internal', async () => {
    whitelistWallet.mockRejectedValue(new Error('boom'))

    await expect(preparePoolCreationHandler(buildRequest())).rejects.toHaveProperty('code', 'internal')
  })

  it('should preserve an HttpsError raised downstream', async () => {
    const { HttpsError } = require('firebase-functions/v2/https')
    isWalletWhitelisted.mockRejectedValue(new HttpsError('unavailable', 'RPC down'))

    await expect(preparePoolCreationHandler(buildRequest())).rejects.toHaveProperty('code', 'unavailable')
  })

  it('should handle non-Error rejections', async () => {
    whitelistWallet.mockRejectedValue('string failure')

    await expect(preparePoolCreationHandler(buildRequest())).rejects.toHaveProperty('code', 'internal')
    expect(mockLogger.error).toHaveBeenCalledWith('Error preparing pool creation', expect.objectContaining({ error: 'string failure' }))
  })
})
