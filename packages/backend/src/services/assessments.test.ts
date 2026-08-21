import { AssessmentInfo } from '@superpool/types'
import { Firestore } from 'firebase-admin/firestore'
import { mockLogger } from '../__tests__/setup'

jest.mock('./borrowerHistory', () => ({
  ...jest.requireActual('./borrowerHistory'),
  borrowerHistoriesFor: jest.fn(),
}))
jest.mock('./notes', () => ({ ...jest.requireActual('./notes'), noteFor: jest.fn() }))

import { borrowerHistoriesFor } from './borrowerHistory'
import { noteFor } from './notes'
import {
  ASSESSMENT_DAILY_CAP,
  assessmentFor,
  claimAssessment,
  denominationOf,
  gatherFacts,
  isStale,
  ownershipOf,
  quotaDay,
  releaseAssessment,
  saveAssessment,
  toWholeUnits,
} from './assessments'

const ZERO = '0x0000000000000000000000000000000000000000'
const USDC = '0x1111111111111111111111111111111111111111'
const OWNER = '0x2222222222222222222222222222222222222222'
const BORROWER = '0x3333333333333333333333333333333333333333'
const POOL_ADDRESS = '0x4444444444444444444444444444444444444444'

const LOAN_ID = '31337-1-7'

const HISTORY = { total: 4, repaid: 3, onTime: 3, late: 0, undated: 0, outstanding: 1, overdue: 0, defaulted: 0, isNew: false }

type Docs = Record<string, Record<string, Record<string, unknown>>>

/** Nested plain objects, `set` and `get`, and an equality-only query builder. */
function buildFirestore(seed: Docs = {}) {
  const store: Docs = seed

  const collection = (name: string) => {
    store[name] ??= {}

    const filters: [string, unknown][] = []

    const self = {
      where(field: string, _op: string, value: unknown) {
        filters.push([field, value])

        return self
      },
      count() {
        return {
          get: async () => ({
            data: () => ({
              count: Object.values(store[name]).filter((data) => filters.every(([field, value]) => data[field] === value)).length,
            }),
          }),
        }
      },
      doc: (id: string) => ({
        id,
        path: name,
        get: async () => ({ id, exists: id in store[name], data: () => store[name][id] }),
        set: async (data: Record<string, unknown>) => {
          store[name][id] = data
        },
      }),
    }

    return self
  }

  /**
   * Just enough of a transaction to exercise read-then-conditionally-write.
   *
   * Runs the body once against the same store, which is what a real
   * transaction does when nothing else is contending. What it cannot show is a
   * genuine race — that is what the live script is for.
   */
  const runTransaction = async <T>(body: (transaction: FakeTransaction) => Promise<T>): Promise<T> => {
    const writes: [string, string, Record<string, unknown>][] = []

    const transaction: FakeTransaction = {
      get: async (ref) => ({ exists: ref.id in (store[ref.path] ?? {}), data: () => store[ref.path]?.[ref.id] }),
      set: (ref, data) => {
        writes.push([ref.path, ref.id, data])
      },
    }

    const result = await body(transaction)

    writes.forEach(([path, id, data]) => {
      store[path] ??= {}
      store[path][id] = data
    })

    return result
  }

  return { firestore: { collection, runTransaction } as unknown as Firestore, store }
}

interface FakeRef {
  id: string
  path: string
}

interface FakeTransaction {
  get: (ref: FakeRef) => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>
  set: (ref: FakeRef, data: Record<string, unknown>) => void
}

const seeded = (overrides: { loan?: Record<string, unknown>; pool?: Record<string, unknown> } = {}): Docs => ({
  loans: {
    [LOAN_ID]: {
      chainId: 31337,
      poolId: 1,
      loanId: 7,
      borrower: BORROWER,
      amount: '50000000',
      interestRate: 500,
      duration: 2_592_000,
      status: 'requested',
      ...overrides.loan,
    },
  },
  pools: {
    '31337-1': {
      poolOwner: OWNER,
      poolAddress: POOL_ADDRESS,
      name: 'Neighbours',
      maxLoanAmount: '100000000',
      loanToken: USDC,
      tokenSymbol: 'USDC',
      tokenDecimals: 6,
      ...overrides.pool,
    },
  },
})

beforeEach(() => {
  jest.clearAllMocks()
  ;(borrowerHistoriesFor as jest.Mock).mockResolvedValue({ [BORROWER.toLowerCase()]: HISTORY })
  ;(noteFor as jest.Mock).mockResolvedValue(null)
})

// ---------------------------------------------------------------------------
// Denomination — the three-way rule, applied exactly as the app applies it.
// ---------------------------------------------------------------------------

describe('denominationOf', () => {
  it('reads the zero address as the chain’s own coin', () => {
    expect(denominationOf({ chainId: 31337, loanToken: ZERO })).toEqual({ symbol: 'POL', decimals: 18 })
  })

  it('takes the symbol from the chain, not the pool, for a native pool', () => {
    // Writing one on the pool would put POL on a Base pool.
    expect(denominationOf({ chainId: 8453, loanToken: ZERO })?.symbol).toBe('ETH')
  })

  it('reads a token pool from its own decimals', () => {
    expect(denominationOf({ chainId: 31337, loanToken: USDC, tokenSymbol: 'USDC', tokenDecimals: 6 })).toEqual({
      symbol: 'USDC',
      decimals: 6,
    })
  })

  // Defaulting to 18 would describe 5 USDC to the model as five million
  // million, inside a sentence somebody lends money on.
  it('refuses a token it could not read rather than assuming 18', () => {
    expect(denominationOf({ chainId: 31337, loanToken: USDC })).toBeUndefined()
  })
})

describe('toWholeUnits', () => {
  it('turns the smallest unit into what a person would say', () => {
    expect(toWholeUnits('50000000', 6)).toBe(50)
    expect(toWholeUnits(5_000_000_000_000_000_000n, 18)).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// Entitlement, resolved before anything expensive happens.
// ---------------------------------------------------------------------------

describe('ownershipOf', () => {
  it('names the pool’s owner and where to read its liquidity', async () => {
    const { firestore } = buildFirestore(seeded())

    await expect(ownershipOf(LOAN_ID, firestore)).resolves.toMatchObject({
      poolOwner: OWNER.toLowerCase(),
      poolAddress: POOL_ADDRESS,
      chainId: 31337,
      poolId: 1,
      loanId: 7,
    })
  })

  it('resolves the denomination too, so an unpriceable pool costs no chain call', async () => {
    const { firestore } = buildFirestore(seeded({ pool: { tokenDecimals: undefined } }))

    const ownership = await ownershipOf(LOAN_ID, firestore)

    expect(ownership!.denomination).toBeUndefined()
  })

  it('answers nothing for a loan nobody has indexed', async () => {
    const { firestore } = buildFirestore(seeded())

    await expect(ownershipOf('31337-9-9', firestore)).resolves.toBeNull()
  })

  it('answers nothing when the pool itself was never indexed', async () => {
    const docs = seeded()
    delete docs.pools['31337-1']
    const { firestore } = buildFirestore(docs)

    await expect(ownershipOf(LOAN_ID, firestore)).resolves.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// The facts the agent is sent.
// ---------------------------------------------------------------------------

describe('gatherFacts', () => {
  it('sends whole units, never the smallest one', async () => {
    const { firestore } = buildFirestore(seeded())

    const gathered = await gatherFacts(LOAN_ID, 200_000_000n, 1_800_000_000, firestore)

    expect(gathered).toMatchObject({
      facts: {
        request: { amount: 50, termDays: 30, interestRatePercent: 5 },
        pool: { symbol: 'USDC', liquidity: 200, maxLoanAmount: 100 },
      },
    })
  })

  // The term's price, the same figure the app quotes. Not what is owed now:
  // that accrues per second, so a model reasoning about it would be describing
  // a different loan by the time anybody read the answer.
  it('quotes the term’s price rather than a moving balance', async () => {
    const { firestore } = buildFirestore(seeded())

    const gathered = await gatherFacts(LOAN_ID, 200_000_000n, 1_800_000_000, firestore)

    expect(gathered).toMatchObject({ facts: { request: { repaymentTotal: 52.5 } } })
  })

  it('carries the purpose when the borrower stated one', async () => {
    ;(noteFor as jest.Mock).mockResolvedValue({ text: 'School fees.' })
    const { firestore } = buildFirestore(seeded())

    const gathered = await gatherFacts(LOAN_ID, 200_000_000n, 1_800_000_000, firestore)

    expect(gathered).toMatchObject({ facts: { request: { purpose: 'School fees.' } } })
  })

  it('leaves the purpose out entirely when there is none', async () => {
    const { firestore } = buildFirestore(seeded())

    const gathered = await gatherFacts(LOAN_ID, 200_000_000n, 1_800_000_000, firestore)

    // Absent rather than undefined: the schema on the wire marks it optional,
    // and Mastra would reject an explicit `undefined` at the boundary.
    expect(gathered && 'facts' in gathered && gathered.facts.request).not.toHaveProperty('purpose')
  })

  it('counts the requests already waiting on the owner', async () => {
    const docs = seeded()
    docs.loans['31337-1-8'] = { chainId: 31337, poolId: 1, status: 'requested' }
    docs.loans['31337-1-9'] = { chainId: 31337, poolId: 1, status: 'disbursed' }
    const { firestore } = buildFirestore(docs)

    const gathered = await gatherFacts(LOAN_ID, 200_000_000n, 1_800_000_000, firestore)

    expect(gathered).toMatchObject({ facts: { pool: { pendingRequests: 2 } } })
  })

  it('judges the borrower’s record against the moment it was given', async () => {
    const { firestore } = buildFirestore(seeded())

    await gatherFacts(LOAN_ID, 200_000_000n, 1_800_000_000, firestore)

    expect(borrowerHistoriesFor).toHaveBeenCalledWith([BORROWER], 31337, 1_800_000_000, expect.anything())
  })

  it('reports an unpriceable pool rather than guessing an exponent', async () => {
    const { firestore } = buildFirestore(seeded({ pool: { tokenDecimals: undefined } }))

    await expect(gatherFacts(LOAN_ID, 200_000_000n, 1_800_000_000, firestore)).resolves.toEqual({ unsupported: true })
  })

  it('says nothing when the pool itself was never indexed', async () => {
    const docs = seeded()
    delete docs.pools['31337-1']
    const { firestore } = buildFirestore(docs)

    await expect(gatherFacts(LOAN_ID, 200_000_000n, 1_800_000_000, firestore)).resolves.toBeNull()
    expect(mockLogger.warn).toHaveBeenCalled()
  })

  it('says nothing about a loan nobody has indexed', async () => {
    const { firestore } = buildFirestore(seeded())

    await expect(gatherFacts('31337-9-9', 0n, 1_800_000_000, firestore)).resolves.toBeNull()
    expect(mockLogger.warn).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Storing, reading back, and knowing when a reading has gone stale.
// ---------------------------------------------------------------------------

const reading = {
  risk: 'low' as const,
  summary: 'A modest ask against a clean record.',
  observations: ['A quarter of the pool.'],
  questions: [],
  limitations: ['No purpose was stated.'],
}

const inputs = { amount: 50, liquidity: 200, symbol: 'USDC', hadPurpose: false, borrower: HISTORY }

describe('saveAssessment', () => {
  it('stores the reading under the loan’s own id', async () => {
    const { firestore, store } = buildFirestore(seeded())

    const saved = await saveAssessment({ loanDocId: LOAN_ID, chainId: 31337, poolId: 1, loanId: 7, reading, inputs }, firestore)

    expect(saved).toMatchObject({ id: LOAN_ID, risk: 'low', inputs })
    expect(store.assessments[LOAN_ID]).toBeDefined()
  })

  it('dates it on the wire as ISO, which is what survives the callable encoder', async () => {
    const { firestore } = buildFirestore(seeded())

    const saved = await saveAssessment({ loanDocId: LOAN_ID, chainId: 31337, poolId: 1, loanId: 7, reading, inputs }, firestore)

    expect(Date.parse(saved.createdAt)).not.toBeNaN()
  })

  // Unlike a note this is not write-once: nobody said it, so there is nothing
  // to protect. What is worth keeping is that it *changed*.
  it('keeps the previous reading when it is redone', async () => {
    const { firestore } = buildFirestore(seeded())

    await saveAssessment({ loanDocId: LOAN_ID, chainId: 31337, poolId: 1, loanId: 7, reading, inputs }, firestore)
    const second = await saveAssessment(
      { loanDocId: LOAN_ID, chainId: 31337, poolId: 1, loanId: 7, reading: { ...reading, risk: 'high' }, inputs },
      firestore
    )

    expect(second.risk).toBe('high')
    expect(second.history).toHaveLength(1)
    expect(second.history![0]).toMatchObject({ risk: 'low' })
  })

  it('keeps the history short rather than growing a log', async () => {
    const { firestore } = buildFirestore(seeded())

    for (let index = 0; index < 6; index += 1) {
      await saveAssessment({ loanDocId: LOAN_ID, chainId: 31337, poolId: 1, loanId: 7, reading, inputs }, firestore)
    }

    const stored = await assessmentFor(LOAN_ID, firestore)

    expect(stored!.history!.length).toBeLessThanOrEqual(3)
  })
})

describe('assessmentFor', () => {
  it('reads nothing back for a loan nobody has assessed', async () => {
    const { firestore } = buildFirestore(seeded())

    await expect(assessmentFor(LOAN_ID, firestore)).resolves.toBeNull()
  })
})

describe('isStale', () => {
  const stored = { inputs: { ...inputs, liquidity: 200 } } as AssessmentInfo

  it('is current while the pool holds roughly what it did', () => {
    expect(isStale(stored, 190)).toBe(false)
    expect(isStale(stored, 240)).toBe(false)
  })

  // `approveLoan` checks liquidity at approval, not at request time, so a
  // reading taken when the pool held 200 and read when it holds 5 is
  // describing a pool that no longer exists.
  it('is stale once the pool has moved far enough to change the answer', () => {
    expect(isStale(stored, 5)).toBe(true)
    expect(isStale(stored, 400)).toBe(true)
  })

  it('treats a pool that has gone from empty to funded as stale', () => {
    expect(isStale({ inputs: { ...inputs, liquidity: 0 } } as AssessmentInfo, 100)).toBe(true)
    expect(isStale({ inputs: { ...inputs, liquidity: 0 } } as AssessmentInfo, 0)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// The daily cap.
//
// `assessLoan` is the one callable that spends money on somebody else's
// behalf, and a queue asks for a reading per undecided request. The ceiling
// bounds the accident — a loop, a stuck refresh, a screen left open — rather
// than rationing ordinary use.
// ---------------------------------------------------------------------------

describe('claimAssessment', () => {
  it('grants a reading and counts it', async () => {
    const { firestore } = buildFirestore({})

    await expect(claimAssessment(OWNER, firestore)).resolves.toMatchObject({ granted: true, used: 1, cap: ASSESSMENT_DAILY_CAP })
  })

  it('counts each one, so a day adds up', async () => {
    const { firestore } = buildFirestore({})

    await claimAssessment(OWNER, firestore)
    await claimAssessment(OWNER, firestore)

    await expect(claimAssessment(OWNER, firestore)).resolves.toMatchObject({ used: 3 })
  })

  it('refuses once the day is spent', async () => {
    const { firestore, store } = buildFirestore({})
    store.assessment_quota = { [`${OWNER.toLowerCase()}-${quotaDay()}`]: { count: ASSESSMENT_DAILY_CAP } }

    await expect(claimAssessment(OWNER, firestore)).resolves.toMatchObject({ granted: false, used: ASSESSMENT_DAILY_CAP })
  })

  // A wallet has no timezone, and a guess that resets a quota is a guess that
  // can be gamed.
  it('keys the day in UTC, and each wallet has its own', async () => {
    const { firestore, store } = buildFirestore({})

    await claimAssessment(OWNER, firestore)
    await claimAssessment(BORROWER, firestore)

    expect(Object.keys(store.assessment_quota).sort()).toEqual(
      [`${BORROWER.toLowerCase()}-${quotaDay()}`, `${OWNER.toLowerCase()}-${quotaDay()}`].sort()
    )
  })

  it('matches the wallet case-insensitively, as every address here is', async () => {
    const { firestore } = buildFirestore({})

    await claimAssessment(OWNER.toUpperCase(), firestore)

    await expect(claimAssessment(OWNER.toLowerCase(), firestore)).resolves.toMatchObject({ used: 2 })
  })

  it('reads yesterday as a fresh day', async () => {
    const { firestore, store } = buildFirestore({})
    store.assessment_quota = { [`${OWNER.toLowerCase()}-2020-01-01`]: { count: ASSESSMENT_DAILY_CAP } }

    await expect(claimAssessment(OWNER, firestore)).resolves.toMatchObject({ granted: true, used: 1 })
  })
})

describe('releaseAssessment', () => {
  // An agent that was unreachable cost nothing, so it must not cost a day's
  // allowance either.
  it('gives a claim back', async () => {
    const { firestore } = buildFirestore({})

    await claimAssessment(OWNER, firestore)
    await releaseAssessment(OWNER, firestore)

    await expect(claimAssessment(OWNER, firestore)).resolves.toMatchObject({ used: 1 })
  })

  it('never goes below nothing', async () => {
    const { firestore, store } = buildFirestore({})

    await releaseAssessment(OWNER, firestore)

    expect(store.assessment_quota[`${OWNER.toLowerCase()}-${quotaDay()}`].count).toBe(0)
  })

  // Failing to release is survivable — the count resets at midnight — so this
  // must never be the thing that fails a request.
  it('swallows a failure rather than taking the request down with it', async () => {
    const firestore = { runTransaction: jest.fn().mockRejectedValue(new Error('contention')) } as unknown as Firestore

    await expect(releaseAssessment(OWNER, firestore)).resolves.toBeUndefined()
    expect(mockLogger.warn).toHaveBeenCalled()
  })
})
