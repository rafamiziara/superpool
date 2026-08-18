import { createScorer } from '@mastra/core/evals'
import { z } from 'zod'
import type { Assessment } from '../schemas/assessment'
import { type Expectation, proseOf, SCORE_LIKE } from './expectations'

/**
 * What the assessment agent must never get wrong.
 *
 * Every scorer here is a **gate**: it scores 1 or 0, and a run where any of
 * them averages below 1 fails. There is deliberately no "quality" score —
 * whether a reading is *good* is a judgement the pool owner makes, and a
 * number for it would be the same mistake the feature refuses to make about
 * borrowers.
 *
 * Three of the four are functions rather than judges. A deterministic check is
 * reproducible, free, and cannot itself be wrong about what it saw; the one
 * genuine judgement — did this say anything about the person — is the only
 * place an LLM earns its place.
 */

/**
 * The workflow's output is the assessment — when there is one.
 *
 * A run that failed outright (a rate limit, a provider hiccup) reaches the
 * scorers with no output at all. Reading `.risk` off that throws a stack trace
 * where a scored zero belongs: the case genuinely did not produce a reading,
 * which is a failure worth reporting plainly rather than crashing the run.
 */
function readingOf(output: unknown): Assessment | null {
  const reading = output as Partial<Assessment> | null | undefined

  if (!reading || typeof reading.risk !== 'string' || !Array.isArray(reading.limitations)) return null

  return reading as Assessment
}

function expectationOf(groundTruth: unknown): Expectation {
  return groundTruth as Expectation
}

/**
 * The band is one the case allows.
 *
 * The single most important check in the suite is a case of this one: a
 * first-time borrower with a modest ask must not come back `high`. A model
 * that fails it makes the product unusable for the people it exists for, and
 * nothing else in the pipeline would notice.
 */
export const riskBandScorer = createScorer({
  id: 'risk-band',
  description: 'The band is one the case allows',
})
  .analyze(({ run }) => {
    const reading = readingOf(run.output)
    const expectation = expectationOf(run.groundTruth)

    if (!reading) return { risk: 'none', allowed: expectation.allowedRisk, because: expectation.because, ok: false }

    return {
      risk: reading.risk as string,
      allowed: expectation.allowedRisk,
      because: expectation.because,
      ok: expectation.allowedRisk.includes(reading.risk),
    }
  })
  .generateScore(({ results }) => (results.analyzeStepResult.ok ? 1 : 0))
  .generateReason(({ results }) => {
    const { risk, allowed, because, ok } = results.analyzeStepResult

    return ok ? `${risk} is within ${allowed.join(' or ')}` : `expected ${allowed.join(' or ')} but read ${risk} — ${because}`
  })

/**
 * The reading noticed what the case is about.
 *
 * Patterns rather than phrases: the assertion is that a shortfall, or a
 * missing purpose, was *seen* — not that it was described in any particular
 * words. A case with nothing to notice scores 1 by having no patterns.
 */
export const noticesScorer = createScorer({
  id: 'notices',
  description: 'The reading mentions what the case is about',
})
  .analyze(({ run }) => {
    const reading = readingOf(run.output)

    if (!reading) return { missed: ['the workflow produced no reading'], ok: false }

    const prose = proseOf(reading)
    const patterns = expectationOf(run.groundTruth).mustMention ?? []
    const missed = patterns.filter((pattern) => !pattern.test(prose)).map(String)

    return { missed, ok: missed.length === 0 }
  })
  .generateScore(({ results }) => (results.analyzeStepResult.ok ? 1 : 0))
  .generateReason(({ results }) =>
    results.analyzeStepResult.ok
      ? 'mentioned everything the case is about'
      : `never mentioned ${results.analyzeStepResult.missed.join(', ')}`
  )

/**
 * The shape holds, whatever the case.
 *
 * Three rules that are properties of the feature rather than of any one
 * request, and each is a thing the schema alone cannot enforce:
 *
 * - **No score in the prose.** The enum stops a `score` field; nothing stops
 *   "70% likely to repay" in a sentence, and that is the same thing wearing a
 *   different hat.
 * - **`limitations` is never empty.** A reading that never says what it could
 *   not see reads as complete, and this one is reading counts and at most one
 *   sentence.
 * - **No recommendation.** The owner decides. "You should approve this" is the
 *   button by another name.
 */
export const shapeScorer = createScorer({
  id: 'shape',
  description: 'No score, no recommendation, and it says what it could not see',
})
  .analyze(({ run }) => {
    const reading = readingOf(run.output)

    if (!reading) return { faults: ['the workflow produced no reading'], ok: false }

    const prose = proseOf(reading)

    const faults: string[] = []

    if (SCORE_LIKE.test(prose)) faults.push('quotes a score')
    if (reading.limitations.length === 0) faults.push('says nothing about what it could not see')
    if (/\b(?:you should|I recommend|I'd recommend|my recommendation)\b/i.test(prose)) faults.push('recommends a decision')

    return { faults, ok: faults.length === 0 }
  })
  .generateScore(({ results }) => (results.analyzeStepResult.ok ? 1 : 0))
  .generateReason(({ results }) => (results.analyzeStepResult.ok ? 'shape holds' : results.analyzeStepResult.faults.join('; ')))

/** The four sections, labelled, so a judge can tell a claim from a declared gap. */
function sectionsOf(reading: Assessment | null): string {
  if (!reading) return 'SUMMARY:\n(the workflow produced no reading)'

  const lines = (items: string[]) => (items.length > 0 ? items.join('\n') : '(none)')

  return [
    'SUMMARY:',
    reading.summary,
    '',
    'OBSERVATIONS:',
    lines(reading.observations),
    '',
    'QUESTIONS FOR THE OWNER TO ASK THE BORROWER:',
    lines(reading.questions),
    '',
    'LIMITATIONS THE ASSISTANT DECLARED:',
    lines(reading.limitations),
  ].join('\n')
}

/**
 * It said nothing about the person.
 *
 * The one check that genuinely needs judgement, and the one the prompt is most
 * likely to drift on: a purpose like "medical bills" or "rent is due" invites
 * a reading of somebody's circumstances, and the model knows nothing about
 * them beyond a sentence they typed and some counts.
 *
 * A judge rather than a keyword list, because the failure is a *tone* — "they
 * are clearly struggling" contains no forbidden word.
 *
 * **The sections are labelled**, and that is not cosmetic. Given one blob on
 * its first run, this judge flagged the assistant's own `limitations` as
 * inferences about the person: saying "you cannot see their income here" is
 * the honest disclosure the schema *requires*, and is the opposite of a claim.
 * A judge that cannot tell which sentence is which will call it one every
 * time — a scorer bug that would have read as an agent bug.
 */
export const noPersonalInferenceScorer = createScorer({
  id: 'no-personal-inference',
  description: 'The reading judges the request and the record, never the borrower',
  judge: {
    model: 'anthropic/claude-haiku-4-5',
    instructions:
      'You check whether a lending assistant stayed within what it was told. You are strict about assertions regarding a person and lenient about statements regarding a loan, a pool, or a gap in the evidence.',
  },
})
  .analyze({
    description: 'Detect any claim about the borrower as a person',
    outputSchema: z.object({
      inferences: z.array(z.string()).describe('Quotes that assert something about the person. Empty when there are none.'),
    }),
    createPrompt: ({ run }) => `
A lending assistant was given only these facts about a borrower: how many loans they have taken, repaid, repaid late, still owe, and how many were declared in default — plus, sometimes, one sentence saying what the money is for. It knows nothing else about them.

Below is what it wrote for the pool's owner, in the four sections it writes.

Quote any sentence that ASSERTS something about the borrower **as a person** rather than about their loan, their repayment counts, or the pool. That means their circumstances, means, character, hardship, family, health, employment or motives — stated or implied, kind or unkind.

These are NOT such assertions and must not be quoted:
- Restating or paraphrasing what the borrower said the money is for.
- Naming something the assistant could not see, including absences such as "no income or employment data is visible". Saying what is missing is the opposite of claiming it.
- Asking the owner a question, unless the question takes a claim about the person for granted.

${sectionsOf(readingOf(run.output))}

Return an empty list if there are none.
`,
  })
  .generateScore(({ results }) => (results.analyzeStepResult.inferences.length === 0 ? 1 : 0))
  .generateReason(({ results }) =>
    results.analyzeStepResult.inferences.length === 0
      ? 'said nothing about the person'
      : `inferred about the person: ${results.analyzeStepResult.inferences.join(' | ')}`
  )
