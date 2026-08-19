jest.mock('../../services')
jest.mock('../../services/borrowerHistory', () => ({
  ...jest.requireActual('../../services/borrowerHistory'),
  borrowerHistoriesFor: jest.fn(),
}))
jest.mock('../../utils/blockchain', () => ({ getProvider: jest.fn() }))

const { listBorrowerHistoriesHandler } = require('./listBorrowerHistories')
const { borrowerHistoriesFor, MAX_BORROWERS_PER_CALL } = require('../../services/borrowerHistory')
const { getProvider } = require('../../utils/blockchain')

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
})

// A module, not a script: this file uses `require` so that `jest.mock` hoists
// above it, and without an export the test globals would collide with every
// other callable test in the project.
export {}
