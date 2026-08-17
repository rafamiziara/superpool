import { Interface } from 'ethers'
import { mockLogger } from '../__tests__/setup'
import { LendingPoolABI } from '../constants'

const mockGetLoan = jest.fn()
const mockGetPoolId = jest.fn()

// Mock ethers BEFORE importing the module: it builds a top-level Interface and
// reads two topic hashes from it at load time.
jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers')
  return {
    ...actual,
    Contract: jest.fn().mockImplementation(() => ({ getLoan: mockGetLoan, getPoolId: mockGetPoolId })),
  }
})

/**
 * Notifications are dispatched from `indexLoanFromLog`, so the sweep notifies
 * as well as the callable. Mocked here to keep this suite about indexing —
 * `poolNotifications.test.ts` covers what it decides to send.
 */
const mockNotifyLoanRequested = jest.fn()

jest.mock('./poolNotifications', () => ({
  ...jest.requireActual('./poolNotifications'),
  notifyLoanRequested: (...args: unknown[]) => mockNotifyLoanRequested(...args),
}))

const {
  fetchLoan,
  indexLoan,
  indexLoanFromLog,
  indexLoansByTxHash,
  loanDocId,
  parseLoanIdFromLog,
  LOAN_CREATED_TOPIC,
  LOAN_REPAID_TOPIC,
} = require('./loanIndexer')

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHAIN_ID = 31337
const POOL_ID = 7
const LOAN_ID = 3
const POOL_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3'
const FACTORY_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'
const BORROWER = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc'
const TX_HASH = `0x${'a'.repeat(64)}`
/** A second transaction, so "which one does the record point at" can be asked. */
const OTHER_TX_HASH = `0x${'b'.repeat(64)}`
const START_TIME = 1_700_000_000
/** Ten days into a thirty-day term. */
const REPAID_AT = new Date((START_TIME + 10 * 24 * 60 * 60) * 1000)

/** Real topic hashes, so the fixtures agree with the shipped ABI rather than with the test. */
const REAL_CREATED_TOPIC = new Interface([...LendingPoolABI]).getEvent('LoanCreated')!.topicHash

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildLog(overrides: Partial<{ topic: string; loanId: number; address: string; blockNumber: number }> = {}) {
  const { topic = LOAN_CREATED_TOPIC, loanId = LOAN_ID, address = POOL_ADDRESS, blockNumber = 120 } = overrides

  return {
    address,
    blockNumber,
    transactionHash: TX_HASH,
    index: 0,
    data: '0x',
    // All three parameters are indexed, so `data` is empty and `loanId` is topic 1.
    topics: [topic, `0x${loanId.toString(16).padStart(64, '0')}`, `0x${'0'.repeat(24)}${BORROWER.slice(2)}`, '0x0'],
  }
}

function buildChainLoan(overrides: Partial<{ isRepaid: boolean; amount: bigint; status: number; repaidAt: number }> = {}) {
  return {
    borrower: BORROWER,
    isRepaid: overrides.isRepaid ?? false,
    // Seconds, and 0 for a loan nobody has repaid — the contract's own zero.
    repaidAt: BigInt(overrides.repaidAt ?? 0),
    amount: overrides.amount ?? 5_000_000_000_000_000_000n,
    interestRate: 500n,
    startTime: BigInt(START_TIME),
    duration: 2_592_000n,
    // The contract enum, by ordinal: 0 = Disbursed.
    status: BigInt(overrides.status ?? 0),
  }
}

/** Firestore hands timestamps back as `Timestamp`, not `Date`. */
function timestampOf(date: Date) {
  return { toDate: () => date }
}

function buildFirestore(
  options: {
    exists?: boolean
    storedIsRepaid?: boolean
    storedStatus?: string
    storedRepaidAt?: Date
    storedStartedAt?: Date
    storedBlockNumber?: number
  } = {}
) {
  const {
    exists = false,
    storedIsRepaid = false,
    storedStatus = 'disbursed',
    storedRepaidAt,
    storedStartedAt = new Date(START_TIME * 1000),
    storedBlockNumber = 120,
  } = options
  const mockSet = jest.fn().mockResolvedValue(undefined)
  const storedData = {
    isRepaid: storedIsRepaid,
    status: storedStatus,
    startedAt: timestampOf(storedStartedAt),
    blockNumber: storedBlockNumber,
    ...(storedRepaidAt ? { repaidAt: timestampOf(storedRepaidAt) } : {}),
  }
  const mockDocRef = {
    get: jest.fn().mockResolvedValue({ exists, data: () => (exists ? storedData : undefined) }),
    set: mockSet,
  }
  const mockDoc = jest.fn().mockReturnValue(mockDocRef)
  const mockCollection = jest.fn().mockReturnValue({ doc: mockDoc })

  return { mockFs: { collection: mockCollection }, mockDocRef, mockDoc, mockCollection }
}

function buildProvider(receipt: object | null = null) {
  return {
    getTransactionReceipt: jest.fn().mockResolvedValue(receipt),
  }
}

const parsedLoan = {
  loanId: LOAN_ID,
  poolId: POOL_ID,
  poolAddress: POOL_ADDRESS,
  borrower: BORROWER.toLowerCase(),
  amount: '5000000000000000000',
  interestRate: 500,
  duration: 2_592_000,
  startedAt: new Date(START_TIME * 1000),
  isRepaid: false,
  status: 'disbursed' as const,
  chainId: CHAIN_ID,
  transactionHash: TX_HASH,
  blockNumber: 120,
}

beforeEach(() => {
  mockGetLoan.mockResolvedValue(buildChainLoan())
  mockGetPoolId.mockResolvedValue(BigInt(POOL_ID))
  mockNotifyLoanRequested.mockReset()
  mockNotifyLoanRequested.mockResolvedValue(undefined)
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('topic hashes', () => {
  it('should come from the shipped ABI', () => {
    // A hand-written hash would make every routing test agree with itself.
    expect(LOAN_CREATED_TOPIC).toBe(REAL_CREATED_TOPIC)
    expect(LOAN_REPAID_TOPIC).not.toBe(LOAN_CREATED_TOPIC)
  })
})

describe('loanDocId', () => {
  it('should key on the pool as well as the loan', () => {
    // `loanId` restarts at 1 in every pool clone, so a chain-and-loan key would
    // collide two pools' first loans onto one document.
    expect(loanDocId(CHAIN_ID, 7, 1)).toBe('31337-7-1')
    expect(loanDocId(CHAIN_ID, 8, 1)).not.toBe(loanDocId(CHAIN_ID, 7, 1))
  })
})

describe('parseLoanIdFromLog', () => {
  it('should read the id out of topic 1', () => {
    expect(parseLoanIdFromLog(buildLog({ loanId: 42 }))).toBe(42)
  })

  it('should read it identically from a repayment', () => {
    // Both events declare loanId first, which is what lets one path serve both.
    expect(parseLoanIdFromLog(buildLog({ topic: LOAN_REPAID_TOPIC, loanId: 42 }))).toBe(42)
  })
})

describe('fetchLoan', () => {
  it('should read the repayment stamp from the chain', async () => {
    // From state rather than the `LoanRepaid` log's block: the sweep sees
    // `LoanCreated` on every pass, so a date taken from whichever log arrived
    // would depend on which one that was.
    mockGetLoan.mockResolvedValue(buildChainLoan({ isRepaid: true, repaidAt: REPAID_AT.getTime() / 1000 }))

    const loan = await fetchLoan(LOAN_ID, POOL_ADDRESS, {})

    expect(loan.repaidAt).toEqual(REPAID_AT)
  })

  it('should report no stamp at all for an outstanding loan', async () => {
    // The contract's zero is "not repaid", and dating a settlement to 1970 is
    // exactly the kind of thing a reputation query would then count as late.
    const loan = await fetchLoan(LOAN_ID, POOL_ADDRESS, {})

    expect(loan.repaidAt).toBeUndefined()
  })

  it('should return the chain state, not the log', async () => {
    const loan = await fetchLoan(LOAN_ID, POOL_ADDRESS, {})

    expect(mockGetLoan).toHaveBeenCalledWith(LOAN_ID)
    expect(loan).toEqual({
      loanId: LOAN_ID,
      poolAddress: POOL_ADDRESS,
      borrower: BORROWER.toLowerCase(),
      amount: '5000000000000000000',
      interestRate: 500,
      duration: 2_592_000,
      startedAt: new Date(START_TIME * 1000),
      isRepaid: false,
      status: 'disbursed',
    })
  })

  it('should lowercase the borrower so listLoans can filter by wallet', async () => {
    const loan = await fetchLoan(LOAN_ID, POOL_ADDRESS, {})

    expect(loan.borrower).toBe(BORROWER.toLowerCase())
  })

  it('should report a settled loan as repaid', async () => {
    mockGetLoan.mockResolvedValue(buildChainLoan({ isRepaid: true }))

    const loan = await fetchLoan(LOAN_ID, POOL_ADDRESS, {})

    expect(loan.isRepaid).toBe(true)
  })
})

describe('indexLoan', () => {
  it('should write a loan that has never been indexed', async () => {
    const { mockFs, mockDocRef, mockDoc } = buildFirestore({ exists: false })

    const result = await indexLoan(parsedLoan, mockFs)

    expect(mockDoc).toHaveBeenCalledWith('31337-7-3')
    expect(mockDocRef.set).toHaveBeenCalledWith(expect.objectContaining({ loanId: LOAN_ID, isRepaid: false }), { merge: true })
    expect(result).toMatchObject({ alreadyIndexed: false, stored: true })
  })

  it('should rewrite the record when the loan has since been repaid', async () => {
    // The whole reason `create()` is not used: the second event for a loan is a
    // settlement of a document that already exists.
    const { mockFs, mockDocRef } = buildFirestore({ exists: true, storedIsRepaid: false })

    const result = await indexLoan({ ...parsedLoan, isRepaid: true }, mockFs)

    expect(mockDocRef.set).toHaveBeenCalledWith(expect.objectContaining({ isRepaid: true }), { merge: true })
    expect(result.stored).toBe(true)
  })

  it('should merge rather than replace', async () => {
    const { mockFs, mockDocRef } = buildFirestore({ exists: true })

    await indexLoan({ ...parsedLoan, isRepaid: true }, mockFs)

    expect(mockDocRef.set).toHaveBeenCalledWith(expect.anything(), { merge: true })
  })

  it('should write nothing when the record already matches the chain', async () => {
    // A sweep re-reads the `LoanCreated` log on every pass forever; without this
    // every pass would rewrite every loan it has ever seen.
    const { mockFs, mockDocRef } = buildFirestore({ exists: true, storedIsRepaid: false })

    const result = await indexLoan(parsedLoan, mockFs)

    expect(mockDocRef.set).not.toHaveBeenCalled()
    expect(result).toMatchObject({ alreadyIndexed: true, stored: false })
    expect(mockLogger.info).toHaveBeenCalledWith('Loan already current, skipping', expect.objectContaining({ loanId: LOAN_ID }))
  })

  it('should rewrite a request that has since been approved', async () => {
    // `isRepaid` is false either way, so comparing that alone would leave the
    // record stuck at `requested` for the life of the loan.
    const { mockFs, mockDocRef } = buildFirestore({ exists: true, storedStatus: 'requested' })

    const result = await indexLoan({ ...parsedLoan, status: 'disbursed' }, mockFs)

    expect(mockDocRef.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'disbursed' }), { merge: true })
    expect(result.stored).toBe(true)
  })

  it('should write nothing on a repeated repayment either', async () => {
    const { mockFs, mockDocRef } = buildFirestore({ exists: true, storedIsRepaid: true, storedRepaidAt: REPAID_AT })

    const result = await indexLoan({ ...parsedLoan, isRepaid: true, repaidAt: REPAID_AT }, mockFs)

    expect(mockDocRef.set).not.toHaveBeenCalled()
    expect(result.stored).toBe(false)
  })

  describe('repaidAt', () => {
    it('should store the repayment stamp', async () => {
      const { mockFs, mockDocRef } = buildFirestore({ exists: true, storedIsRepaid: false })

      await indexLoan({ ...parsedLoan, isRepaid: true, repaidAt: REPAID_AT }, mockFs)

      expect(mockDocRef.set).toHaveBeenCalledWith(expect.objectContaining({ repaidAt: REPAID_AT }), { merge: true })
    })

    it('should leave the field out entirely while the loan is outstanding', async () => {
      // Not written as undefined: Firestore rejects that outright, so a loan
      // that has not been repaid would fail to index at all.
      const { mockFs, mockDocRef } = buildFirestore({ exists: false })

      await indexLoan(parsedLoan, mockFs)

      expect(mockDocRef.set.mock.calls[0][0]).not.toHaveProperty('repaidAt')
    })

    it('should backfill a record that predates the field', async () => {
      // Settled before the contract recorded a stamp, so `isRepaid` and
      // `status` both already agree with the chain. Comparing only those would
      // report the record as current and never pick the date up.
      const { mockFs, mockDocRef } = buildFirestore({ exists: true, storedIsRepaid: true })

      const result = await indexLoan({ ...parsedLoan, isRepaid: true, repaidAt: REPAID_AT }, mockFs)

      expect(mockDocRef.set).toHaveBeenCalledWith(expect.objectContaining({ repaidAt: REPAID_AT }), { merge: true })
      expect(result.stored).toBe(true)
    })
  })

  describe('the transaction a record points at', () => {
    it('should stay on the loan when a repayment settles it', async () => {
      // `merge` alone does not do this — both fields are in the payload — so a
      // settlement would otherwise move the reference to the repayment while
      // the row went on showing the date the money went out.
      const { mockFs, mockDocRef } = buildFirestore({ exists: true, storedIsRepaid: false })

      await indexLoan({ ...parsedLoan, isRepaid: true, repaidAt: REPAID_AT, transactionHash: OTHER_TX_HASH, blockNumber: 500 }, mockFs)

      const written = mockDocRef.set.mock.calls[0][0]

      expect(written).not.toHaveProperty('transactionHash')
      expect(written).not.toHaveProperty('blockNumber')
    })

    it('should follow the loan when approval restamps its date', async () => {
      // `approveLoan` rewrites `startTime`, so the record is now dated by the
      // approval and has to link to it — pointing at the request would show a
      // date and a transaction from different blocks.
      const approvedAt = new Date((START_TIME + 3600) * 1000)
      const { mockFs, mockDocRef } = buildFirestore({ exists: true, storedStatus: 'requested' })

      await indexLoan({ ...parsedLoan, startedAt: approvedAt, transactionHash: OTHER_TX_HASH, blockNumber: 500 }, mockFs)

      expect(mockDocRef.set).toHaveBeenCalledWith(
        expect.objectContaining({ transactionHash: OTHER_TX_HASH, blockNumber: 500, startedAt: approvedAt }),
        { merge: true }
      )
    })

    it('should move to an earlier transaction carrying the same date', async () => {
      // Live-found. A loan first seen at its repayment points at the
      // repayment, and nothing would ever correct that — every field the
      // currency check compares already matches — so a row would show the
      // disbursement's date beside a link to the settlement. Events do not
      // have to arrive in order, and the earliest one carrying the loan's
      // current date is the one that set it.
      const { mockFs, mockDocRef } = buildFirestore({ exists: true, storedIsRepaid: true, storedBlockNumber: 500 })

      const result = await indexLoan({ ...parsedLoan, isRepaid: true, blockNumber: 120 }, mockFs)

      expect(mockDocRef.set).toHaveBeenCalledWith(expect.objectContaining({ transactionHash: TX_HASH, blockNumber: 120 }), {
        merge: true,
      })
      expect(result.stored).toBe(true)
    })

    it('should report a record already pointing at the earliest event as current', async () => {
      const { mockFs, mockDocRef } = buildFirestore({ exists: true, storedIsRepaid: true, storedBlockNumber: 120 })

      const result = await indexLoan({ ...parsedLoan, isRepaid: true, blockNumber: 120 }, mockFs)

      expect(mockDocRef.set).not.toHaveBeenCalled()
      expect(result).toMatchObject({ alreadyIndexed: true, stored: false })
    })

    it('should be set on a loan seen for the first time', async () => {
      const { mockFs, mockDocRef } = buildFirestore({ exists: false })

      await indexLoan(parsedLoan, mockFs)

      expect(mockDocRef.set).toHaveBeenCalledWith(expect.objectContaining({ transactionHash: TX_HASH, blockNumber: 120 }), {
        merge: true,
      })
    })
  })
})

describe('indexLoanFromLog', () => {
  it('should resolve the pool, read the chain and store the loan', async () => {
    const { mockFs } = buildFirestore()

    const indexed = await indexLoanFromLog(buildLog(), CHAIN_ID, FACTORY_ADDRESS, {}, mockFs)

    expect(indexed?.loan).toMatchObject({ loanId: LOAN_ID, poolId: POOL_ID, chainId: CHAIN_ID, transactionHash: TX_HASH })
    expect(indexed?.result.stored).toBe(true)
  })

  it('should return null for a contract the factory does not know', async () => {
    // Anyone can emit an identically-shaped event; indexing one would put a
    // stranger's debt in a user's list.
    mockGetPoolId.mockResolvedValue(0n)
    const { mockFs, mockDocRef } = buildFirestore()

    const indexed = await indexLoanFromLog(buildLog(), CHAIN_ID, FACTORY_ADDRESS, {}, mockFs)

    expect(indexed).toBeNull()
    expect(mockDocRef.set).not.toHaveBeenCalled()
  })

  it('should take the same path for a repayment', async () => {
    const { mockFs } = buildFirestore({ exists: true, storedIsRepaid: false })
    mockGetLoan.mockResolvedValue(buildChainLoan({ isRepaid: true }))

    const indexed = await indexLoanFromLog(buildLog({ topic: LOAN_REPAID_TOPIC }), CHAIN_ID, FACTORY_ADDRESS, {}, mockFs)

    expect(indexed?.loan.isRepaid).toBe(true)
    expect(indexed?.result.stored).toBe(true)
  })

  it('should record the block the log came from', async () => {
    const { mockFs } = buildFirestore()

    const indexed = await indexLoanFromLog(buildLog({ blockNumber: 456 }), CHAIN_ID, FACTORY_ADDRESS, {}, mockFs)

    expect(indexed?.loan.blockNumber).toBe(456)
  })
})

describe('indexLoansByTxHash', () => {
  function buildReceipt(logs: object[], status = 1) {
    return { status, blockNumber: 120, logs }
  }

  it('should index every loan event in the transaction', async () => {
    const { mockFs } = buildFirestore()
    const provider = buildProvider(buildReceipt([buildLog()]))

    const { loans, results } = await indexLoansByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, provider, mockFs)

    expect(loans).toHaveLength(1)
    expect(results[0].stored).toBe(true)
  })

  it('should ignore logs from other events in the same transaction', async () => {
    const { mockFs } = buildFirestore()
    const provider = buildProvider(buildReceipt([{ ...buildLog(), topics: ['0xsomethingelse'] }, buildLog()]))

    const { loans } = await indexLoansByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, provider, mockFs)

    expect(loans).toHaveLength(1)
  })

  it('should accept a repayment as readily as a borrow', async () => {
    const { mockFs } = buildFirestore()
    const provider = buildProvider(buildReceipt([buildLog({ topic: LOAN_REPAID_TOPIC })]))

    const { loans } = await indexLoansByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, provider, mockFs)

    expect(loans).toHaveLength(1)
  })

  it('should reject a transaction with no receipt', async () => {
    const { mockFs } = buildFirestore()

    await expect(indexLoansByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, buildProvider(null), mockFs)).rejects.toMatchObject({
      code: 'not-found',
    })
  })

  it('should reject a reverted transaction', async () => {
    const { mockFs } = buildFirestore()
    const provider = buildProvider(buildReceipt([buildLog()], 0))

    await expect(indexLoansByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, provider, mockFs)).rejects.toMatchObject({
      code: 'failed-precondition',
    })
  })

  it('should reject a transaction carrying no loan event', async () => {
    const { mockFs } = buildFirestore()
    const provider = buildProvider(buildReceipt([]))

    await expect(indexLoansByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, provider, mockFs)).rejects.toMatchObject({ code: 'not-found' })
  })

  it('should reject a loan from a pool this factory did not deploy', async () => {
    // The callable raises what the sweep merely skips: someone asked about this
    // exact transaction, so silence would be the wrong answer.
    mockGetPoolId.mockResolvedValue(0n)
    const { mockFs } = buildFirestore()
    const provider = buildProvider(buildReceipt([buildLog()]))

    await expect(indexLoansByTxHash(TX_HASH, CHAIN_ID, FACTORY_ADDRESS, provider, mockFs)).rejects.toMatchObject({ code: 'not-found' })
  })
})

// ---------------------------------------------------------------------------
// Transitions.
//
// What the notification service triggers on, and deliberately not `stored`.
// The distinction matters more here than for memberships: this indexer writes
// the document when only the transaction reference moved to an earlier block,
// so a notification on `stored` would tell a borrower their loan was approved
// because a sweep tidied up a hash.
// ---------------------------------------------------------------------------

describe('indexLoan transitions', () => {
  it('reports a request from a loan with no record', async () => {
    const { mockFs } = buildFirestore({ exists: false })

    const result = await indexLoan({ ...parsedLoan, status: 'requested' }, mockFs)

    expect(result.transition).toBe('requested')
  })

  it('reports a borrow from a pool that lends on demand', async () => {
    // `createLoan` disburses in the same transaction, so there was never a
    // request to observe and absent → disbursed is the whole story.
    const { mockFs } = buildFirestore({ exists: false })

    const result = await indexLoan(parsedLoan, mockFs)

    expect(result.transition).toBe('disbursed')
  })

  it('reports the owner approving a request', async () => {
    const { mockFs } = buildFirestore({ exists: true, storedStatus: 'requested' })

    const result = await indexLoan(parsedLoan, mockFs)

    expect(result.transition).toBe('disbursed')
  })

  it('reports the owner rejecting a request', async () => {
    const { mockFs } = buildFirestore({ exists: true, storedStatus: 'requested' })

    const result = await indexLoan({ ...parsedLoan, status: 'rejected' }, mockFs)

    expect(result.transition).toBe('rejected')
  })

  it('reports a repayment', async () => {
    const { mockFs } = buildFirestore({ exists: true, storedStatus: 'disbursed', storedIsRepaid: false })

    const result = await indexLoan({ ...parsedLoan, isRepaid: true, repaidAt: REPAID_AT }, mockFs)

    expect(result.transition).toBe('repaid')
  })

  it('reports the repayment when a loan is created and settled between sweeps', async () => {
    // Both facts are new; the settlement is the later one and the one somebody
    // is waiting on.
    const { mockFs } = buildFirestore({ exists: false })

    const result = await indexLoan({ ...parsedLoan, isRepaid: true, repaidAt: REPAID_AT }, mockFs)

    expect(result.transition).toBe('repaid')
  })

  // The regression this whole field exists for.
  it('reports nothing when only the transaction reference moved', async () => {
    const { mockFs, mockDocRef } = buildFirestore({ exists: true, storedStatus: 'requested', storedBlockNumber: 200 })

    const result = await indexLoan({ ...parsedLoan, status: 'requested', blockNumber: 100, transactionHash: OTHER_TX_HASH }, mockFs)

    // The write still happens — the reference genuinely is being corrected.
    expect(mockDocRef.set).toHaveBeenCalled()
    expect(result.stored).toBe(true)
    // But nothing happened that anybody needs telling about.
    expect(result.transition).toBeNull()
  })

  it('reports nothing when the record already matches the chain', async () => {
    const { mockFs } = buildFirestore({ exists: true, storedStatus: 'disbursed', storedIsRepaid: false })

    const result = await indexLoan(parsedLoan, mockFs)

    expect(result).toMatchObject({ alreadyIndexed: true, stored: false, transition: null })
  })

  it('reports nothing when a repaid loan is re-scanned', async () => {
    // The sweep sees `LoanCreated` on every pass, long after the repayment.
    const { mockFs } = buildFirestore({
      exists: true,
      storedStatus: 'disbursed',
      storedIsRepaid: true,
      storedRepaidAt: REPAID_AT,
    })

    const result = await indexLoan({ ...parsedLoan, isRepaid: true, repaidAt: REPAID_AT }, mockFs)

    expect(result.transition).toBeNull()
  })

  it('reports a rejection of a request never indexed as one', async () => {
    // A borrower who cancels before any sweep saw the request: the record is
    // created straight at `rejected`.
    const { mockFs } = buildFirestore({ exists: false })

    const result = await indexLoan({ ...parsedLoan, status: 'rejected' }, mockFs)

    expect(result.transition).toBe('rejected')
  })

  it('treats a record written before `status` existed as absent', async () => {
    // It has no previous state to have moved from, so whatever the chain says
    // now is the news. Built inline because the shared helper always supplies a
    // status, which is exactly what this record does not have.
    const mockFs = {
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: true, data: () => ({ isRepaid: false, blockNumber: 120 }) }),
          set: jest.fn().mockResolvedValue(undefined),
        }),
      }),
    }

    const result = await indexLoan({ ...parsedLoan, status: 'requested' }, mockFs)

    expect(result.transition).toBe('requested')
  })

  it('reports nothing further about a rejected loan', async () => {
    // Rejection is final; nothing moves out of it.
    const { mockFs } = buildFirestore({ exists: true, storedStatus: 'rejected' })

    const result = await indexLoan({ ...parsedLoan, status: 'rejected' }, mockFs)

    expect(result.transition).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Notification dispatch.
//
// Wired into `indexLoanFromLog` rather than into the callable, so a request
// made while the app was closed — which only the sweep will see — still reaches
// the owner.
// ---------------------------------------------------------------------------

describe('indexLoanFromLog notifications', () => {
  it('offers every indexed loan to the notification service', async () => {
    const { mockFs } = buildFirestore({ exists: false })

    await indexLoanFromLog(buildLog(), CHAIN_ID, FACTORY_ADDRESS, buildProvider(), mockFs)

    expect(mockNotifyLoanRequested).toHaveBeenCalledWith(
      expect.objectContaining({ transition: expect.anything() }),
      expect.objectContaining({ loanId: LOAN_ID }),
      mockFs
    )
  })

  it('indexes the loan even when the notification fails', async () => {
    // Indexing is the job; push is an enhancement. An unreachable Expo must not
    // turn a successful index into an error the user is shown.
    mockNotifyLoanRequested.mockRejectedValue(new Error('expo unreachable'))
    const { mockFs, mockDocRef } = buildFirestore({ exists: false })

    const indexed = await indexLoanFromLog(buildLog(), CHAIN_ID, FACTORY_ADDRESS, buildProvider(), mockFs)

    expect(indexed).not.toBeNull()
    expect(indexed!.result.stored).toBe(true)
    expect(mockDocRef.set).toHaveBeenCalled()
    expect(mockLogger.error).toHaveBeenCalled()
  })

  it('logs a notification failure that was not thrown as an Error', async () => {
    // A rejected promise carrying a string still has to be loggable.
    mockNotifyLoanRequested.mockRejectedValue('expo unreachable')
    const { mockFs } = buildFirestore({ exists: false })

    const indexed = await indexLoanFromLog(buildLog(), CHAIN_ID, FACTORY_ADDRESS, buildProvider(), mockFs)

    expect(indexed!.result.stored).toBe(true)
    expect(mockLogger.error).toHaveBeenCalled()
  })

  it('does not reach the notification service for a contract the factory disowns', async () => {
    mockGetPoolId.mockResolvedValue(BigInt(0))
    const { mockFs } = buildFirestore({ exists: false })

    await expect(indexLoanFromLog(buildLog(), CHAIN_ID, FACTORY_ADDRESS, buildProvider(), mockFs)).resolves.toBeNull()
    expect(mockNotifyLoanRequested).not.toHaveBeenCalled()
  })
})
