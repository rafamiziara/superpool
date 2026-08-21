import type { PoolInfo } from '@superpool/types'

/**
 * How Discover orders what it found.
 *
 * `liquidity` is the odd one out and the reason this takes a lookup rather than
 * reading the pool: a pool's balance is summed from contribution and withdrawal
 * events on read (`PoolStore.poolLiquidity`) and has no field on `PoolInfo`.
 * See `docs/CONTRIBUTIONS.md` — nothing is denormalised, on purpose.
 */
export type PoolSortMode = 'newest' | 'liquidity' | 'rate' | 'size'

export const POOL_SORT_LABELS: Record<PoolSortMode, string> = {
  newest: 'Newest',
  liquidity: 'Most funded',
  rate: 'Lowest rate',
  size: 'Biggest loans',
}

/** Ordered for the filter row; `newest` first because it is the default. */
export const POOL_SORT_MODES: PoolSortMode[] = ['newest', 'liquidity', 'rate', 'size']

/**
 * The combining marks `NFD` splits a letter into. Built from escapes rather
 * than written as a literal character class, because combining characters
 * render as nothing in an editor and do not survive every copy-paste.
 */
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g')

/**
 * Normalised for comparison: case-folded, accent-stripped and collapsed to
 * single spaces.
 *
 * Stripping accents is what lets "mercado vecinal" find "Mercado Vecinal" and,
 * more to the point, lets someone typing on a keyboard without diacritics find
 * a pool named with them.
 */
function normalize(value: string): string {
  return value.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Pools matching a free-text query, in the order they were given.
 *
 * Every whitespace-separated term has to match somewhere, which is what makes
 * typing more words narrow the list rather than widen it. A term matches on a
 * substring of the name or the description — substring rather than prefix
 * because "guild" should find "Builders Guild", and a pool's name is a phrase
 * rather than a single word.
 *
 * An empty or whitespace-only query matches everything, so a screen can hand
 * this its raw input without checking first.
 */
export function filterPools(pools: PoolInfo[], query: string): PoolInfo[] {
  const terms = normalize(query).split(' ').filter(Boolean)

  if (terms.length === 0) return pools

  return pools.filter((pool) => {
    const haystack = `${normalize(pool.name)} ${normalize(pool.description)}`

    return terms.every((term) => haystack.includes(term))
  })
}

/**
 * A sorted copy — `sort` mutates, and the array handed in comes from a MobX
 * computed that must not be reordered under the components reading it.
 *
 * `liquidityOf` is only consulted for the mode that needs it, so a caller
 * paying for a per-pool derivation is not charged for it while sorting by rate.
 *
 * Ties fall back to newest-first rather than staying in input order: several
 * pools sharing a rate is normal (the form suggests round numbers) and "oldest
 * of the 5% pools happens to be first" is not an order anyone asked for.
 */
export function sortPools(pools: PoolInfo[], mode: PoolSortMode, liquidityOf: (poolId: number) => bigint): PoolInfo[] {
  const newestFirst = (a: PoolInfo, b: PoolInfo) => Date.parse(b.createdAt) - Date.parse(a.createdAt)

  const compare: Record<PoolSortMode, (a: PoolInfo, b: PoolInfo) => number> = {
    newest: newestFirst,
    // bigint differences do not fit `number`'s contract for a comparator, so
    // these compare and return -1/0/1 rather than subtracting.
    liquidity: (a, b) => {
      const left = liquidityOf(a.poolId)
      const right = liquidityOf(b.poolId)

      if (left === right) return newestFirst(a, b)

      return left > right ? -1 : 1
    },
    rate: (a, b) => (a.interestRate === b.interestRate ? newestFirst(a, b) : a.interestRate - b.interestRate),
    size: (a, b) => {
      const left = BigInt(a.maxLoanAmount)
      const right = BigInt(b.maxLoanAmount)

      if (left === right) return newestFirst(a, b)

      return left > right ? -1 : 1
    },
  }

  return [...pools].sort(compare[mode])
}
