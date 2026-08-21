import { Firestore } from 'firebase-admin/firestore'
import { mockLogger } from '../__tests__/setup'

const mockNotifyOnce = jest.fn()

jest.mock('./notifications', () => ({
  ...jest.requireActual('./notifications'),
  notifyOnce: (...args: unknown[]) => mockNotifyOnce(...args),
}))

import { DUE_SOON_WINDOW_SECONDS, remindChain } from './dueReminders'

const CHAIN_ID = 31337
const POOL_ID = 4
const BORROWER = '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc'

/** Chain time "now" for these tests. Deliberately nothing like `Date.now()`. */
const CHAIN_NOW = 1_800_000_000
const DAY = 24 * 60 * 60

interface LoanFixture {
  docId?: string
  /** Seconds before `CHAIN_NOW` that the loan started. */
  startedSecondsAgo: number
  duration: number
  status?: string
  /** `null` drops the field entirely — a record with no usable term. */
  startedAt?: null
}

function loanDoc(fixture: LoanFixture) {
  const { docId = `${CHAIN_ID}-${POOL_ID}-1`, startedSecondsAgo, duration, status = 'disbursed' } = fixture

  return {
    id: docId,
    data: () => ({
      loanId: 1,
      poolId: POOL_ID,
      borrower: BORROWER,
      status,
      isRepaid: false,
      duration,
      startedAt: fixture.startedAt === null ? undefined : { toDate: () => new Date((CHAIN_NOW - startedSecondsAgo) * 1000) },
    }),
  }
}

function buildFirestore(docs: ReturnType<typeof loanDoc>[], pool: object | null = { name: 'Builders Guild' }) {
  const loansQuery = {
    where: jest.fn(),
    limit: jest.fn(),
    get: jest.fn().mockResolvedValue({ docs, size: docs.length }),
  }
  loansQuery.where.mockReturnValue(loansQuery)
  loansQuery.limit.mockReturnValue(loansQuery)

  const poolRef = { get: jest.fn().mockResolvedValue({ exists: pool !== null, data: () => pool }) }

  const collection = jest.fn().mockImplementation((name: string) => {
    if (name === 'loans') return loansQuery
    return { doc: jest.fn().mockReturnValue(poolRef) }
  })

  return { firestore: { collection } as unknown as Firestore, loansQuery }
}

/** A provider whose head block is at `CHAIN_NOW`. */
function providerAt(timestamp: number | null = CHAIN_NOW) {
  return {
    getBlock: jest.fn().mockResolvedValue(timestamp === null ? null : { timestamp }),
  }
}

beforeEach(() => {
  mockNotifyOnce.mockReset()
  mockNotifyOnce.mockResolvedValue({ sent: 1, pruned: 0, noRecipients: false })
})

describe('remindChain', () => {
  it('warns a borrower whose term ends within a day', async () => {
    const { firestore } = buildFirestore([loanDoc({ startedSecondsAgo: 30 * DAY - 3600, duration: 30 * DAY })])

    const result = await remindChain(CHAIN_ID, providerAt() as never, firestore)

    expect(result).toMatchObject({ chainId: CHAIN_ID, scanned: 1, dueSoon: 1, overdue: 0 })
    expect(mockNotifyOnce).toHaveBeenCalledWith(
      `${CHAIN_ID}-${POOL_ID}-1-loan_due_soon`,
      BORROWER,
      expect.objectContaining({ title: 'Loan due soon', data: expect.objectContaining({ kind: 'loan_due_soon', loanId: '1' }) }),
      firestore
    )
  })

  it('says nothing to a borrower with time left', async () => {
    const { firestore } = buildFirestore([loanDoc({ startedSecondsAgo: DAY, duration: 30 * DAY })])

    const result = await remindChain(CHAIN_ID, providerAt() as never, firestore)

    expect(result.dueSoon).toBe(0)
    expect(mockNotifyOnce).not.toHaveBeenCalled()
  })

  it('tells a borrower whose term has run out', async () => {
    const { firestore } = buildFirestore([loanDoc({ startedSecondsAgo: 31 * DAY, duration: 30 * DAY })])

    const result = await remindChain(CHAIN_ID, providerAt() as never, firestore)

    expect(result).toMatchObject({ dueSoon: 0, overdue: 1 })
    expect(mockNotifyOnce).toHaveBeenCalledWith(
      expect.stringContaining('loan_overdue'),
      BORROWER,
      expect.objectContaining({ title: 'Loan overdue' }),
      firestore
    )
  })

  it('sends the overdue reminder instead of the due-soon one, never both', async () => {
    // A loan that ran its whole term between two runs of this job gets the
    // overdue reminder, which is the useful one; a warning that a date is
    // approaching is worthless once it has passed.
    const { firestore } = buildFirestore([loanDoc({ startedSecondsAgo: 30 * DAY + 60, duration: 30 * DAY })])

    await remindChain(CHAIN_ID, providerAt() as never, firestore)

    expect(mockNotifyOnce).toHaveBeenCalledTimes(1)
    expect(mockNotifyOnce.mock.calls[0][0]).toContain('loan_overdue')
  })

  it('chases a loan the owner has already declared in default', async () => {
    // A declaration does not settle anything: the borrower of a defaulted loan
    // is exactly who a reminder is for.
    const { firestore } = buildFirestore([loanDoc({ startedSecondsAgo: 40 * DAY, duration: 30 * DAY, status: 'defaulted' })])

    const result = await remindChain(CHAIN_ID, providerAt() as never, firestore)

    expect(result.overdue).toBe(1)
  })

  it('asks the index for open loans on this chain only', async () => {
    const { firestore, loansQuery } = buildFirestore([])

    await remindChain(CHAIN_ID, providerAt() as never, firestore)

    expect(loansQuery.where).toHaveBeenCalledWith('chainId', '==', CHAIN_ID)
    expect(loansQuery.where).toHaveBeenCalledWith('status', 'in', ['disbursed', 'defaulted'])
    expect(loansQuery.where).toHaveBeenCalledWith('isRepaid', '==', false)
  })

  describe('the clock', () => {
    it('dates the reminder by chain time, not by the server clock', async () => {
      // The whole discipline of this function. `startedAt` is a block timestamp
      // and `duration` counts chain seconds, so a due date is a fact in chain
      // time. Here the chain is years ahead of the wall clock — which is
      // ordinary on a local node — and a loan that is overdue by chain time
      // must be reported overdue regardless of what `Date.now()` says.
      const wallClockNow = Math.floor(Date.now() / 1000)
      expect(CHAIN_NOW).toBeGreaterThan(wallClockNow)

      const { firestore } = buildFirestore([loanDoc({ startedSecondsAgo: 31 * DAY, duration: 30 * DAY })])

      const result = await remindChain(CHAIN_ID, providerAt() as never, firestore)

      expect(result.overdue).toBe(1)
    })

    it('does not report a loan overdue because the server clock ran ahead', async () => {
      // The other direction: chain time behind the wall clock. A loan well
      // inside its term by chain time is not late, whatever the server thinks.
      const { firestore } = buildFirestore([loanDoc({ startedSecondsAgo: 2 * DAY, duration: 30 * DAY })])

      const result = await remindChain(CHAIN_ID, providerAt(CHAIN_NOW) as never, firestore)

      expect(result.overdue).toBe(0)
      expect(mockNotifyOnce).not.toHaveBeenCalled()
    })

    it('refuses to date anything when the chain has no head block', async () => {
      const { firestore } = buildFirestore([loanDoc({ startedSecondsAgo: 31 * DAY, duration: 30 * DAY })])

      await expect(remindChain(CHAIN_ID, providerAt(null) as never, firestore)).rejects.toThrow('cannot date a reminder')
    })

    it('treats the window boundary as due soon', async () => {
      const { firestore } = buildFirestore([loanDoc({ startedSecondsAgo: 30 * DAY - DUE_SOON_WINDOW_SECONDS, duration: 30 * DAY })])

      const result = await remindChain(CHAIN_ID, providerAt() as never, firestore)

      expect(result.dueSoon).toBe(1)
    })
  })

  describe('what it refuses to guess', () => {
    it('skips a loan with no start date rather than inventing one', async () => {
      const { firestore } = buildFirestore([loanDoc({ startedSecondsAgo: 0, duration: 30 * DAY, startedAt: null })])

      const result = await remindChain(CHAIN_ID, providerAt() as never, firestore)

      expect(result.scanned).toBe(0)
      expect(mockNotifyOnce).not.toHaveBeenCalled()
      expect(mockLogger.warn).toHaveBeenCalledWith('Open loan has no usable term; not reminding', expect.anything())
    })

    it('stays quiet when the pool was never indexed', async () => {
      const { firestore } = buildFirestore([loanDoc({ startedSecondsAgo: 31 * DAY, duration: 30 * DAY })], null)

      const result = await remindChain(CHAIN_ID, providerAt() as never, firestore)

      expect(result.overdue).toBe(0)
      expect(mockNotifyOnce).not.toHaveBeenCalled()
    })
  })

  it('does not count a reminder that was already claimed', async () => {
    // `notifyOnce` returns null when the marker already exists. Counting it
    // would make a re-run look like it had told somebody something.
    mockNotifyOnce.mockResolvedValue(null)
    const { firestore } = buildFirestore([loanDoc({ startedSecondsAgo: 31 * DAY, duration: 30 * DAY })])

    const result = await remindChain(CHAIN_ID, providerAt() as never, firestore)

    expect(result.overdue).toBe(0)
  })

  it('reminds each borrower of each loan separately', async () => {
    const { firestore } = buildFirestore([
      loanDoc({ docId: `${CHAIN_ID}-${POOL_ID}-1`, startedSecondsAgo: 31 * DAY, duration: 30 * DAY }),
      loanDoc({ docId: `${CHAIN_ID}-${POOL_ID}-2`, startedSecondsAgo: 40 * DAY, duration: 30 * DAY }),
    ])

    const result = await remindChain(CHAIN_ID, providerAt() as never, firestore)

    expect(result).toMatchObject({ scanned: 2, overdue: 2 })
    // Keyed on the loan document, so one borrower's two debts are two
    // reminders rather than one silencing the other.
    expect(mockNotifyOnce.mock.calls.map((call) => call[0])).toEqual([
      `${CHAIN_ID}-${POOL_ID}-1-loan_overdue`,
      `${CHAIN_ID}-${POOL_ID}-2-loan_overdue`,
    ])
  })
})
