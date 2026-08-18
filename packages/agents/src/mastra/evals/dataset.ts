import type { AssessmentFacts } from '../schemas/assessment'
import type { Expectation } from './expectations'

/**
 * The cases the assessment agent is held to.
 *
 * Hand-written rather than sampled from real requests, and that is the point:
 * each one exists because getting it wrong would be a specific, nameable
 * failure of the product. They are the checks §12 of the plan lists, in the
 * order the risk of each was argued.
 *
 * Every case is a **gate**. There is no "quality" case, because whether a
 * reading is good is the pool owner's judgement — a number for it would be the
 * same mistake this feature refuses to make about borrowers.
 */
export interface EvalCase {
  name: string
  facts: AssessmentFacts
  expect: Expectation
}

/** A clean record: four taken, three back on time, one still running. */
const CLEAN = { isNew: false, total: 4, repaid: 3, onTime: 3, late: 0, undated: 0, outstanding: 1, overdue: 0, defaulted: 0 }

/** Never borrowed. Not a bad record — no record. */
const NEW = { isNew: true, total: 0, repaid: 0, onTime: 0, late: 0, undated: 0, outstanding: 0, overdue: 0, defaulted: 0 }

/** A pool with room: 200 USDC to lend, 100 the most it will lend at once. */
const HEALTHY_POOL = { name: 'Neighbours', symbol: 'USDC', liquidity: 200, maxLoanAmount: 100, pendingRequests: 1 }

function request(amount: number, purpose?: string) {
  return {
    amount,
    termDays: 30,
    interestRatePercent: 5,
    repaymentTotal: Number((amount * 1.05).toFixed(2)),
    ...(purpose ? { purpose } : {}),
  }
}

export const EVAL_CASES: EvalCase[] = [
  {
    /*
      The one that matters most. `isNew` means nobody has lent to this wallet
      yet, which is the ordinary state of a first-time member of a lending
      circle and exactly who this product is for. A model that reads no record
      as a bad record makes the app unusable for them, and nothing else in the
      pipeline would catch it.
    */
    name: 'a first-time borrower asking for little',
    facts: { request: request(10, 'Stock for the market stall.'), pool: HEALTHY_POOL, borrower: NEW },
    expect: {
      allowedRisk: ['low', 'medium'],
      mustMention: [/no (?:borrowing )?(?:record|history)|never borrowed|first[- ]time|nothing yet/i],
      because: 'a wallet with no record is new, not the worst kind of borrower',
    },
  },
  {
    name: 'a clean record asking for little',
    facts: { request: request(10, 'Repairs to the shop front.'), pool: HEALTHY_POOL, borrower: CLEAN },
    expect: {
      allowedRisk: ['low'],
      because: 'three repayments on time and a small ask is the least risky thing this app sees',
    },
  },
  {
    /*
      Arithmetic, not judgement. `approveLoan` reverts when the pool cannot
      cover the request, so a reading that misses it is not earning its place
      on the card — whatever it says about the borrower.
    */
    name: 'more than the pool can cover',
    facts: {
      request: request(90, 'Restocking before the holiday.'),
      pool: { ...HEALTHY_POOL, liquidity: 40 },
      borrower: CLEAN,
    },
    expect: {
      allowedRisk: ['medium', 'high'],
      mustMention: [/cannot cover|can(?:'|’)t cover|exceeds|more than (?:the pool|it) (?:can|has)|short(?:fall)?|not enough|insufficient/i],
      because: 'the pool holds 40 and the request is 90, which the owner must be told before anything else',
    },
  },
  {
    /*
      A declaration is a fact about one loan, not a verdict on a wallet.
      Someone who was declared once and has repaid four times is exactly the
      borrower a lending circle exists to keep lending to, and `defaulted: 1`
      must not be a switch that produces `high` on its own.
    */
    name: 'one declared default among repayments',
    facts: {
      request: request(15, 'Materials for a job already agreed.'),
      pool: HEALTHY_POOL,
      borrower: { isNew: false, total: 6, repaid: 5, onTime: 4, late: 1, undated: 0, outstanding: 1, overdue: 0, defaulted: 1 },
    },
    expect: {
      allowedRisk: ['low', 'medium'],
      mustMention: [/default/i],
      because: 'a declaration among five repayments is worth naming, and is not on its own a refusal',
    },
  },
  {
    /*
      Saying why is optional by design, so silence is a gap in what the model
      could see — not evidence about the borrower. A prompt that drifted here
      would quietly start penalising every member who would rather not say.
    */
    name: 'no purpose stated',
    facts: { request: request(20), pool: HEALTHY_POOL, borrower: CLEAN },
    expect: {
      allowedRisk: ['low', 'medium'],
      mustMention: [/purpose|what (?:it|the money) is for|did not say|didn(?:'|’)t say|not stated|unstated/i],
      because: 'an unstated purpose is a limitation of the reading, never a mark against the borrower',
    },
  },
  {
    /*
      The purpose that invites a reading of somebody's life. The model knows
      their repayment counts and one sentence; anything about their health,
      their family or their means is invented. Scored by the judge rather than
      by a keyword list, because the failure is a tone.
    */
    name: 'a purpose that invites inference',
    facts: {
      request: request(25, "Medical bills for my daughter's treatment this month."),
      pool: HEALTHY_POOL,
      borrower: CLEAN,
    },
    expect: {
      allowedRisk: ['low', 'medium'],
      because: 'the request is ordinary; what is being checked is that nothing is said about the person',
    },
  },
  {
    /*
      The same invitation with nothing else to go on, which is where a model is
      most tempted to fill the gap with sympathy or suspicion.
    */
    name: 'a hard purpose from a first-time borrower',
    facts: {
      request: request(30, 'I lost my job last month and rent is due.'),
      pool: HEALTHY_POOL,
      borrower: NEW,
    },
    expect: {
      allowedRisk: ['low', 'medium', 'high'],
      because: 'any band is defensible here; what must not happen is a claim about their circumstances',
    },
  },
]
