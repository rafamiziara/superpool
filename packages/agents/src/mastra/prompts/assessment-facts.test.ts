import type { AssessmentFacts } from '../schemas/assessment'
import { describeFacts } from './assessment-facts'

function facts(overrides: Partial<AssessmentFacts> = {}): AssessmentFacts {
  return {
    request: { amount: 50, termDays: 30, interestRatePercent: 5, repaymentTotal: 52.5, ...overrides.request },
    pool: { name: 'Neighbours', symbol: 'USDC', liquidity: 200, maxLoanAmount: 100, pendingRequests: 1, ...overrides.pool },
    borrower: {
      isNew: false,
      total: 4,
      repaid: 3,
      onTime: 3,
      late: 0,
      undated: 0,
      outstanding: 1,
      overdue: 0,
      defaulted: 0,
      ...overrides.borrower,
    },
  }
}

describe('describeFacts', () => {
  it('names every figure in the pool’s own unit', () => {
    const prompt = describeFacts(facts())

    expect(prompt).toContain('50 USDC, over 30 days at 5% for the full term')
    expect(prompt).toContain('They repay 52.5 USDC')
    expect(prompt).toContain('Its cap for a single loan is 100 USDC')
  })

  // Arithmetic, and the figure the band most often turns on. Left to the model
  // it could come out wrong; here it cannot.
  it('works out what share of the pool is being asked for', () => {
    expect(describeFacts(facts())).toContain('this request is about 25% of it')
  })

  // "0% of it" would read as though the request were negligible, which is the
  // opposite of what an empty pool means.
  it('says an empty pool cannot cover anything rather than dividing by zero', () => {
    const prompt = describeFacts(facts({ pool: { ...facts().pool, liquidity: 0 } }))

    expect(prompt).toContain('nothing to lend right now')
    // Specifically no *share* of the pool. The interest rate is a percentage
    // too, and asserting on the character alone would pass for the wrong reason.
    expect(prompt).not.toContain('% of it')
  })

  it('quotes the purpose when there is one', () => {
    const prompt = describeFacts(facts({ request: { ...facts().request, purpose: 'School fees.' } }))

    expect(prompt).toContain('They said it is for: "School fees."')
  })

  // A prompt that implied otherwise would have the model counting silence as
  // evidence about the borrower.
  it('says a missing purpose is optional, not withheld', () => {
    const prompt = describeFacts(facts())

    expect(prompt).toContain('Saying is optional here, so this is not a refusal to answer')
  })

  // The single most likely failure mode of the whole feature: a column of
  // zeroes reads as a terrible record rather than as no record.
  it('describes a first-time borrower in words, never as zeroes', () => {
    const prompt = describeFacts(facts({ borrower: { ...facts().borrower, isNew: true } }))

    expect(prompt).toContain('first-time borrower')
    expect(prompt).not.toContain('Loans taken:')
  })

  it('lays out a real record so each count is unambiguous', () => {
    const prompt = describeFacts(
      facts({ borrower: { isNew: false, total: 5, repaid: 4, onTime: 2, late: 1, undated: 1, outstanding: 1, overdue: 1, defaulted: 1 } })
    )

    expect(prompt).toContain('Loans taken: 5. Settled: 4.')
    expect(prompt).toContain('on time: 2, late: 1, no date recorded: 1')
    expect(prompt).toContain('Still owed: 1, of which past their due date right now: 1')
    expect(prompt).toContain('Declared in default by a pool owner at some point: 1')
  })

  // The owner reads in this order, and the model should too.
  it('puts the request before the pool and the pool before the borrower', () => {
    const prompt = describeFacts(facts())

    expect(prompt.indexOf('## The request')).toBeLessThan(prompt.indexOf('## The pool'))
    expect(prompt.indexOf('## The pool')).toBeLessThan(prompt.indexOf('## The borrower'))
  })

  // Nothing about who the borrower is ever reaches this prompt, because
  // nothing about who they are is in the facts. Worth asserting rather than
  // assuming: an address would be an invitation to infer.
  it('carries no wallet address', () => {
    expect(describeFacts(facts())).not.toMatch(/0x[0-9a-fA-F]{6}/)
  })
})
