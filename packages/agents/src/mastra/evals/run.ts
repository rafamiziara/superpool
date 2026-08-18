import * as dotenv from 'dotenv'
dotenv.config()

import { runEvals } from '@mastra/core/evals'
import { assessLoanWorkflow } from '../workflows/assess-loan'
import { EVAL_CASES } from './dataset'
import { noPersonalInferenceScorer, noticesScorer, riskBandScorer, shapeScorer } from './scorers'

/**
 * Run the assessment agent against every case it must not get wrong.
 *
 * `pnpm --filter agents eval`. **It spends money** — one model call per case,
 * plus a judge call for the inference check — which is why it is a script
 * rather than part of `pnpm test`.
 *
 * Every scorer is a **gate**: a case that misses one fails the run. There is
 * no quality score, deliberately. Whether a reading is *good* is the pool
 * owner's judgement, and a number for it would be the same mistake this
 * feature refuses to make about borrowers.
 *
 * The target is the **workflow**, not the agent, because the workflow is what
 * the backend calls — so the prompt these cases exercise is the one that
 * actually ships, facts block and all. It needs no Mastra instance: the
 * workflow holds the agent by reference rather than looking it up by id.
 */
async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set in packages/agents/.env. These cases need a real model.')
    process.exitCode = 1
    return
  }

  console.log(`\nRunning ${EVAL_CASES.length} cases against the assessment workflow.\n`)

  const result = await runEvals({
    target: assessLoanWorkflow,
    data: EVAL_CASES.map((testCase) => ({ input: testCase.facts, groundTruth: testCase.expect })),
    scorers: {
      workflow: [riskBandScorer, noticesScorer, shapeScorer, noPersonalInferenceScorer],
    },
    gates: [riskBandScorer, noticesScorer, shapeScorer, noPersonalInferenceScorer],
    /*
      One at a time. Two was enough to make a provider drop a request on a
      laptop, and a dropped request reaches the scorers as a case with no
      reading — indistinguishable, at a glance, from the agent having failed
      the case. An eval whose noise looks like its signal is worse than a slow
      one.
    */
    concurrency: 1,
    onItemComplete: ({ item, scorerResults }) => {
      const name = EVAL_CASES.find((testCase) => testCase.facts === item.input)?.name ?? 'case'

      // Nested under `workflow` when the scorers are given as a
      // `WorkflowScorerConfig`. Reading the top level instead finds objects
      // with no `score` at all, so every case reports as passing — which is
      // exactly what it did until a gate summary disagreed with the ticks.
      const outcomes = Object.entries(
        (scorerResults?.workflow ?? scorerResults ?? {}) as Record<string, { score?: number; reason?: string }>
      )
      const failedHere = outcomes.filter(([, outcome]) => (outcome.score ?? 1) < 1)

      console.log(`${failedHere.length === 0 ? '✅' : '❌'} ${name}`)

      failedHere.forEach(([id, outcome]) => {
        console.log(`     ${id}: ${outcome.reason ?? 'scored 0'}`)
      })
    },
  })

  console.log(`\n${'─'.repeat(64)}`)
  console.log(`  ${result.verdict?.toUpperCase() ?? 'DONE'} — ${result.summary.totalItems} cases`)
  console.log('─'.repeat(64))

  result.gateResults?.forEach((gate) => {
    console.log(`  ${gate.passed ? '✅' : '❌'} ${gate.id} — ${Math.round(gate.score * 100)}%`)
  })

  if (result.verdict !== 'passed') process.exitCode = 1
}

main().catch((error) => {
  console.error('\nEval run failed:', error)
  process.exitCode = 1
})
