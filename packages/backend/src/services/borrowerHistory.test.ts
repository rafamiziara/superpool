import { Firestore, Timestamp } from 'firebase-admin/firestore'
import { mockLogger } from '../__tests__/setup'
import { borrowerHistoriesFor, emptyHistory, MAX_BORROWERS_PER_CALL, summariseLoans } from './borrowerHistory'

const BORROWER = '0x2222222222222222222222222222222222222222'
const OTHER = '0x3333333333333333333333333333333333333333'

/** A month, in seconds — the term every fixture below is written against. */
const TERM = 30 * 24 * 60 * 60
const STARTED = 1_780_000_000
const DUE = STARTED + TERM

type Loan = Parameters<typeof summariseLoans>[0][number]

function loan(overrides: Partial<Loan> = {}): Loan {
  return {
    borrower: BORROWER,
    status: 'disbursed',
    isRepaid: false,
    startedAtSeconds: STARTED,
    duration: TERM,
    ...overrides,
  }
}

describe('summariseLoans', () => {
  it('counts nothing as nothing, and calls that new', () => {
    expect(summariseLoans([], DUE)).toEqual(emptyHistory())
    expect(summariseLoans([], DUE).isNew).toBe(true)
  })

  // The distinction the whole shape exists for: a lending product that
  // confuses "has never borrowed" with "is the worst kind of borrower" is
  // unusable for exactly the people micro-lending is for.
  it('stops calling a wallet new the moment it has borrowed once', () => {
    expect(summariseLoans([loan()], DUE).isNew).toBe(false)
  })

  // A request is not borrowing, and a rejected one is a decision the owner
  // already made. Neither says anything about giving money back.
  it('ignores requests and rejections entirely', () => {
    const history = summariseLoans([loan({ status: 'requested' }), loan({ status: 'rejected' })], DUE)

    expect(history).toEqual(emptyHistory())
  })

  it('counts an open loan as outstanding rather than repaid', () => {
    const history = summariseLoans([loan()], STARTED + 1)

    expect(history).toMatchObject({ total: 1, outstanding: 1, overdue: 0, repaid: 0 })
  })

  it('calls an open loan overdue once its term has run', () => {
    expect(summariseLoans([loan()], DUE + 1).overdue).toBe(1)
  })

  // The boundary belongs to the borrower: a loan settled or standing exactly
  // at its due second is not late.
  it('does not call a loan overdue on the due second itself', () => {
    expect(summariseLoans([loan()], DUE).overdue).toBe(0)
  })

  it('counts a settled loan as repaid, on time', () => {
    const history = summariseLoans([loan({ isRepaid: true, repaidAtSeconds: DUE - 1 })], DUE + 1)

    expect(history).toMatchObject({ total: 1, repaid: 1, onTime: 1, late: 0, outstanding: 0, overdue: 0 })
  })

  it('counts one settled after its term as late', () => {
    expect(summariseLoans([loan({ isRepaid: true, repaidAtSeconds: DUE + 1 })], DUE + 2).late).toBe(1)
  })

  // The honest answer to when these were settled is that nobody knows, so they
  // belong in neither column.
  it('counts a settled loan with no date as neither on time nor late', () => {
    const history = summariseLoans([loan({ isRepaid: true })], DUE + 1)

    expect(history).toMatchObject({ repaid: 1, undated: 1, onTime: 0, late: 0 })
  })

  // A declaration is a judgement on a debt, never a settlement of one.
  it('keeps a declared loan among the outstanding', () => {
    const history = summariseLoans([loan({ status: 'defaulted', defaultedAtSeconds: DUE + 10 })], DUE + 20)

    expect(history).toMatchObject({ total: 1, outstanding: 1, overdue: 1, defaulted: 1, repaid: 0 })
  })

  // Paying does not undo the declaration, and the pair is what "recovered"
  // means — a different fact from never having been late.
  it('counts a loan that was declared and then paid as both', () => {
    const history = summariseLoans(
      [loan({ status: 'defaulted', defaultedAtSeconds: DUE + 10, isRepaid: true, repaidAtSeconds: DUE + 20 })],
      DUE + 30
    )

    expect(history).toMatchObject({ total: 1, repaid: 1, late: 1, defaulted: 1, outstanding: 0 })
  })

  // Read from the date rather than the status, which is what makes the line
  // above possible at all.
  it('counts a declaration from its stamp, not from the status', () => {
    const history = summariseLoans([loan({ status: 'disbursed', isRepaid: true, repaidAtSeconds: DUE, defaultedAtSeconds: DUE - 5 })], DUE)

    expect(history.defaulted).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Reading a whole record out of Firestore.
// ---------------------------------------------------------------------------

type Docs = Record<string, Record<string, unknown>>

function buildFirestore(docs: Docs) {
  const filters: Record<string, [string, unknown][]> = {}
  const selected: string[][] = []

  const query = (id: string) => {
    filters[id] ??= []

    const self = {
      where(field: string, _op: string, value: unknown) {
        filters[id].push([field, value])

        return self
      },
      select(...fields: string[]) {
        selected.push(fields)

        return self
      },
      get: async () => ({
        docs: Object.entries(docs)
          .filter(([, data]) => filters[id].every(([field, value]) => data[field] === value))
          .map(([docId, data]) => ({ id: docId, data: () => data })),
      }),
    }

    return self
  }

  let next = 0

  return {
    firestore: { collection: () => query(`q${next++}`) } as unknown as Firestore,
    selected,
  }
}

function stamp(seconds: number) {
  return Timestamp.fromMillis(seconds * 1000)
}

const stored = (overrides: Record<string, unknown> = {}) => ({
  chainId: 31337,
  borrower: BORROWER,
  status: 'disbursed',
  isRepaid: false,
  startedAt: stamp(STARTED),
  duration: TERM,
  ...overrides,
})

describe('borrowerHistoriesFor', () => {
  it('summarises one wallet from its own loans', async () => {
    const { firestore } = buildFirestore({ a: stored(), b: stored({ isRepaid: true, repaidAt: stamp(DUE - 1) }) })

    const histories = await borrowerHistoriesFor([BORROWER], 31337, DUE, firestore)

    expect(histories[BORROWER.toLowerCase()]).toMatchObject({ total: 2, outstanding: 1, repaid: 1, onTime: 1 })
  })

  // An absent key would make a caller guess whether the wallet is new or the
  // call went wrong — the one distinction `isNew` exists to protect.
  it('answers for a wallet that has never borrowed', async () => {
    const { firestore } = buildFirestore({})

    const histories = await borrowerHistoriesFor([OTHER], 31337, DUE, firestore)

    expect(histories[OTHER.toLowerCase()]).toEqual(emptyHistory())
  })

  it('lowercases the key, since callers report addresses checksummed', async () => {
    const { firestore } = buildFirestore({})

    const histories = await borrowerHistoriesFor(['0xAbCdAbCdAbCdAbCdAbCdAbCdAbCdAbCdAbCdAbCd'], 31337, DUE, firestore)

    expect(Object.keys(histories)).toEqual(['0xabcdabcdabcdabcdabcdabcdabcdabcdabcdabcd'])
  })

  it('asks the same wallet about only once', async () => {
    const { firestore } = buildFirestore({})

    const histories = await borrowerHistoriesFor([BORROWER, BORROWER.toUpperCase()], 31337, DUE, firestore)

    expect(Object.keys(histories)).toHaveLength(1)
  })

  it('refuses to grow past the per-call bound', async () => {
    const { firestore } = buildFirestore({})
    const many = Array.from({ length: MAX_BORROWERS_PER_CALL + 5 }, (_, index) => `0x${String(index).padStart(40, '0')}`)

    const histories = await borrowerHistoriesFor(many, 31337, DUE, firestore)

    expect(Object.keys(histories)).toHaveLength(MAX_BORROWERS_PER_CALL)
  })

  // Six fields out of twenty, several of the rest being wei strings nobody
  // here reads.
  it('reads only the fields a history is made of', async () => {
    const { firestore, selected } = buildFirestore({})

    await borrowerHistoriesFor([BORROWER], 31337, DUE, firestore)

    expect(selected[0]).toEqual(['borrower', 'status', 'isRepaid', 'startedAt', 'duration', 'repaidAt', 'defaultedAt'])
  })

  // A guessed term would put the loan in the on-time or the late column on no
  // evidence, which is worse than leaving it out and saying so.
  it('leaves out a loan it cannot date, and says so', async () => {
    const { firestore } = buildFirestore({ a: stored({ startedAt: undefined }), b: stored({ duration: undefined }) })

    const histories = await borrowerHistoriesFor([BORROWER], 31337, DUE, firestore)

    expect(histories[BORROWER.toLowerCase()]).toEqual(emptyHistory())
    expect(mockLogger.warn).toHaveBeenCalledTimes(2)
  })
})
