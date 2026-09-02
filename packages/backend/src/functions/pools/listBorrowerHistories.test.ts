jest.mock('../../services')
jest.mock('../../services/borrowerHistory', () => ({
  ...jest.requireActual('../../services/borrowerHistory'),
  borrowerHistoriesFor: jest.fn(),
}))
jest.mock('../../utils/blockchain', () => ({ getProvider: jest.fn() }))

const { listBorrowerHistoriesHandler } = require('./listBorrowerHistories')
const { borrowerHistoriesFor, MAX_BORROWERS_PER_CALL, emptyHistory } = require('../../services/borrowerHistory')
const { getProvider } = require('../../utils/blockchain')
const { HttpsError } = require('firebase-functions/v2/https')

const CALLER = '0x1111111111111111111111111111111111111111'
const BORROWER = '0x2222222222222222222222222222222222222222'

/** Months ahead of this machine's clock, exactly as a local node is in tests. */
const CHAIN_SECONDS = 1_800_000_000

const HISTORY = { total: 2, repaid: 1, onTime: 1, late: 0, undated: 0, outstanding: 1, overdue: 0, defaulted: 0, isNew: false }

function buildRequest(overrides: Partial<{ auth: object | null; data: Record<string, unknown> }> = {}) {
  return {
    auth: overrides.auth !== undefined ? overrides.auth : { uid: CALLER, token: {} },
    data: overrides.data !== undefined ? overrides.data : { chainId: 31337, borrowers: [BORROWER] },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  borrowerHistoriesFor.mockResolvedValue({ [BORROWER.toLowerCase()]: HISTORY })
  getProvider.mockReturnValue({ getBlock: jest.fn().mockResolvedValue({ timestamp: CHAIN_SECONDS }) })
})

describe('listBorrowerHistories', () => {
  it('summarises the wallets it was given', async () => {
    const result = await listBorrowerHistoriesHandler(buildRequest())

    expect(result.histories).toEqual({ [BORROWER.toLowerCase()]: HISTORY })
  })

  it('refuses an unauthenticated caller', async () => {
    await expect(listBorrowerHistoriesHandler(buildRequest({ auth: null }))).rejects.toThrow(/authenticated/i)
  })

  /*
    The trap this callable is shaped around. `overdue` is a judgement about a
    moment, and a local node's clock runs months ahead of this machine's — so a
    history judged against `Date.now()` reports every loan on it as comfortably
    inside its term, which looks exactly like the arithmetic being wrong.
  */
  it('judges lateness on chain time, not on the server clock', async () => {
    await listBorrowerHistoriesHandler(buildRequest())

    expect(borrowerHistoriesFor).toHaveBeenCalledWith([BORROWER], 31337, CHAIN_SECONDS, expect.anything())
  })

  it('says which moment it judged against', async () => {
    const result = await listBorrowerHistoriesHandler(buildRequest())

    expect(result.asOf).toBe(new Date(CHAIN_SECONDS * 1000).toISOString())
    expect(Date.parse(result.asOf)).not.toBeNaN()
  })

  it('reports an unreachable chain rather than guessing a clock', async () => {
    getProvider.mockReturnValue({ getBlock: jest.fn().mockResolvedValue(null) })

    await expect(listBorrowerHistoriesHandler(buildRequest())).rejects.toThrow(/Failed to read borrowing histories/i)
  })

  it('refuses a call that names no wallet', async () => {
    await expect(listBorrowerHistoriesHandler(buildRequest({ data: { borrowers: [] } }))).rejects.toThrow(/at least one borrower/i)
    await expect(listBorrowerHistoriesHandler(buildRequest({ data: {} }))).rejects.toThrow(/borrowers/i)
  })

  it('refuses more wallets than one call may summarise', async () => {
    const many = Array.from({ length: MAX_BORROWERS_PER_CALL + 1 }, (_, index) => `0x${String(index).padStart(40, '0')}`)

    await expect(listBorrowerHistoriesHandler(buildRequest({ data: { borrowers: many } }))).rejects.toThrow(/at most/i)
  })

  it('falls back to the default chain', async () => {
    await listBorrowerHistoriesHandler(buildRequest({ data: { borrowers: [BORROWER] } }))

    expect(getProvider).toHaveBeenCalledWith(expect.any(Number))
  })

  it('reports a query failure as an internal error rather than leaking it', async () => {
    borrowerHistoriesFor.mockRejectedValue(new Error('index missing'))

    await expect(listBorrowerHistoriesHandler(buildRequest())).rejects.toThrow(/Failed to read borrowing histories/i)
  })

  /*
    The chain the backend does not serve.

    This is the only `list*` endpoint that reads the chain, and it used to be
    the only one that refused an unserved one — then have that permanent
    refusal laundered by its own catch into `internal — please try again`. The
    app swallowed it, so nothing on screen broke and it was visible only in the
    logs, reading as a server fault on a healthy server.

    Nothing here mocks `getChainConfig`: 999 is a chain id no `.env` in this
    project configures, which is the same reason the real thing refused it.
  */
  describe('on a chain this backend does not serve', () => {
    const UNSERVED = { auth: { uid: CALLER, token: {} }, data: { chainId: 999, borrowers: [BORROWER] } }

    it('answers empty rather than refusing, like its seven siblings', async () => {
      const result = await listBorrowerHistoriesHandler(UNSERVED)

      expect(result.histories).toEqual({ [BORROWER.toLowerCase()]: emptyHistory() })
    })

    // The distinction `isNew` exists to protect: an absent key would make the
    // caller guess whether the wallet is new or the call went wrong.
    it('still returns every wallet it was asked about', async () => {
      const other = '0x3333333333333333333333333333333333333333'
      const result = await listBorrowerHistoriesHandler({ ...UNSERVED, data: { chainId: 999, borrowers: [BORROWER, other] } })

      expect(Object.keys(result.histories).sort()).toEqual([BORROWER.toLowerCase(), other].sort())
      expect(result.histories[other].isNew).toBe(true)
    })

    it('never reaches the chain or the loans', async () => {
      await listBorrowerHistoriesHandler(UNSERVED)

      expect(getProvider).not.toHaveBeenCalled()
      expect(borrowerHistoriesFor).not.toHaveBeenCalled()
    })

    // Server time, and the one place this response is not chain time — there
    // is no chain to read a block from. It dates the answer, not a comparison.
    it('dates the answer it gave', async () => {
      const result = await listBorrowerHistoriesHandler(UNSERVED)

      expect(Date.parse(result.asOf)).not.toBeNaN()
    })
  })

  /*
    The mechanism behind the bug above, pinned on its own so the fix survives
    the next thing that raises deliberately inside the try. Every list
    callable's catch collapses what it sees into `internal`; a refusal that
    goes through one is described to the caller as transient, and they are
    invited to retry something that can never succeed.
  */
  it('does not launder a deliberate refusal into a retryable internal error', async () => {
    getProvider.mockImplementation(() => {
      throw new HttpsError('invalid-argument', 'Unsupported chain ID: 137')
    })

    await expect(listBorrowerHistoriesHandler(buildRequest())).rejects.toMatchObject({ code: 'invalid-argument' })
  })
})

// A module, not a script: this file uses `require` so that `jest.mock` hoists
// above it, and without an export the test globals would collide with every
// other callable test in the project.
export {}
