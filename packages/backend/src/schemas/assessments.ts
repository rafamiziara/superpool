import type { AssessLoanRequest, GetAssessmentRequest } from '@superpool/types'
import { z } from 'zod'
import { chainId, optional, recordId } from './primitives'

export const assessLoanSchema = z.object({
  chainId: optional(chainId),
  loanId: recordId,
  // The owner's explicit action, never automatic. Absent means "whatever is
  // stored is fine", which is the answer that costs nothing.
  refresh: optional(z.boolean()),
}) satisfies z.ZodType<AssessLoanRequest>

export const getAssessmentSchema = z.object({
  chainId: optional(chainId),
  loanId: recordId,
}) satisfies z.ZodType<GetAssessmentRequest>
