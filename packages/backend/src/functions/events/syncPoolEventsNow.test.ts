import { mockLogger } from '../../__tests__/setup'

jest.mock('./syncPoolEvents')

const { syncPoolEventsNowHandler } = require('./syncPoolEventsNow')
const { syncPoolEventsHandler } = require('./syncPoolEvents')

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHAIN_ID = 31337 // the default chain, and the only one configured here
const SUPPORTED_CHAIN_ID = CHAIN_ID
const AUTH = { uid: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc' }
/** A signed-in caller who is not an operator. Trivial to become — see `requireAdmin`. */
const STRANGER = { uid: '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955' }

const SWEEP_RESULT = {
  chainId: CHAIN_ID,
  fromBlock: 0,
  toBlock: 64,
  currentBlock: 64,
  caughtUp: true,
  pools: 11,
  contributions: 12,
  withdrawals: 4,
  statusUpdates: 2,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pass `null` for an anonymous caller — an explicit `undefined` would take the default. */
function buildRequest(data: object = {}, auth: object | null = AUTH) {
  return { data, auth: auth ?? undefined } as never
}

beforeEach(() => {
  process.env.FUNCTIONS_EMULATOR = 'false'
  // These are operator endpoints now. `request.auth` alone was never a gate
  // here: authentication in this project is deliberately cheap, so any wallet
  // could start an unbounded run on the project's RPC and Functions budget.
  process.env.ADMIN_WALLETS = AUTH.uid
  syncPoolEventsHandler.mockResolvedValue(SWEEP_RESULT)
})

afterAll(() => {
  delete process.env.FUNCTIONS_EMULATOR
  delete process.env.ADMIN_WALLETS
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('syncPoolEventsNowHandler', () => {
  describe('authentication', () => {
    it('should reject an unauthenticated call outside the emulator', async () => {
      // Arrange
      // The sweep only writes what the chain already says, but it is an
      // unbounded run of RPC calls that a stranger should not be able to start.

      // Act & Assert
      await expect(syncPoolEventsNowHandler(buildRequest({}, null))).rejects.toMatchObject({ code: 'unauthenticated' })
      expect(syncPoolEventsHandler).not.toHaveBeenCalled()
    })

    it('should allow an unauthenticated call in the emulator', async () => {
      // Arrange
      // Scheduled functions never fire in the emulator, so this callable is the
      // only way to run the sweep locally — where there is no signed-in user.
      process.env.FUNCTIONS_EMULATOR = 'true'

      // Act
      const response = await syncPoolEventsNowHandler(buildRequest({}, null))

      // Assert
      expect(response).toEqual(SWEEP_RESULT)
    })

    it('should allow an operator call outside the emulator', async () => {
      // Act
      const response = await syncPoolEventsNowHandler(buildRequest())

      // Assert
      expect(response).toEqual(SWEEP_RESULT)
    })

    it('should refuse a signed-in caller who is not an operator', async () => {
      // The hole this closes: `fromBlock: 0` is a five-minute whole-history
      // re-scan of every configured chain, and a stranger with a throwaway
      // wallet could ask for one as often as they liked.
      await expect(syncPoolEventsNowHandler(buildRequest({ fromBlock: 0 }, STRANGER))).rejects.toMatchObject({
        code: 'permission-denied',
      })
      expect(syncPoolEventsHandler).not.toHaveBeenCalled()
    })

    it('should refuse everyone when no operators are configured', async () => {
      // Empty means nobody, not everybody. An unset `ADMIN_WALLETS` in
      // production must fail closed.
      delete process.env.ADMIN_WALLETS

      await expect(syncPoolEventsNowHandler(buildRequest())).rejects.toMatchObject({ code: 'permission-denied' })
      expect(syncPoolEventsHandler).not.toHaveBeenCalled()
    })
  })

  describe('arguments', () => {
    it('should sweep from the stored cursor when no fromBlock is given', async () => {
      // Act
      await syncPoolEventsNowHandler(buildRequest())

      // Assert
      expect(syncPoolEventsHandler).toHaveBeenCalledWith({ chainId: SUPPORTED_CHAIN_ID, fromBlock: undefined })
    })

    it('should pass an explicit fromBlock through', async () => {
      // Act
      await syncPoolEventsNowHandler(buildRequest({ fromBlock: 0 }))

      // Assert
      expect(syncPoolEventsHandler).toHaveBeenCalledWith({ chainId: SUPPORTED_CHAIN_ID, fromBlock: 0 })
    })

    it('should accept the active chain id', async () => {
      // Act
      const response = await syncPoolEventsNowHandler(buildRequest({ chainId: CHAIN_ID }))

      // Assert
      expect(response).toEqual(SWEEP_RESULT)
    })

    it('should reject a chain that is not configured', async () => {
      // Arrange
      // Ignoring it would silently sweep the active chain and report success
      // for a chain that was never touched.

      // Act & Assert
      await expect(syncPoolEventsNowHandler(buildRequest({ chainId: 80002 }))).rejects.toMatchObject({ code: 'invalid-argument' })
      expect(syncPoolEventsHandler).not.toHaveBeenCalled()
    })

    it.each([
      ['negative', -1],
      ['fractional', 1.5],
    ])('should reject a %s fromBlock', async (_name, fromBlock) => {
      // Act & Assert
      await expect(syncPoolEventsNowHandler(buildRequest({ fromBlock }))).rejects.toMatchObject({ code: 'invalid-argument' })
      expect(syncPoolEventsHandler).not.toHaveBeenCalled()
    })

    it('should tolerate a request with no data at all', async () => {
      // Arrange
      // Callables can arrive with `data` undefined; destructuring it directly
      // would throw a TypeError before any validation ran.
      const request = { auth: AUTH } as never

      // Act
      const response = await syncPoolEventsNowHandler(request)

      // Assert
      expect(response).toEqual(SWEEP_RESULT)
    })
  })

  describe('failures', () => {
    it('should wrap an unexpected sweep failure as internal', async () => {
      // Arrange
      syncPoolEventsHandler.mockRejectedValue(new Error('PoolFactory address not configured'))

      // Act & Assert
      await expect(syncPoolEventsNowHandler(buildRequest())).rejects.toMatchObject({ code: 'internal' })
      expect(mockLogger.error).toHaveBeenCalledWith('Manual event sync failed', expect.objectContaining({ error: expect.any(String) }))
    })

    it('should preserve an HttpsError raised by the sweep', async () => {
      // Arrange
      // Re-wrapping would turn a precise message into a generic "try again".
      const { HttpsError } = require('firebase-functions/v2/https')
      syncPoolEventsHandler.mockRejectedValue(new HttpsError('invalid-argument', 'Unsupported chain ID: 1'))

      // Act & Assert
      await expect(syncPoolEventsNowHandler(buildRequest())).rejects.toMatchObject({ code: 'invalid-argument' })
    })
  })
})
