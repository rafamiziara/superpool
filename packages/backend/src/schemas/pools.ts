import type {
  IndexContributionRequest,
  IndexInterestClaimRequest,
  IndexLoanRequest,
  IndexMembershipRequest,
  IndexPoolRequest,
  IndexWithdrawalRequest,
  ListBorrowerHistoriesRequest,
  ListContributionsRequest,
  ListInterestClaimsRequest,
  ListLoanDecisionsRequest,
  ListLoanRepaymentsRequest,
  ListLoansRequest,
  ListMembersRequest,
  ListPoolsRequest,
  ListWithdrawalsRequest,
  PreparePoolCreationRequest,
} from '@superpool/types'
import { z } from 'zod'
import { MAX_BORROWERS_PER_CALL } from '../services/borrowerHistory'
import { chainId, limit, loanId, optional, poolId, txHash, walletAddress } from './primitives'

/**
 * Re-index one transaction, whatever it turned out to contain.
 *
 * All six index callables take the same pair, and the intersection is what says
 * so: if any one of them grows a field, this stops satisfying it and the
 * compiler names which. They are separate interfaces in `@superpool/types`
 * because they answer with different records, not because they ask differently.
 */
export const indexByTransactionSchema = z.object({
  txHash,
  chainId: optional(chainId),
}) satisfies z.ZodType<
  IndexContributionRequest &
    IndexInterestClaimRequest &
    IndexLoanRequest &
    IndexMembershipRequest &
    IndexPoolRequest &
    IndexWithdrawalRequest
>

export const preparePoolCreationSchema = z.object({
  chainId: optional(chainId),
}) satisfies z.ZodType<PreparePoolCreationRequest>

export const listPoolsSchema = z.object({
  page: optional(z.number().int().positive()),
  limit: optional(limit),
  ownerAddress: optional(walletAddress),
  chainId: optional(chainId),
  activeOnly: optional(z.boolean()),
}) satisfies z.ZodType<ListPoolsRequest>

export const listContributionsSchema = z.object({
  chainId: optional(chainId),
  poolId: optional(poolId),
  contributor: optional(walletAddress),
  limit: optional(limit),
}) satisfies z.ZodType<ListContributionsRequest>

export const listWithdrawalsSchema = z.object({
  chainId: optional(chainId),
  poolId: optional(poolId),
  member: optional(walletAddress),
  limit: optional(limit),
}) satisfies z.ZodType<ListWithdrawalsRequest>

export const listInterestClaimsSchema = z.object({
  chainId: optional(chainId),
  poolId: optional(poolId),
  account: optional(walletAddress),
  limit: optional(limit),
}) satisfies z.ZodType<ListInterestClaimsRequest>

export const listMembersSchema = z.object({
  chainId: optional(chainId),
  poolId: optional(poolId),
  account: optional(walletAddress),
  activeOnly: optional(z.boolean()),
  pendingOnly: optional(z.boolean()),
  limit: optional(limit),
}) satisfies z.ZodType<ListMembersRequest>

export const listLoansSchema = z.object({
  chainId: optional(chainId),
  poolId: optional(poolId),
  borrower: optional(walletAddress),
  activeOnly: optional(z.boolean()),
  pendingOnly: optional(z.boolean()),
  defaultedOnly: optional(z.boolean()),
  limit: optional(limit),
}) satisfies z.ZodType<ListLoansRequest>

export const listLoanRepaymentsSchema = z.object({
  chainId: optional(chainId),
  poolId: optional(poolId),
  loanId: optional(loanId),
  borrower: optional(walletAddress),
  limit: optional(limit),
}) satisfies z.ZodType<ListLoanRepaymentsRequest>

export const listLoanDecisionsSchema = z.object({
  chainId: optional(chainId),
  poolId: optional(poolId),
  loanId: optional(loanId),
  borrower: optional(walletAddress),
  decidedBy: optional(walletAddress),
  // Listed rather than derived: `LoanDecisionOutcome` is erased at runtime, and
  // an unknown value here would filter the feed down to nothing and read as an
  // empty history rather than as the mistake it is.
  outcome: optional(z.enum(['approved', 'rejected', 'cancelled', 'defaulted'])),
  limit: optional(limit),
}) satisfies z.ZodType<ListLoanDecisionsRequest>

/**
 * Summarise several wallets at once.
 *
 * The cap is in the schema rather than in the handler, unlike `limit`: a page
 * size above the cap has always been answered with a smaller page, but a
 * twenty-sixth borrower was already refused by name. Keeping that refusal here
 * is what lets the handler stop restating it.
 */
export const listBorrowerHistoriesSchema = z.object({
  chainId: optional(chainId),
  borrowers: z
    .array(walletAddress)
    .min(1, 'at least one borrower address is required')
    .max(MAX_BORROWERS_PER_CALL, `at most ${MAX_BORROWERS_PER_CALL} borrowers can be summarised in one call`),
}) satisfies z.ZodType<ListBorrowerHistoriesRequest>
