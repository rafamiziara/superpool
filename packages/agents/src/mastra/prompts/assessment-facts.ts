import type { AssessmentFacts } from '../schemas/assessment'

/**
 * The facts, as the model reads them.
 *
 * Its own module, importing nothing but a type: this is the half of the prompt
 * that can be wrong in a way no eval would notice — a mislabelled figure reads
 * perfectly and is simply about the wrong thing — so it is kept testable
 * without a model, a server or a key.
 *
 * Prose rather than the raw JSON, in the order an owner thinks in: what is
 * being asked for, what the pool can afford, who is asking.
 */
export function describeFacts(facts: AssessmentFacts): string {
  const { request, pool, borrower } = facts

  return [
    '## The request',
    `${request.amount} ${pool.symbol}, over ${request.termDays} days at ${request.interestRatePercent}% for the full term.`,
    `They repay ${request.repaymentTotal} ${pool.symbol} if they hold it the whole term; less if they repay sooner, more if they run past it.`,
    describePurpose(request.purpose),
    '',
    '## The pool',
    `"${pool.name}" lends ${pool.symbol}.`,
    describeCapacity(request.amount, pool.liquidity, pool.symbol),
    `Its cap for a single loan is ${pool.maxLoanAmount} ${pool.symbol}.`,
    `Requests waiting on the owner, this one included: ${pool.pendingRequests}.`,
    '',
    '## The borrower’s record on this chain',
    describeRecord(borrower),
  ].join('\n')
}

/**
 * Absent is ordinary, and the wording has to say so.
 *
 * "They did not say" on its own reads as a withheld answer. Stating a purpose
 * is optional by design, and a prompt that implies otherwise would have the
 * model counting silence as evidence.
 */
function describePurpose(purpose: string | undefined): string {
  if (!purpose) return 'They did not say what it is for. Saying is optional here, so this is not a refusal to answer.'

  return `They said it is for: "${purpose}"`
}

/**
 * What the pool can afford, and what share of it this request is.
 *
 * The percentage is computed here rather than left to the model. It is
 * arithmetic, it is the figure the band most often turns on, and this is the
 * one place it cannot come out wrong.
 *
 * An empty pool gets a sentence of its own instead of a division by zero — and
 * "0% of it" would have been the worst of both, reading as though the request
 * were negligible.
 */
function describeCapacity(amount: number, liquidity: number, symbol: string): string {
  if (liquidity <= 0) return `It has nothing to lend right now, so it cannot cover this request at all.`

  const share = Math.round((amount / liquidity) * 100)

  return `It can lend ${liquidity} ${symbol} right now, so this request is about ${share}% of it.`
}

/**
 * The record, or the plain fact that there is not one.
 *
 * A wallet that has never borrowed gets a sentence, never a column of zeroes.
 * Zeroes invite the reading this product cannot survive — that a first-time
 * borrower is the worst kind — and the instructions say so too. Saying it in
 * both places is deliberate.
 */
function describeRecord(borrower: AssessmentFacts['borrower']): string {
  if (borrower.isNew)
    return 'This wallet has never borrowed from any pool on this chain. There is no record yet — this is a first-time borrower.'

  return [
    `Loans taken: ${borrower.total}. Settled: ${borrower.repaid}.`,
    `Of those settled — on time: ${borrower.onTime}, late: ${borrower.late}, no date recorded: ${borrower.undated}.`,
    `Still owed: ${borrower.outstanding}, of which past their due date right now: ${borrower.overdue}.`,
    `Declared in default by a pool owner at some point: ${borrower.defaulted}.`,
  ].join('\n')
}
