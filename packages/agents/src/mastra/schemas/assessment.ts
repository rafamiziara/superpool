import { z } from 'zod'

/**
 * The contract between the backend and the assessment agent.
 *
 * The **input** schema is the whole of it: this service is sent facts and
 * returns a judgement, and it fetches nothing. Mastra validates the input at
 * the HTTP boundary, so a backend that sends the wrong shape is refused there
 * rather than producing a confident answer about missing data.
 *
 * Every figure arrives in **whole units of the pool's own asset**, already
 * formatted by the backend — never in wei, and never with the exponent left
 * for this side to apply. A pool's denomination is a three-way question
 * (native / token / unreadable) and the rule for it lives in one place; a
 * model re-deriving it would be a factor-of-10^12 bug in a sentence somebody
 * lends money on.
 */

/** At most one screenful. Mirrors `NOTE_MAX_LENGTH` in `@superpool/types`. */
const MAX_PURPOSE_LENGTH = 280

export const assessmentFactsSchema = z.object({
  request: z.object({
    amount: z.number().positive().describe("How much is being asked for, in whole units of the pool's asset"),
    termDays: z.number().positive().describe('The pool’s loan term, in days'),
    interestRatePercent: z.number().min(0).describe('The pool’s rate for one full term, as a percentage'),
    repaymentTotal: z.number().positive().describe('What the borrower repays if they hold the loan the full term'),
    purpose: z
      .string()
      .max(MAX_PURPOSE_LENGTH)
      .optional()
      .describe('What the borrower said the money is for. Optional by design — absent is ordinary and is not evidence of anything.'),
  }),
  pool: z.object({
    name: z.string().describe('What the members call this pool'),
    symbol: z.string().describe('What the pool lends, e.g. POL or USDC'),
    liquidity: z.number().min(0).describe('Available to lend right now, in whole units'),
    maxLoanAmount: z.number().positive().describe('The most this pool will lend at once, in whole units'),
    pendingRequests: z.number().int().min(0).describe('Requests waiting on the owner, this one included'),
  }),
  /**
   * The borrower's whole record on this chain, as `BorrowerHistory` in
   * `@superpool/types` — counts, never a score.
   *
   * Duplicated here as Zod rather than imported: this schema is the wire
   * contract, and a shared type would not validate the wire anyway. The
   * backend fills it from `borrowerHistoriesFor`.
   */
  borrower: z.object({
    isNew: z.boolean().describe('True when this wallet has never borrowed. Means new, never bad.'),
    total: z.number().int().min(0).describe('Loans actually disbursed'),
    repaid: z.number().int().min(0).describe('Of those, the ones settled'),
    onTime: z.number().int().min(0).describe('Settled on or before the due date'),
    late: z.number().int().min(0).describe('Settled after it'),
    undated: z.number().int().min(0).describe('Settled, but with no date recorded — neither on time nor late'),
    outstanding: z.number().int().min(0).describe('Still owed'),
    overdue: z.number().int().min(0).describe('Still owed and past the due date'),
    defaulted: z.number().int().min(0).describe('Loans a pool owner declared in default, settled or not'),
  }),
})

export type AssessmentFacts = z.infer<typeof assessmentFactsSchema>

/**
 * What the assessment may say.
 *
 * Shaped to make the things this feature must not do unrepresentable rather
 * than merely discouraged — see `.dev/old/AI_ASSESSMENT_PLAN.md` §5:
 *
 * - **Three bands and no number.** A 0–100 score invites arithmetic nobody
 *   validated, reads as a credit rating, and can be thresholded into a gate.
 *   Bands say what they mean and cannot be averaged or sorted into one.
 * - **No recommendation field.** The model does not say approve or decline. It
 *   says what it notices; the button belongs to the pool's owner, and a
 *   `recommendation` field is one product decision away from being the button.
 * - **`questions` rather than a conversation.** The owner asks the *borrower*,
 *   which is the exchange that should be happening — there is deliberately no
 *   chat with the assistant.
 * - **`limitations` is required.** An assessment that never says what it could
 *   not see reads as complete.
 *
 * **The counts are validated; the lengths are not**, and the eval suite is why.
 * A `.max(140)` on each observation looked harmless and cost a whole reading
 * the first time a model wrote 141 characters: structured-output validation
 * rejects the entire response, so `assessLoan` reports "no assessment
 * available" and the owner sees nothing — for a reading that was perfectly
 * good. Brevity is a preference and belongs in the instructions; a validation
 * rule is a thing that throws away work. Array counts stay because they are
 * structural and a model obeys them reliably.
 */
export const assessmentSchema = z.object({
  risk: z.enum(['low', 'medium', 'high']).describe('A band, never a score'),
  summary: z.string().describe('One sentence the owner reads first'),
  observations: z.array(z.string()).max(4).describe('What a careful reader would notice. Fewer is better than padded.'),
  questions: z.array(z.string()).max(3).describe('Worth asking the borrower before deciding. Empty when there is nothing to ask.'),
  limitations: z.array(z.string()).max(3).describe('What you could not see. Honest gaps, not hedging.'),
})

export type Assessment = z.infer<typeof assessmentSchema>
