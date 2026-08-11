import { Interface } from 'ethers'
import { mockLogger } from '../__tests__/setup'
import { SampleLendingPoolABI } from '../constants'

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
const START_TIME = 1_700_000_000

/** Real topic hashes, so the fixtures agree with the shipped ABI rather than with the test. */
const REAL_CREATED_TOPIC = new Interface([...SampleLendingPoolABI]).getEvent('LoanCreated')!.topicHash

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

function buildChainLoan(overrides: Partial<{ isRepaid: boolean; amount: bigint }> = {}) {
  return {
    borrower: BORROWER,
    isRepaid: overrides.isRepaid ?? false,
    amount: overrides.amount ?? 5_000_000_000_000_000_000n,
    interestRate: 500n,
    startTime: BigInt(START_TIME),
    duration: 2_592_000n,
  }
}

function buildFirestore(options: { exists?: boolean; storedIsRepaid?: boolean } = {}) {
  const { exists = false, storedIsRepaid = false } = options
  const mockSet = jest.fn().mockResolvedValue(undefined)
  const mockDocRef = {
    get: jest.fn().mockResolvedValue({ exists, data: () => (exists ? { isRepaid: storedIsRepaid } : null) }),
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
  chainId: CHAIN_ID,
  transactionHash: TX_HASH,
  blockNumber: 120,
}

beforeEach(() => {
  mockGetLoan.mockResolvedValue(buildChainLoan())
  mockGetPoolId.mockResolvedValue(BigInt(POOL_ID))
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

  it('should merge rather than replace, so the creating transaction survives', async () => {
    // The activity feed dates a loan by the transaction that created it; a full
    // overwrite on repayment would move that date to the settlement.
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

  it('should write nothing on a repeated repayment either', async () => {
    const { mockFs, mockDocRef } = buildFirestore({ exists: true, storedIsRepaid: true })

    const result = await indexLoan({ ...parsedLoan, isRepaid: true }, mockFs)

    expect(mockDocRef.set).not.toHaveBeenCalled()
    expect(result.stored).toBe(false)
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
