import { createWorkflow } from '@mastra/core/workflows'
import { assessmentAgent } from '../agents/assessment-agent'
import { describeFacts } from '../prompts/assessment-facts'
import { assessmentFactsSchema, assessmentSchema } from '../schemas/assessment'

/**
 * One loan request, read for the owner deciding on it.
 *
 * A workflow rather than a bare agent endpoint, for one reason: its
 * `inputSchema` is the **contract with the backend**, and Mastra validates it
 * at the HTTP boundary. A backend that sends a malformed fact is refused
 * there, instead of the model producing a confident judgement about a field
 * that arrived as undefined.
 *
 * It also keeps the prompt where it belongs. The backend sends plain JSON and
 * knows nothing about how the request is worded; every question of phrasing
 * lives in this package, which is the one that can be iterated in Studio.
 */
export const assessLoanWorkflow = createWorkflow({
  id: 'assessLoan',
  inputSchema: assessmentFactsSchema,
  outputSchema: assessmentSchema,
})
  .map(async ({ inputData }) => ({ prompt: describeFacts(inputData) }))
  .agent(assessmentAgent, { structuredOutput: { schema: assessmentSchema } })
  .commit()
