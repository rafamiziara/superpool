import type { PoolInfo } from '@superpool/types'
import { zeroAddress } from 'viem'
import { filterPools, POOL_SORT_MODES, sortPools } from './poolSearch'

function makePool(overrides: Partial<PoolInfo> = {}): PoolInfo {
  return {
    poolId: 1,
    poolAddress: '0x3b9Fab925D36946000F2636a49808cD5CF56F290',
    poolOwner: '0x0000000000000000000000000000000000000042',
    name: 'Builders Guild',
    description: 'Working capital for indie devs',
    maxLoanAmount: '500000000000000000000',
    interestRate: 450,
    loanDuration: 2_592_000,
    chainId: 31337,
    createdBy: '0x0000000000000000000000000000000000000042',
    createdAt: '2026-08-01T09:00:00.000Z',
    transactionHash: '0xaaa',
    isActive: true,
    loanToken: zeroAddress,
    ...overrides,
  }
}

/** Every pool holds nothing unless a test says otherwise. */
const noLiquidity = () => 0n

describe('filterPools', () => {
  const guild = makePool({ poolId: 1, name: 'Builders Guild', description: 'Working capital for indie devs' })
  const mercado = makePool({ poolId: 2, name: 'Mercado Vecinal', description: 'Neighbourhood merchants funding inventory' })
  const campus = makePool({ poolId: 3, name: 'Campus Fund', description: 'Students covering tuition gaps' })
  const pools = [guild, mercado, campus]

  it('returns everything for an empty query', () => {
    expect(filterPools(pools, '')).toEqual(pools)
  })

  // A screen hands its raw input straight in, and a user who typed a word and
  // deleted it leaves a space behind.
  it('returns everything for a whitespace-only query', () => {
    expect(filterPools(pools, '   ')).toEqual(pools)
  })

  it('matches a name regardless of case', () => {
    expect(filterPools(pools, 'CAMPUS')).toEqual([campus])
  })

  // Substring rather than prefix: a pool name is a phrase, and "guild" is the
  // half of "Builders Guild" someone is most likely to remember.
  it('matches a word inside the name', () => {
    expect(filterPools(pools, 'guild')).toEqual([guild])
  })

  it('matches on the description as well as the name', () => {
    expect(filterPools(pools, 'tuition')).toEqual([campus])
  })

  // The point of requiring every term: more typing narrows the list.
  it('requires all terms to match', () => {
    expect(filterPools(pools, 'campus tuition')).toEqual([campus])
    expect(filterPools(pools, 'campus inventory')).toEqual([])
  })

  it('matches terms across the name and the description together', () => {
    expect(filterPools(pools, 'mercado inventory')).toEqual([mercado])
  })

  it('ignores extra whitespace between terms', () => {
    expect(filterPools(pools, '  campus    tuition  ')).toEqual([campus])
  })

  // Someone searching on a keyboard without diacritics must still find a pool
  // named with them, and vice versa.
  it('ignores accents on either side', () => {
    const accented = makePool({ poolId: 4, name: 'Café Cooperativa', description: 'Grãos e torra' })

    expect(filterPools([accented], 'cafe')).toEqual([accented])
    expect(filterPools([accented], 'café')).toEqual([accented])
    expect(filterPools([accented], 'graos')).toEqual([accented])
  })

  it('returns nothing when no pool matches', () => {
    expect(filterPools(pools, 'zzz')).toEqual([])
  })

  it('preserves the order it was given', () => {
    expect(filterPools(pools, 'n').map((pool) => pool.poolId)).toEqual([1, 2, 3])
  })
})

describe('sortPools', () => {
  const older = makePool({ poolId: 1, createdAt: '2026-01-01T00:00:00.000Z', interestRate: 800, maxLoanAmount: '300' })
  const newer = makePool({ poolId: 2, createdAt: '2026-06-01T00:00:00.000Z', interestRate: 200, maxLoanAmount: '100' })
  const newest = makePool({ poolId: 3, createdAt: '2026-08-01T00:00:00.000Z', interestRate: 500, maxLoanAmount: '900' })
  const pools = [older, newer, newest]

  it('does not mutate the array it was given', () => {
    const input = [older, newer, newest]

    sortPools(input, 'rate', noLiquidity)

    expect(input.map((pool) => pool.poolId)).toEqual([1, 2, 3])
  })

  it('orders newest first', () => {
    expect(sortPools(pools, 'newest', noLiquidity).map((pool) => pool.poolId)).toEqual([3, 2, 1])
  })

  it('orders by lowest rate', () => {
    expect(sortPools(pools, 'rate', noLiquidity).map((pool) => pool.poolId)).toEqual([2, 3, 1])
  })

  it('orders by largest maximum loan', () => {
    expect(sortPools(pools, 'size', noLiquidity).map((pool) => pool.poolId)).toEqual([3, 1, 2])
  })

  it('orders by liquidity, which comes from a lookup rather than the pool', () => {
    const liquidity = (poolId: number) => (poolId === 1 ? 5n : poolId === 2 ? 50n : 0n)

    expect(sortPools(pools, 'liquidity', liquidity).map((pool) => pool.poolId)).toEqual([2, 1, 3])
  })

  // A subtraction would be a bigint here, which is not what a comparator may
  // return, and amounts in wei overflow `Number` long before they get large.
  it('compares wei amounts beyond what a number holds exactly', () => {
    const huge = makePool({ poolId: 10, maxLoanAmount: '9007199254740993000000000000000000001' })
    const slightlySmaller = makePool({ poolId: 11, maxLoanAmount: '9007199254740993000000000000000000000' })

    expect(sortPools([slightlySmaller, huge], 'size', noLiquidity).map((pool) => pool.poolId)).toEqual([10, 11])
  })

  it('breaks ties on newest, since round rates repeat', () => {
    const a = makePool({ poolId: 1, interestRate: 500, createdAt: '2026-01-01T00:00:00.000Z' })
    const b = makePool({ poolId: 2, interestRate: 500, createdAt: '2026-07-01T00:00:00.000Z' })

    expect(sortPools([a, b], 'rate', noLiquidity).map((pool) => pool.poolId)).toEqual([2, 1])
  })

  it('breaks liquidity ties on newest, which is what an unfunded chain is', () => {
    const a = makePool({ poolId: 1, createdAt: '2026-01-01T00:00:00.000Z' })
    const b = makePool({ poolId: 2, createdAt: '2026-07-01T00:00:00.000Z' })

    expect(sortPools([a, b], 'liquidity', noLiquidity).map((pool) => pool.poolId)).toEqual([2, 1])
  })

  it('handles an empty list in every mode', () => {
    for (const mode of POOL_SORT_MODES) {
      expect(sortPools([], mode, noLiquidity)).toEqual([])
    }
  })
})
