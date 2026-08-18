import type { Assessment } from '../schemas/assessment'

/**
 * What a case expects of the reading it produces.
 *
 * Deliberately loose: an eval that pinned the exact band on every case would
 * fail on a model that got *better*, and one that asserted wording would fail
 * on a rephrase. What is asserted is what must never change — a first-time
 * borrower is not high risk, a shortfall is noticed, nothing is said about the
 * person.
 */
export interface Expectation {
  /** Bands that are acceptable. A case usually allows two of the three. */
  allowedRisk: Assessment['risk'][]
  /**
   * Patterns the reading must match somewhere in its prose.
   *
   * Regexes rather than exact strings, because the assertion is that the model
   * *noticed* something, not that it phrased it a particular way.
   */
  mustMention?: RegExp[]
  /** Why this case exists, printed with a failure so nobody has to guess. */
  because: string
}

/** Everything the reading said, as one string, for pattern checks. */
export function proseOf(assessment: Assessment): string {
  return [assessment.summary, ...assessment.observations, ...assessment.questions, ...assessment.limitations].join('\n')
}

/**
 * Numbers that would be a score in disguise.
 *
 * Three bands exist so nothing can be thresholded into a gate. "70% of the
 * pool" is a fact about the request and fine; "70% likely to repay" is the
 * thing the schema was shaped to prevent, so the pattern is deliberately about
 * what the number is *about*.
 */
export const SCORE_LIKE = /\b\d{1,3}\s*(?:\/\s*(?:10|100)\b|%\s*(?:risk|confiden|likel|probab|chance|certain))/i
