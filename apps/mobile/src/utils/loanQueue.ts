import type { LoanInfo } from '@superpool/types'

/**
 * How a pool owner wants their queue ordered.
 *
 * Three orders, all of them facts about the request rather than judgements
 * about the person who made it. What is **deliberately absent** matters more
 * than what is here:
 *
 * - **Not by assessment band.** Bands exist precisely because they cannot be
 *   averaged, sorted or thresholded — an ordering by band is a ranking of
 *   borrowers by a model's reading, which is the scoring system this project
 *   refused to build wearing a different hat.
 * - **Not by borrowing history.** Same reason, one step removed: "fewest
 *   defaults first" is a score with the arithmetic hidden.
 * - **Not by what the pool can afford.** Liquidity moves with every approval,
 *   so an order that depended on it would reshuffle the queue under the
 *   owner's finger between one decision and the next. The card already says
 *   when a request is more than the pool holds, which is the same information
 *   without the moving list.
 */
export type QueueOrder = 'waiting' | 'largest' | 'smallest'

export const QUEUE_ORDER_LABELS: Record<QueueOrder, string> = {
  waiting: 'Longest waiting',
  largest: 'Largest first',
  smallest: 'Smallest first',
}

/** Ordered for the filter row; `waiting` first because it is the default. */
export const QUEUE_ORDERS: QueueOrder[] = ['waiting', 'largest', 'smallest']

/** Oldest request first. `startedAt` is the moment it was made while it is still pending. */
function byWaiting(a: LoanInfo, b: LoanInfo): number {
  return new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
}

/**
 * Order a queue of pending requests.
 *
 * Returns a new array — the store's list is observable, and sorting it in
 * place would mutate what every other screen reads.
 *
 * Amounts are compared as `bigint`, never as numbers: a wei figure passes
 * `Number.MAX_SAFE_INTEGER` at about 0.009 POL, so a numeric comparison sorts
 * a queue of ordinary amounts by rounding error.
 *
 * Ties fall back to how long the request has waited, so an order by amount is
 * still stable and still answers the oldest of two equal requests first.
 */
export function sortLoanQueue(requests: LoanInfo[], order: QueueOrder): LoanInfo[] {
  const sorted = [...requests]

  if (order === 'waiting') return sorted.sort(byWaiting)

  return sorted.sort((a, b) => {
    const left = BigInt(a.amount)
    const right = BigInt(b.amount)

    if (left === right) return byWaiting(a, b)

    const larger = left > right ? -1 : 1

    return order === 'largest' ? larger : -larger
  })
}
