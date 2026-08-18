import { Interface } from 'ethers'
import { mockLogger } from '../__tests__/setup'
import { LendingPoolABI } from '../constants'

const mockGetLoan = jest.fn()
const mockGetPoolId = jest.fn()
/** Only reached for a loan that predates accrual; see `accrualOf`. */
const mockLoanBalance = jest.fn()

// Mock ethers BEFORE importing the module: it builds a top-level Interface and
// reads two topic hashes from it at load time.
jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers')
  return {
    ...actual,
    Contract: jest.fn().mockImplementation(() => ({ getLoan: mockGetLoan, getPoolId: mockGetPoolId, loanBalance: mockLoanBalance })),
  }
})

/**
 * Notifications are dispatched from `indexLoanFromLog`, so the sweep notifies
 * as well as the callable. Mocked here to keep this suite about indexing —
 * `poolNotifications.test.ts` covers what it decides to send.
 */
const mockNotifyLoanRequested = jest.fn()
const mockNotifyLoanDecided = jest.fn()

jest.mock('./poolNotifications', () => ({
  ...jest.requireActual('./poolNotifications'),
  notifyLoanRequested: (...args: unknown[]) => mockNotifyLoanRequested(...args),
  notifyLoanDecided: (...args: unknown[]) => mockNotifyLoanDecided(...args),
}))

/**
 * A loan purpose is staged under the transaction that asked for the loan and
 * moved onto the loan here, where both are in hand. Mocked for the same reason
 * the notifications are — `notes.test.ts` covers what the move does.
 */
const mockResolveStagedNote = jest.fn()

jest.mock('./notes', () => ({
  ...jest.requireActual('./notes'),
  resolveStagedNote: (...args: unknown[]) => mockResolveStagedNote(...args),
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

function buildChainLoan(
  overrides: Partial<{
    isRepaid: boolean
    amount: bigint
    status: number
    repaidAt: number
    amountRepaid: bigint
    principalOutstanding: bigint
    interestOutstanding: bigint
    /** Seconds. 0 marks a loan made before interest accrued. */
    accruedAt: number
    /** Seconds. 0 is the contract's "nobody declared this". */
    defaultedAt: number
  }> = {}
) {
  return {
    borrower: BORROWER,
    isRepaid: overrides.isRepaid ?? false,
    // Seconds, and 0 for a loan nobody has repaid — the contract's own zero.
    repaidAt: BigInt(overrides.repaidAt ?? 0),
    // The running total, in wei. 0 on a loan nobody has paid towards.
    amountRepaid: overrides.amountRepaid ?? 0n,
    principalOutstanding: overrides.principalOutstanding ?? 5_000_000_000_000_000_000n,
    interestOutstanding: overrides.interestOutstanding ?? 0n,
    accruedAt: BigInt(overrides.accruedAt ?? START_TIME),
    defaultedAt: BigInt(overrides.defaultedAt ?? 0),
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
    /** `null` writes no `amountRepaid` at all — a record from before the field existed. */
    storedAmountRepaid?: string | null
    storedPrincipalOutstanding?: string
    storedInterestOutstanding?: string
    storedAccruedAt?: Date | null
    storedDefaultedAt?: Date
  } = {}
) {
  const {
    exists = false,
    storedIsRepaid = false,
    storedStatus = 'disbursed',
    storedRepaidAt,
    storedStartedAt = new Date(START_TIME * 1000),
    storedBlockNumber = 120,
    storedAmountRepaid = '0',
    storedPrincipalOutstanding = '5000000000000000000',
    storedInterestOutstanding = '0',
    storedAccruedAt = new Date(START_TIME * 1000),
    storedDefaultedAt,
  } = options
  const mockSet = jest.fn().mockResolvedValue(undefined)
  const storedData = {
    isRepaid: storedIsRepaid,
    status: storedStatus,
    ...(storedAmountRepaid === null ? {} : { amountRepaid: storedAmountRepaid }),
    principalOutstanding: storedPrincipalOutstanding,
    interestOutstanding: storedInterestOutstanding,
    ...(storedAccruedAt === null ? {} : { accruedAt: timestampOf(storedAccruedAt) }),
    startedAt: timestampOf(storedStartedAt),
    blockNumber: storedBlockNumber,
    ...(storedRepaidAt ? { repaidAt: timestampOf(storedRepaidAt) } : {}),
    ...(storedDefaultedAt ? { defaultedAt: timestampOf(storedDefaultedAt) } : {}),
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
  amountRepaid: '0',
  principalOutstanding: '5000000000000000000',
  interestOutstanding: '0',
  accruedAt: new Date(START_TIME * 1000),
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
  mockNotifyLoanDecided.mockReset()
  mockNotifyLoanDecided.mockResolvedValue(undefined)
  mockResolveStagedNote.mockReset()
  // Nothing staged: the ordinary case, since a purpose is optional.
  mockResolveStagedNote.mockResolvedValue(null)
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
      amountRepaid: '0',
      principalOutstanding: '5000000000000000000',
      interestOutstanding: '0',
      accruedAt: new Date(START_TIME * 1000),
      repaidAt: undefined,
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
    const { mockFs, mockDocRef } = buildFirestore({
      exists: true,
      storedIsRepaid: true,
      storedRepaidAt: REPAID_AT,
      storedAmountRepaid: '5250000000000000000',
    })

    const result = await indexLoan({ ...parsedLoan, isRepaid: true, repaidAt: REPAID_AT, amountRepaid: '5250000000000000000' }, mockFs)

    expect(mockDocRef.set).not.toHaveBeenCalled()
    expect(result.stored).toBe(false)
  })

  /**
   * The sharpest case the currency check has to catch.
   *
   * An instalment moves `amountRepaid` and nothing else: same status, same
   * `isRepaid`, same `startedAt`, same block ordering. Every other field the
   * comparison looks at already matches, so without this one the record would
   * be reported as current and keep claiming the whole debt is outstanding.
   */
  it('should rewrite a loan that has been paid down without being settled', async () => {
    const { mockFs, mockDocRef } = buildFirestore({ exists: true, storedIsRepaid: false, storedAmountRepaid: '0' })

    const result = await indexLoan({ ...parsedLoan, amountRepaid: '2000000000000000000' }, mockFs)

    expect(mockDocRef.set).toHaveBeenCalledWith(expect.objectContaining({ amountRepaid: '2000000000000000000', isRepaid: false }), {
      merge: true,
    })
    expect(result).toMatchObject({ alreadyIndexed: false, stored: true })
  })

  it('should let a record written before instalments existed pick the total up', async () => {
    const { mockFs, mockDocRef } = buildFirestore({ exists: true, storedIsRepaid: false, storedAmountRepaid: null })

    const result = await indexLoan({ ...parsedLoan, amountRepaid: '2000000000000000000' }, mockFs)

    expect(mockDocRef.set).toHaveBeenCalledWith(expect.objectContaining({ amountRepaid: '2000000000000000000' }), { merge: true })
    expect(result.stored).toBe(true)
  })

  it('should not take the reference from a payment, which does not move the loan’s date', async () => {
    // Same rule `LoanRepaid` follows: the record points at the transaction that
    // put the loan into the dating it carries, and an instalment is a later
    // block that leaves `startTime` alone.
    const { mockFs, mockDocRef } = buildFirestore({ exists: true, storedIsRepaid: false, storedBlockNumber: 120 })

    await indexLoan({ ...parsedLoan, amountRepaid: '2000000000000000000', transactionHash: OTHER_TX_HASH, blockNumber: 400 }, mockFs)

    const written = mockDocRef.set.mock.calls[0][0]
    expect(written).not.toHaveProperty('transactionHash')
    expect(written).not.toHaveProperty('blockNumber')
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

describe('the accrual snapshot', () => {
  it('should read the snapshot straight off a loan that accrues', async () => {
    mockGetLoan.mockResolvedValue(
      buildChainLoan({
        principalOutstanding: 4_000_000_000_000_000_000n,
        interestOutstanding: 120_000_000_000_000_000n,
        accruedAt: START_TIME + 600,
      })
    )

    const loan = await fetchLoan(LOAN_ID, POOL_ADDRESS, {})

    expect(loan.principalOutstanding).toBe('4000000000000000000')
    expect(loan.interestOutstanding).toBe('120000000000000000')
    expect(loan.accruedAt).toEqual(new Date((START_TIME + 600) * 1000))
    // No second call: the struct already said everything.
    expect(mockLoanBalance).not.toHaveBeenCalled()
  })

  /**
   * A loan made before interest accrued reads all three fields as zero,
   * because none of them existed when it was written. Storing that literally
   * would tell the app the principal is already back.
   */
  it('should price a loan that predates accrual from the chain, not from zeroes', async () => {
    mockGetLoan.mockResolvedValue(buildChainLoan({ accruedAt: 0, principalOutstanding: 0n, interestOutstanding: 0n }))
    mockLoanBalance.mockResolvedValue([5_000_000_000_000_000_000n, 250_000_000_000_000_000n])

    const loan = await fetchLoan(LOAN_ID, POOL_ADDRESS, {})

    expect(mockLoanBalance).toHaveBeenCalledWith(LOAN_ID)
    expect(loan.principalOutstanding).toBe('5000000000000000000')
    expect(loan.interestOutstanding).toBe('250000000000000000')
  })

  /**
   * Absent, not zero, and the difference is load-bearing: an unconverted loan
   * does not accrue until its first payment, so a reader that projected one
   * forward would show interest the contract will not charge.
   */
  it('should leave a pre-accrual loan without a snapshot date', async () => {
    mockGetLoan.mockResolvedValue(buildChainLoan({ accruedAt: 0, principalOutstanding: 0n, interestOutstanding: 0n }))
    mockLoanBalance.mockResolvedValue([5_000_000_000_000_000_000n, 250_000_000_000_000_000n])

    const loan = await fetchLoan(LOAN_ID, POOL_ADDRESS, {})

    expect(loan.accruedAt).toBeUndefined()
  })

  it('should omit the date from the write rather than storing undefined', async () => {
    // Firestore rejects an undefined value, and under `merge` an absent key
    // leaves whatever is there — which is the same shape `repaidAt` uses.
    const { mockFs, mockDocRef } = buildFirestore({ exists: false })

    await indexLoan({ ...parsedLoan, accruedAt: undefined }, mockFs)

    expect(mockDocRef.set).toHaveBeenCalledWith(expect.not.objectContaining({ accruedAt: expect.anything() }), { merge: true })
  })

  /**
   * The snapshot moves on every payment and only on a payment — nothing else
   * calls `_accrue`. So a record whose snapshot has moved is a record with
   * news in it, and the currency check has to notice.
   */
  it('should rewrite a loan whose snapshot has moved', async () => {
    const { mockFs, mockDocRef } = buildFirestore({ exists: true })

    const result = await indexLoan(
      { ...parsedLoan, interestOutstanding: '90000000000000000', accruedAt: new Date((START_TIME + 3600) * 1000) },
      mockFs
    )

    expect(mockDocRef.set).toHaveBeenCalledWith(expect.objectContaining({ interestOutstanding: '90000000000000000' }), { merge: true })
    expect(result.stored).toBe(true)
  })

  it('should write nothing when the snapshot is unchanged', async () => {
    const { mockFs, mockDocRef } = buildFirestore({ exists: true })

    const result = await indexLoan(parsedLoan, mockFs)

    expect(mockDocRef.set).not.toHaveBeenCalled()
    expect(result.alreadyIndexed).toBe(true)
  })

  it('should rewrite a loan whose principal has come down', async () => {
    const { mockFs, mockDocRef } = buildFirestore({ exists: true })

    const result = await indexLoan({ ...parsedLoan, principalOutstanding: '3000000000000000000' }, mockFs)

    expect(mockDocRef.set).toHaveBeenCalledWith(expect.objectContaining({ principalOutstanding: '3000000000000000000' }), { merge: true })
    expect(result.stored).toBe(true)
  })
})

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

  it('reports the owner approving a request, distinctly from a borrow', async () => {
    // Both journeys end at `disbursed`, and only the state moved *from*
    // separates them. Collapsing the two congratulates every borrower on a
    // transaction they sent themselves a second ago.
    const { mockFs } = buildFirestore({ exists: true, storedStatus: 'requested' })

    const result = await indexLoan(parsedLoan, mockFs)

    expect(result.transition).toBe('approved')
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
      storedAmountRepaid: '5250000000000000000',
    })

    const result = await indexLoan({ ...parsedLoan, isRepaid: true, repaidAt: REPAID_AT, amountRepaid: '5250000000000000000' }, mockFs)

    expect(result.transition).toBeNull()
  })

  /**
   * An instalment moves the loan without settling it — a state the record
   * could not be in until `repayLoan` accepted part payments.
   */
  it('reports a payment that does not close the debt', async () => {
    const { mockFs } = buildFirestore({ exists: true, storedStatus: 'disbursed', storedIsRepaid: false, storedAmountRepaid: '0' })

    const result = await indexLoan({ ...parsedLoan, amountRepaid: '2000000000000000000' }, mockFs)

    expect(result.transition).toBe('repayment')
  })

  it('reports the settlement, not a payment, on the instalment that finishes it', async () => {
    // Both are true of the last payment. The debt ending is the larger fact
    // and the one anything downstream is waiting on.
    const { mockFs } = buildFirestore({
      exists: true,
      storedStatus: 'disbursed',
      storedIsRepaid: false,
      storedAmountRepaid: '2000000000000000000',
    })

    const result = await indexLoan({ ...parsedLoan, isRepaid: true, repaidAt: REPAID_AT, amountRepaid: '5250000000000000000' }, mockFs)

    expect(result.transition).toBe('repaid')
  })

  it('reports nothing when the same instalment is swept twice', async () => {
    const { mockFs } = buildFirestore({
      exists: true,
      storedStatus: 'disbursed',
      storedIsRepaid: false,
      storedAmountRepaid: '2000000000000000000',
    })

    const result = await indexLoan({ ...parsedLoan, amountRepaid: '2000000000000000000' }, mockFs)

    expect(result).toMatchObject({ alreadyIndexed: true, stored: false, transition: null })
  })

  /**
   * The backfill trap.
   *
   * A record written before the contract counted instalments has no
   * `amountRepaid` at all, so the first sweep afterwards sees the chain
   * reporting the full sum against an absent field. On a settled loan that is
   * not news — it was already known to be repaid — and announcing a payment
   * for every settled loan in the index is what the gate on `isRepaid`
   * prevents.
   */
  it('reports nothing when a settled loan picks up a total it never stored', async () => {
    const { mockFs, mockDocRef } = buildFirestore({
      exists: true,
      storedStatus: 'disbursed',
      storedIsRepaid: true,
      storedRepaidAt: REPAID_AT,
      storedAmountRepaid: null,
    })

    const result = await indexLoan({ ...parsedLoan, isRepaid: true, repaidAt: REPAID_AT, amountRepaid: '5250000000000000000' }, mockFs)

    // The write happens — the record genuinely gains the field.
    expect(mockDocRef.set).toHaveBeenCalledWith(expect.objectContaining({ amountRepaid: '5250000000000000000' }), { merge: true })
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

// ---------------------------------------------------------------------------
// The purpose a borrower stated.
//
// Written before the loan existed — the contract assigns the id when the
// transaction is mined — so it is staged under the transaction and moved here.
// ---------------------------------------------------------------------------

describe('indexLoanFromLog and a staged purpose', () => {
  it('moves it onto the loan a lend-on-demand pool created', async () => {
    const { mockFs } = buildFirestore({ exists: false })

    await indexLoanFromLog(buildLog(), CHAIN_ID, FACTORY_ADDRESS, buildProvider(), mockFs)

    expect(mockResolveStagedNote).toHaveBeenCalledWith(
      CHAIN_ID,
      expect.any(String),
      loanDocId(CHAIN_ID, POOL_ID, LOAN_ID),
      'loan_purpose',
      BORROWER.toLowerCase(),
      POOL_ID,
      mockFs
    )
  })

  it('moves it onto a request at a pool that reviews them', async () => {
    mockGetLoan.mockResolvedValue(buildChainLoan({ status: 1 }))
    const { mockFs } = buildFirestore({ exists: false })

    await indexLoanFromLog(buildLog(), CHAIN_ID, FACTORY_ADDRESS, buildProvider(), mockFs)

    expect(mockResolveStagedNote).toHaveBeenCalled()
  })

  // The check that keeps this cheap, and the one a mutation would break
  // silently: every other transition would cost a read per log forever and
  // find nothing — and would move the note again on the approval, whose
  // transaction staged nothing.
  it('does not look on a transition that did not create the loan', async () => {
    mockGetLoan.mockResolvedValue(buildChainLoan({ status: 0 }))
    const { mockFs } = buildFirestore({ exists: true, storedStatus: 'requested' })

    await indexLoanFromLog(buildLog(), CHAIN_ID, FACTORY_ADDRESS, buildProvider(), mockFs)

    expect(mockResolveStagedNote).not.toHaveBeenCalled()
  })

  it('indexes the loan even when the purpose cannot be attached', async () => {
    // A note is never load-bearing: losing one must not fail an index.
    mockResolveStagedNote.mockRejectedValue(new Error('firestore is down'))
    const { mockFs } = buildFirestore({ exists: false })

    const indexed = await indexLoanFromLog(buildLog(), CHAIN_ID, FACTORY_ADDRESS, buildProvider(), mockFs)

    expect(indexed!.result.stored).toBe(true)
    expect(mockLogger.error).toHaveBeenCalled()
  })

  it('attaches the purpose before the owner is told there is something to decide', async () => {
    const order: string[] = []
    mockResolveStagedNote.mockImplementation(async () => void order.push('note'))
    mockNotifyLoanRequested.mockImplementation(async () => void order.push('notify'))
    const { mockFs } = buildFirestore({ exists: false })

    await indexLoanFromLog(buildLog(), CHAIN_ID, FACTORY_ADDRESS, buildProvider(), mockFs)

    expect(order).toEqual(['note', 'notify'])
  })
})

// ---------------------------------------------------------------------------
// A loan the owner declared in default.
// ---------------------------------------------------------------------------

/** Forty days in: past a thirty-day term. */
const DECLARED_AT_SECONDS = START_TIME + 40 * 24 * 60 * 60
const DECLARED_AT = new Date(DECLARED_AT_SECONDS * 1000)

describe('a defaulted loan', () => {
  it('reads the contract enum ordinal 3 as defaulted', async () => {
    // The ordinal has to track the Solidity enum exactly: it was appended
    // there, so it is appended here, and reordering either relabels history.
    mockGetLoan.mockResolvedValue(buildChainLoan({ status: 3, defaultedAt: DECLARED_AT_SECONDS }))

    const loan = await fetchLoan(LOAN_ID, POOL_ADDRESS, {})

    expect(loan.status).toBe('defaulted')
  })

  it('turns the chain zero back into an absence', async () => {
    // Same rule as `repaidAt`: 0 means "never", and letting it through would
    // date every undeclared loan to 1970.
    mockGetLoan.mockResolvedValue(buildChainLoan())

    const loan = await fetchLoan(LOAN_ID, POOL_ADDRESS, {})

    expect(loan.defaultedAt).toBeUndefined()
  })

  it('reads the declaration stamp when there is one', async () => {
    mockGetLoan.mockResolvedValue(buildChainLoan({ status: 3, defaultedAt: DECLARED_AT_SECONDS }))

    const loan = await fetchLoan(LOAN_ID, POOL_ADDRESS, {})

    expect(loan.defaultedAt).toEqual(DECLARED_AT)
  })

  it('omits the stamp from the write rather than storing undefined', async () => {
    const { mockFs, mockDocRef } = buildFirestore({ exists: false })

    await indexLoan(parsedLoan, mockFs)

    expect(mockDocRef.set).toHaveBeenCalledWith(expect.not.objectContaining({ defaultedAt: expect.anything() }), { merge: true })
  })

  it('rewrites a loan that has just been declared', async () => {
    // The sharpest version of the currency check: a declaration moves the
    // status and the stamp and *nothing else* — same amount, same
    // `amountRepaid`, same accrual snapshot if no payment came with it. Without
    // the stamp in the comparison this reads as already indexed.
    const { mockFs, mockDocRef } = buildFirestore({ exists: true, storedStatus: 'disbursed' })

    const result = await indexLoan({ ...parsedLoan, status: 'defaulted', defaultedAt: DECLARED_AT }, mockFs)

    expect(result.stored).toBe(true)
    expect(mockDocRef.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'defaulted', defaultedAt: DECLARED_AT }), {
      merge: true,
    })
  })

  it('writes nothing when the declaration is already recorded', async () => {
    const { mockFs, mockDocRef } = buildFirestore({
      exists: true,
      storedStatus: 'defaulted',
      storedDefaultedAt: DECLARED_AT,
    })

    const result = await indexLoan({ ...parsedLoan, status: 'defaulted', defaultedAt: DECLARED_AT }, mockFs)

    expect(mockDocRef.set).not.toHaveBeenCalled()
    expect(result.alreadyIndexed).toBe(true)
  })

  it('reports the declaration as a transition', async () => {
    const { mockFs } = buildFirestore({ exists: true, storedStatus: 'disbursed' })

    const result = await indexLoan({ ...parsedLoan, status: 'defaulted', defaultedAt: DECLARED_AT }, mockFs)

    expect(result.transition).toBe('defaulted')
  })

  it('keeps the declaration when the debt is finally settled', async () => {
    // Paying does not undo the declaration on chain, so the index must not
    // undo it either: `defaulted` plus `isRepaid` is a recovery, and it is a
    // different fact from a loan that was never late.
    const { mockFs, mockDocRef } = buildFirestore({
      exists: true,
      storedStatus: 'defaulted',
      storedDefaultedAt: DECLARED_AT,
    })

    const result = await indexLoan(
      { ...parsedLoan, status: 'defaulted', defaultedAt: DECLARED_AT, isRepaid: true, repaidAt: REPAID_AT },
      mockFs
    )

    expect(result.transition).toBe('repaid')
    expect(mockDocRef.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'defaulted', isRepaid: true }), { merge: true })
  })

  it('does not announce a declaration twice', async () => {
    const { mockFs } = buildFirestore({
      exists: true,
      storedStatus: 'defaulted',
      storedDefaultedAt: DECLARED_AT,
      storedBlockNumber: 100,
    })

    // Same state, an earlier transaction reference: the write happens, but
    // only to correct the reference. `stored` is not news.
    const result = await indexLoan({ ...parsedLoan, status: 'defaulted', defaultedAt: DECLARED_AT, blockNumber: 90 }, mockFs)

    expect(result.stored).toBe(true)
    expect(result.transition).toBeNull()
  })

  it('dispatches the borrower-facing notification from the log path', async () => {
    // Here rather than in the callable, so the sweep notifies too.
    mockGetLoan.mockResolvedValue(buildChainLoan({ status: 3, defaultedAt: DECLARED_AT_SECONDS }))
    const { mockFs } = buildFirestore({ exists: true, storedStatus: 'disbursed' })

    await indexLoanFromLog(buildLog(), CHAIN_ID, FACTORY_ADDRESS, {}, mockFs)

    expect(mockNotifyLoanDecided).toHaveBeenCalledWith(
      expect.objectContaining({ transition: 'defaulted' }),
      expect.objectContaining({ status: 'defaulted' }),
      expect.anything(),
      mockFs
    )
  })

  it('indexes the loan even when the borrower cannot be told', async () => {
    // Indexing is the job; push is an enhancement. A thrown notification must
    // not turn a successful index into an error the user is shown.
    mockNotifyLoanDecided.mockRejectedValue(new Error('expo is down'))
    mockGetLoan.mockResolvedValue(buildChainLoan({ status: 3, defaultedAt: DECLARED_AT_SECONDS }))
    const { mockFs } = buildFirestore({ exists: true, storedStatus: 'disbursed' })

    const indexed = await indexLoanFromLog(buildLog(), CHAIN_ID, FACTORY_ADDRESS, {}, mockFs)

    expect(indexed.result.stored).toBe(true)
    expect(mockLogger.error).toHaveBeenCalledWith('Loan decision notification failed; indexing stands', expect.anything())
  })

  it('refuses an ordinal the build does not know', async () => {
    // A pool upgraded past this build would otherwise be read as disbursed,
    // which is a lie rather than a gap.
    mockGetLoan.mockResolvedValue(buildChainLoan({ status: 9 }))

    await expect(fetchLoan(LOAN_ID, POOL_ADDRESS, {})).rejects.toThrow('Unknown LoanStatus ordinal from chain: 9')
  })
})
