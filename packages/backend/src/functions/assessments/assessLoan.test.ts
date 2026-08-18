jest.mock('../../services')
jest.mock('../../services/agentClient', () => ({ assessLoanWithAgent: jest.fn() }))
jest.mock('../../services/assessments', () => ({
  ...jest.requireActual('../../services/assessments'),
  assessmentFor: jest.fn(),
  claimAssessment: jest.fn(),
  gatherFacts: jest.fn(),
  ownershipOf: jest.fn(),
  releaseAssessment: jest.fn(),
  saveAssessment: jest.fn(),
}))
jest.mock('../../utils/blockchain', () => ({ getProvider: jest.fn() }))
jest.mock('ethers', () => ({ ...jest.requireActual('ethers'), Contract: jest.fn() }))

const { assessLoanHandler } = require('./assessLoan')
const { getAssessmentHandler } = require('./getAssessment')
const { assessLoanWithAgent } = require('../../services/agentClient')
const {
  assessmentFor,
  claimAssessment,
  gatherFacts,
  ownershipOf,
  releaseAssessment,
  saveAssessment,
} = require('../../services/assessments')
const { getProvider } = require('../../utils/blockchain')
const { Contract } = require('ethers')

const OWNER = '0x2222222222222222222222222222222222222222'
const BORROWER = '0x3333333333333333333333333333333333333333'
const LOAN_ID = '31337-1-7'

const HISTORY = { total: 4, repaid: 3, onTime: 3, late: 0, undated: 0, outstanding: 1, overdue: 0, defaulted: 0, isNew: false }

const OWNERSHIP = {
  poolOwner: OWNER.toLowerCase(),
  poolAddress: '0x4444444444444444444444444444444444444444',
  chainId: 31337,
  poolId: 1,
  loanId: 7,
  denomination: { symbol: 'USDC', decimals: 6 },
}

const FACTS = {
  facts: {
    request: { amount: 50, termDays: 30, interestRatePercent: 5, repaymentTotal: 52.5 },
    pool: { name: 'Neighbours', symbol: 'USDC', liquidity: 200, maxLoanAmount: 100, pendingRequests: 1 },
    borrower: HISTORY,
  },
  poolOwner: OWNER.toLowerCase(),
  chainId: 31337,
  poolId: 1,
  loanId: 7,
}

const READING = { risk: 'low', summary: 'Modest ask, clean record.', observations: [], questions: [], limitations: ['No purpose.'] }

const STORED = {
  id: LOAN_ID,
  chainId: 31337,
  poolId: 1,
  loanId: 7,
  ...READING,
  inputs: { amount: 50, liquidity: 200, symbol: 'USDC', hadPurpose: false, borrower: HISTORY },
  createdAt: '2026-08-18T09:00:00.000Z',
}

function buildRequest(overrides: Partial<{ auth: object | null; data: Record<string, unknown> }> = {}) {
  return {
    auth: overrides.auth !== undefined ? overrides.auth : { uid: OWNER, token: {} },
    data: overrides.data !== undefined ? overrides.data : { loanId: LOAN_ID },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  ownershipOf.mockResolvedValue(OWNERSHIP)
  assessmentFor.mockResolvedValue(null)
  gatherFacts.mockResolvedValue(FACTS)
  assessLoanWithAgent.mockResolvedValue({ status: 'ok', assessment: READING })
  saveAssessment.mockResolvedValue(STORED)
  claimAssessment.mockResolvedValue({ granted: true, used: 1, cap: 50 })
  releaseAssessment.mockResolvedValue(undefined)
  Contract.mockImplementation(() => ({ totalFunds: jest.fn().mockResolvedValue(200_000_000n) }))
  getProvider.mockReturnValue({ getBlock: jest.fn().mockResolvedValue({ timestamp: 1_800_000_000 }) })
})

describe('assessLoan', () => {
  it('reads the request and stores what it made of it', async () => {
    const result = await assessLoanHandler(buildRequest())

    expect(result).toEqual({ assessment: STORED, cached: false })
    expect(assessLoanWithAgent).toHaveBeenCalledWith(FACTS.facts)
  })

  it('refuses an unauthenticated caller', async () => {
    await expect(assessLoanHandler(buildRequest({ auth: null }))).rejects.toThrow(/authenticated/i)
  })

  /*
    Narrower than a note, deliberately. A note is a sentence a person stood
    behind, so the person it is about deserves to read it; this is a machine's
    reading of somebody's record, and showing it to them turns a lending
    decision into an argument with a model nobody can answer for.
  */
  it('refuses anybody but the pool’s owner', async () => {
    await expect(assessLoanHandler(buildRequest({ auth: { uid: BORROWER } }))).rejects.toThrow(/only the pool/i)
  })

  // The order matters when the expensive half costs money.
  it('checks entitlement before reading the chain or asking a model', async () => {
    await expect(assessLoanHandler(buildRequest({ auth: { uid: BORROWER } }))).rejects.toThrow()

    expect(getProvider).not.toHaveBeenCalled()
    expect(assessLoanWithAgent).not.toHaveBeenCalled()
  })

  it('refuses a loan nobody has indexed', async () => {
    ownershipOf.mockResolvedValue(null)

    await expect(assessLoanHandler(buildRequest())).rejects.toThrow(/no indexed loan/i)
  })

  it('refuses a call that names no loan', async () => {
    await expect(assessLoanHandler(buildRequest({ data: {} }))).rejects.toThrow(/loan id is required/i)
  })

  // Guessing an exponent here would be the only place in the project that did,
  // and it would describe 5 USDC to the model as five million million.
  it('will not price a pool whose token the backend could not read', async () => {
    ownershipOf.mockResolvedValue({ ...OWNERSHIP, denomination: undefined })

    await expect(assessLoanHandler(buildRequest())).resolves.toEqual({ unavailable: 'unsupported-denomination', cached: false })
    expect(getProvider).not.toHaveBeenCalled()
    expect(assessLoanWithAgent).not.toHaveBeenCalled()
  })

  // An LLM judgement is not reproducible, so a decision surface that recomputed
  // on every open would say something different each time.
  it('reads a stored assessment back rather than making a new one', async () => {
    assessmentFor.mockResolvedValue(STORED)

    const result = await assessLoanHandler(buildRequest())

    expect(result).toEqual({ assessment: STORED, cached: true })
    expect(assessLoanWithAgent).not.toHaveBeenCalled()
  })

  it('makes a new one when the owner asks for it', async () => {
    assessmentFor.mockResolvedValue(STORED)

    const result = await assessLoanHandler(buildRequest({ data: { loanId: LOAN_ID, refresh: true } }))

    expect(result.cached).toBe(false)
    expect(assessLoanWithAgent).toHaveBeenCalled()
  })

  // `approveLoan` checks liquidity at approval rather than at request time, so
  // a reading taken when the pool held 200 describes a pool that no longer
  // exists once it holds 5.
  it('makes a new one when the pool has moved under it', async () => {
    assessmentFor.mockResolvedValue(STORED)
    Contract.mockImplementation(() => ({ totalFunds: jest.fn().mockResolvedValue(5_000_000n) }))

    const result = await assessLoanHandler(buildRequest())

    expect(result.cached).toBe(false)
    expect(assessLoanWithAgent).toHaveBeenCalled()
  })

  it('records what it was told, so a surprising reading can be explained', async () => {
    await assessLoanHandler(buildRequest())

    expect(saveAssessment).toHaveBeenCalledWith(
      expect.objectContaining({
        inputs: { amount: 50, liquidity: 200, symbol: 'USDC', hadPurpose: false, borrower: HISTORY },
      }),
      expect.anything()
    )
  })

  // Whether one was stated, never the text. The purpose is a note and lives in
  // `notes`; copying it here would give it a second home nothing keeps in step.
  it('records that a purpose existed without copying it', async () => {
    gatherFacts.mockResolvedValue({ ...FACTS, facts: { ...FACTS.facts, request: { ...FACTS.facts.request, purpose: 'School fees.' } } })

    await assessLoanHandler(buildRequest())

    const inputs = saveAssessment.mock.calls[0][0].inputs
    expect(inputs.hadPurpose).toBe(true)
    expect(JSON.stringify(inputs)).not.toContain('School fees')
  })

  /*
    The agent is an optional dependency and its absence is not a failure: this
    queue worked before any of it existed and has to keep working while it is
    down.
  */
  it('says there is no assessment rather than failing when the agent is absent', async () => {
    assessLoanWithAgent.mockResolvedValue({ status: 'not-configured' })

    await expect(assessLoanHandler(buildRequest())).resolves.toEqual({ unavailable: 'not-configured', cached: false })
  })

  it('says the same when the agent is unreachable, and stores nothing', async () => {
    assessLoanWithAgent.mockResolvedValue({ status: 'unreachable', reason: 'fetch failed' })

    await expect(assessLoanHandler(buildRequest())).resolves.toEqual({ unavailable: 'unreachable', cached: false })
    expect(saveAssessment).not.toHaveBeenCalled()
  })

  // The better of two silences: a reading from last week beats none, as long
  // as the response says which it is.
  it('falls back to the stored reading when a refresh cannot be made', async () => {
    assessmentFor.mockResolvedValue(STORED)
    assessLoanWithAgent.mockResolvedValue({ status: 'unreachable', reason: 'fetch failed' })

    const result = await assessLoanHandler(buildRequest({ data: { loanId: LOAN_ID, refresh: true } }))

    expect(result).toEqual({ assessment: STORED, unavailable: 'unreachable', cached: true })
  })

  it('reports an unreachable chain as an internal error rather than guessing liquidity', async () => {
    getProvider.mockReturnValue({ getBlock: jest.fn().mockResolvedValue(null) })

    await expect(assessLoanHandler(buildRequest())).rejects.toThrow(/Failed to assess/i)
  })
})

// ---------------------------------------------------------------------------
// The daily cap.
//
// This is the one callable that spends money on somebody else's behalf, and
// the queue asks for a reading per undecided request the first time it opens.
// ---------------------------------------------------------------------------

describe('the daily cap', () => {
  it('takes one off the day before asking a model', async () => {
    await assessLoanHandler(buildRequest())

    expect(claimAssessment).toHaveBeenCalledWith(OWNER.toLowerCase(), expect.anything())
    expect(claimAssessment.mock.invocationCallOrder[0]).toBeLessThan(assessLoanWithAgent.mock.invocationCallOrder[0])
  })

  it('says not today, rather than not available', async () => {
    claimAssessment.mockResolvedValue({ granted: false, used: 50, cap: 50 })

    await expect(assessLoanHandler(buildRequest())).resolves.toEqual({ unavailable: 'quota-reached', cached: false })
    expect(assessLoanWithAgent).not.toHaveBeenCalled()
  })

  it('still hands back a stored reading when the day is spent', async () => {
    assessmentFor.mockResolvedValue(STORED)
    claimAssessment.mockResolvedValue({ granted: false, used: 50, cap: 50 })

    await expect(assessLoanHandler(buildRequest({ data: { loanId: LOAN_ID, refresh: true } }))).resolves.toEqual({
      assessment: STORED,
      unavailable: 'quota-reached',
      cached: true,
    })
  })

  /*
    Everything before the claim is free — a stored reading, an unpriceable
    pool, an unentitled caller — and none of it should cost anybody a day's
    allowance.
  */
  it('costs nothing to read a stored one back', async () => {
    assessmentFor.mockResolvedValue(STORED)

    await assessLoanHandler(buildRequest())

    expect(claimAssessment).not.toHaveBeenCalled()
  })

  it('costs nothing to be refused', async () => {
    await expect(assessLoanHandler(buildRequest({ auth: { uid: BORROWER } }))).rejects.toThrow()

    expect(claimAssessment).not.toHaveBeenCalled()
  })

  it('costs nothing when the pool cannot be priced', async () => {
    ownershipOf.mockResolvedValue({ ...OWNERSHIP, denomination: undefined })

    await assessLoanHandler(buildRequest())

    expect(claimAssessment).not.toHaveBeenCalled()
  })

  // Nothing was read, so nothing was spent.
  it('gives the claim back when the agent never answered', async () => {
    assessLoanWithAgent.mockResolvedValue({ status: 'unreachable', reason: 'fetch failed' })

    await assessLoanHandler(buildRequest())

    expect(releaseAssessment).toHaveBeenCalledWith(OWNER.toLowerCase(), expect.anything())
  })

  it('keeps the claim when a reading was actually made', async () => {
    await assessLoanHandler(buildRequest())

    expect(releaseAssessment).not.toHaveBeenCalled()
  })
})

describe('getAssessment', () => {
  it('gives the owner what is stored', async () => {
    assessmentFor.mockResolvedValue(STORED)

    await expect(getAssessmentHandler(buildRequest())).resolves.toEqual({ assessment: STORED })
  })

  it('refuses an unauthenticated caller', async () => {
    await expect(getAssessmentHandler(buildRequest({ auth: null }))).rejects.toThrow(/authenticated/i)
  })

  /*
    Nothing, rather than a refusal — the same shape `listNotes` uses. An error
    would confirm that an assessment exists, which is itself something the
    caller is not entitled to know.
  */
  it('shows the borrower nothing, and does not tell them why', async () => {
    assessmentFor.mockResolvedValue(STORED)

    await expect(getAssessmentHandler(buildRequest({ auth: { uid: BORROWER } }))).resolves.toEqual({})
  })

  it('answers empty when nobody has asked for one yet', async () => {
    await expect(getAssessmentHandler(buildRequest())).resolves.toEqual({})
  })

  it('never makes one', async () => {
    await getAssessmentHandler(buildRequest())

    expect(assessLoanWithAgent).not.toHaveBeenCalled()
  })
})

// A module, not a script: this file uses `require` so that `jest.mock` hoists
// above it, and without an export the test globals would collide with every
// other callable test in the project.
export {}
